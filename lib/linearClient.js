const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

function createLinearClient({ apiKey, initiativeName }) {
  return {
    async fetchWorkspaceSnapshot() {
      if (!apiKey) {
        throw new Error("LINEAR_API_KEY is missing. Add it to your .env file.");
      }

      if (!initiativeName) {
        throw new Error(
          "LINEAR_INITIATIVE_NAME is missing. Add it to your .env file.",
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
          `Linear initiative "${initiativeName}" was not found in this workspace.`,
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
        pageSize: 50,
        nodeFields: `
          id
          name
          state
          targetDate
          updatedAt
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

  if (!response.ok) {
    throw new Error(`Linear API request failed with status ${response.status}.`);
  }

  const payload = await response.json();

  if (payload.errors?.length) {
    const message = payload.errors.map((error) => error.message).join("; ");
    throw new Error(`Linear GraphQL error: ${message}`);
  }

  return payload.data;
}

module.exports = {
  createLinearClient,
};
