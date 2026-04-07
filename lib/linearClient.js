const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

function createLinearClient({ apiKey, initiativeName }) {
  return {
    async fetchWorkspaceSnapshot() {
      if (!apiKey) {
        throw new Error("LINEAR_API_KEY nao foi definida. Adicione-a ao arquivo .env.");
      }

      if (!initiativeName) {
        throw new Error(
          "LINEAR_INITIATIVE_NAME nao foi definida. Adicione-a ao arquivo .env.",
        );
      }

      const viewer = await fetchGraphql(
        apiKey,
        `
          query ViewerQuery {
            viewer {
              id
              name
              displayName
            }
          }
        `,
      );

      const initiatives = await paginateConnection({
        apiKey,
        rootField: "initiatives",
        pageSize: 50,
        nodeFields: `
          id
          name
        `,
      });

      const targetInitiative = initiatives.find(
        (initiative) =>
          String(initiative.name || "").toLowerCase() ===
          String(initiativeName).toLowerCase(),
      );

      if (!targetInitiative) {
        throw new Error(
          `A iniciativa "${initiativeName}" nao foi encontrada neste workspace do Linear.`,
        );
      }

      const teams = await paginateConnection({
        apiKey,
        rootField: "teams",
        pageSize: 50,
        nodeFields: `
          id
          name
          key
          icon
        `,
      });

      const projects = await paginateConnection({
        apiKey,
        rootField: "projects",
        pageSize: 25,
        nodeFields: `
          id
          name
          state
          status {
            name
          }
          startDate
          targetDate
          createdAt
          completedAt
          updatedAt
          labels {
            nodes {
              id
              name
            }
          }
          projectMilestones {
            nodes {
              id
              name
              sortOrder
              createdAt
              targetDate
              updatedAt
            }
          }
          initiatives {
            nodes {
              id
              name
            }
          }
          lead {
            name
            displayName
          }
        `,
      });

      const filteredProjects = projects.filter((project) =>
        project.initiatives?.nodes?.some(
          (initiative) => initiative.id === targetInitiative.id,
        ),
      );

      const filteredProjectIds = new Set(
        filteredProjects.map((project) => project.id),
      );

      const allIssues = await paginateConnection({
        apiKey,
        rootField: "issues",
        pageSize: 100,
        nodeFields: `
          id
          identifier
          title
          priority
          createdAt
          startedAt
          dueDate
          completedAt
          updatedAt
          state {
            name
            type
          }
          team {
            id
            name
            key
          }
          assignee {
            id
            name
            displayName
          }
          project {
            id
            name
          }
          projectMilestone {
            id
            name
          }
        `,
      });

      const issues = allIssues.filter((issue) =>
        filteredProjectIds.has(issue.project?.id),
      );

      const teamIds = new Set(
        issues.map((issue) => issue.team?.id).filter(Boolean),
      );
      const filteredTeams = teams.filter((team) => teamIds.has(team.id));

      return {
        viewer: viewer.viewer,
        initiative: targetInitiative,
        teams: filteredTeams,
        projects: filteredProjects,
        issues,
        generatedAt: new Date().toISOString(),
      };
    },
  };
}

async function paginateConnection({ apiKey, rootField, pageSize, nodeFields }) {
  const nodes = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const response = await fetchGraphql(
      apiKey,
      `
        query PaginatedQuery($first: Int!, $after: String) {
          ${rootField}(first: $first, after: $after) {
            nodes {
              ${nodeFields}
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      { first: pageSize, after: cursor },
    );

    const connection = response[rootField];
    nodes.push(...connection.nodes);
    hasNextPage = connection.pageInfo.hasNextPage;
    cursor = connection.pageInfo.endCursor;
  }

  return nodes;
}

async function fetchGraphql(apiKey, query, variables = {}) {
  const response = await fetch(LINEAR_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const details = payload?.errors?.map((error) => error.message).join("; ");
    throw new Error(
      details
        ? `A requisicao para a API do Linear falhou com status ${response.status}: ${details}`
        : `A requisicao para a API do Linear falhou com status ${response.status}.`,
    );
  }

  if (payload?.errors?.length) {
    const message = payload.errors.map((error) => error.message).join("; ");
    throw new Error(`Erro do GraphQL do Linear: ${message}`);
  }

  return payload.data;
}

module.exports = {
  createLinearClient,
};
