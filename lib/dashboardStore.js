function createDashboardStore({ linearClient }) {
  let snapshot = createInitialSnapshot();
  let refreshPromise = null;
  const updateListeners = new Set();
  const errorListeners = new Set();

  return {
    getSnapshot() {
      return snapshot;
    },

    onUpdate(listener) {
      updateListeners.add(listener);
      return () => updateListeners.delete(listener);
    },

    onError(listener) {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },

    async refresh(reason, event = null) {
      if (refreshPromise) {
        return refreshPromise;
      }

      refreshPromise = linearClient
        .fetchWorkspaceSnapshot()
        .then((workspace) => {
          snapshot = buildDashboardSnapshot({ workspace, reason, event });
          for (const listener of updateListeners) {
            listener(snapshot);
          }
          return snapshot;
        })
        .catch((error) => {
          snapshot = {
            ...snapshot,
            sync: {
              ...snapshot.sync,
              status: "error",
              lastError: {
                message: error.message,
                at: new Date().toISOString(),
              },
            },
          };
          for (const listener of errorListeners) {
            listener(error);
          }
          throw error;
        })
        .finally(() => {
          refreshPromise = null;
        });

      snapshot = {
        ...snapshot,
        sync: {
          ...snapshot.sync,
          status: "syncing",
        },
      };

      return refreshPromise;
    },
  };
}

function createInitialSnapshot() {
  return {
    generatedAt: null,
    workspace: {
      title: "Linear room dashboard",
      viewer: null,
    },
    metrics: {
      totalIssues: 0,
      openIssues: 0,
      inProgressIssues: 0,
      completedIssues: 0,
      activeProjects: 0,
      teams: 0,
    },
    teams: [],
    assignees: [],
    recentIssues: [],
    projects: [],
    sync: {
      status: "idle",
      lastReason: null,
      lastEventType: null,
      lastSuccessAt: null,
      lastError: null,
    },
  };
}

function buildDashboardSnapshot({ workspace, reason, event }) {
  const issues = workspace.issues;
  const projects = workspace.projects;
  const teams = workspace.teams;

  const teamSummaries = teams
    .map((team) => {
      const teamIssues = issues.filter((issue) => issue.team?.id === team.id);
      const openIssues = teamIssues.filter((issue) => !isDone(issue)).length;
      const inProgress = teamIssues.filter((issue) => isInProgress(issue)).length;

      return {
        id: team.id,
        name: team.name,
        key: team.key,
        icon: team.icon,
        openIssues,
        inProgress,
        totalIssues: teamIssues.length,
      };
    })
    .sort((left, right) => right.openIssues - left.openIssues);

  const assigneeMap = new Map();
  for (const issue of issues.filter((item) => !isDone(item))) {
    const assigneeId = issue.assignee?.id || "unassigned";
    const current = assigneeMap.get(assigneeId) || {
      id: assigneeId,
      name:
        issue.assignee?.displayName ||
        issue.assignee?.name ||
        "Unassigned",
      issueCount: 0,
      highPriorityCount: 0,
    };

    current.issueCount += 1;
    if (Number(issue.priority) <= 2 && Number(issue.priority) > 0) {
      current.highPriorityCount += 1;
    }
    assigneeMap.set(assigneeId, current);
  }

  const recentIssues = issues
    .slice()
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))
    .slice(0, 12)
    .map((issue) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      teamName: issue.team?.name || "No team",
      assigneeName:
        issue.assignee?.displayName || issue.assignee?.name || "Unassigned",
      stateName: issue.state?.name || "Unknown",
      updatedAt: issue.updatedAt,
      priorityLabel: priorityLabel(issue.priority),
    }));

  const projectSummaries = projects
    .slice()
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))
    .slice(0, 8)
    .map((project) => ({
      id: project.id,
      name: project.name,
      state: project.state || "unknown",
      targetDate: project.targetDate,
      leadName:
        project.lead?.displayName || project.lead?.name || "No lead",
    }));

  return {
    generatedAt: workspace.generatedAt,
    workspace: {
      title: "Linear room dashboard",
      viewer: workspace.viewer,
    },
    metrics: {
      totalIssues: issues.length,
      openIssues: issues.filter((issue) => !isDone(issue)).length,
      inProgressIssues: issues.filter((issue) => isInProgress(issue)).length,
      completedIssues: issues.filter((issue) => isDone(issue)).length,
      activeProjects: projects.filter((project) =>
        String(project.state || "").toLowerCase().includes("active"),
      ).length,
      teams: teams.length,
    },
    teams: teamSummaries,
    assignees: Array.from(assigneeMap.values()).sort(
      (left, right) => right.issueCount - left.issueCount,
    ),
    recentIssues,
    projects: projectSummaries,
    sync: {
      status: "ready",
      lastReason: reason,
      lastEventType: event?.type || null,
      lastSuccessAt: new Date().toISOString(),
      lastError: null,
    },
  };
}

function isDone(issue) {
  const type = String(issue.state?.type || "").toLowerCase();
  return type === "completed" || type === "canceled";
}

function isInProgress(issue) {
  const type = String(issue.state?.type || "").toLowerCase();
  return type === "started" || type === "inprogress";
}

function priorityLabel(priority) {
  switch (Number(priority)) {
    case 1:
      return "Urgent";
    case 2:
      return "High";
    case 3:
      return "Normal";
    case 4:
      return "Low";
    default:
      return "None";
  }
}

module.exports = {
  createDashboardStore,
};
