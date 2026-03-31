const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

function createLinearClient({ apiKey }) {
  return {
    async fetchWorkspaceSnapshot() {
      if (!apiKey) {
        throw new Error("LINEAR_API_KEY is missing. Add it to your .env file.");
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
          lead {
            name
            displayName
          }
        `,
      });

      const issues = await paginateConnection({
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

      return {
        viewer: viewer.viewer,
        teams,
        projects,
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
