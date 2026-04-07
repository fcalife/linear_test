const {
  PROJECT_PHASES,
  PROJECT_PHASE_DEFINITIONS,
} = require("./projectPhaseConfig");
const { loadRoadmapConfig } = require("./roadmapConfig");

function createDashboardStore({ linearClient, roadmapConfigPath }) {
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
          const roadmapConfig = roadmapConfigPath
            ? loadRoadmapConfig(roadmapConfigPath)
            : { entries: [], error: null };
          snapshot = buildDashboardSnapshot({
            workspace,
            roadmapConfig,
            reason,
            event,
          });
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
      title: "Painel Allevo",
      viewer: null,
      initiative: null,
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
    roadmap: {
      items: [],
      totalConfigured: 0,
      unresolvedCount: 0,
      error: null,
    },
    projectTimeline: {
      sections: [],
      phases: PROJECT_PHASES,
      timelineStart: null,
      timelineEnd: null,
      hasMappings: true,
    },
    sync: {
      status: "idle",
      lastReason: null,
      lastEventType: null,
      lastSuccessAt: null,
      lastError: null,
    },
  };
}

function buildDashboardSnapshot({ workspace, roadmapConfig, reason, event }) {
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
        "Nao atribuido",
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
      teamName: issue.team?.name || "Sem time",
      assigneeName:
        issue.assignee?.displayName || issue.assignee?.name || "Nao atribuido",
      stateName: issue.state?.name || "Desconhecido",
      updatedAt: issue.updatedAt,
      priorityLabel: priorityLabel(issue.priority),
    }));

  const projectTimeline = buildProjectTimeline({ projects, issues });
  const roadmap = buildRoadmap({ projects, issues, roadmapConfig });

  return {
    generatedAt: workspace.generatedAt,
    workspace: {
      title: "Painel Allevo",
      viewer: workspace.viewer,
      initiative: workspace.initiative,
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
    roadmap,
    projectTimeline,
    sync: {
      status: "ready",
      lastReason: reason,
      lastEventType: event?.type || null,
      lastSuccessAt: new Date().toISOString(),
      lastError: null,
    },
  };
}

function buildRoadmap({ projects, issues, roadmapConfig }) {
  const entries = roadmapConfig?.entries || [];
  const items = entries.map((entry, index) =>
    buildRoadmapItem({
      entry,
      index,
      projects,
      issues,
    }),
  );

  return {
    items,
    totalConfigured: entries.length,
    unresolvedCount: items.filter((item) => item.isMissing).length,
    error: roadmapConfig?.error || null,
  };
}

function buildRoadmapItem({ entry, index, projects, issues }) {
  const project = projects.find(
    (item) => normalizeComparableName(item.name) === normalizeComparableName(entry.projectName),
  );

  if (!project) {
    return buildMissingRoadmapItem({
      entry,
      index,
      message: "Projeto nao encontrado no Linear.",
    });
  }

  if (entry.type === "project") {
    const projectIssues = issues.filter((issue) => issue.project?.id === project.id);
    return createRoadmapPayload({
      id: project.id,
      kind: "project",
      title: formatProjectName(project.name),
      projectTitle: formatProjectName(project.name),
      startDate:
        entry.manualStartDate ||
        project.startDate ||
        minDate(projectIssues.map((issue) => issue.createdAt).filter(Boolean)) ||
        project.createdAt ||
        null,
      status: deriveEntryStatusGroup({ project, issues: projectIssues }) || "planned",
      progress: calculateProgress(projectIssues),
    });
  }

  const milestone = (project.projectMilestones?.nodes || []).find(
    (item) => normalizeComparableName(item.name) === normalizeComparableName(entry.milestoneName),
  );

  if (!milestone) {
    return buildMissingRoadmapItem({
      entry,
      index,
      message: "Milestone nao encontrada no Linear.",
    });
  }

  const milestoneIssues = issues.filter(
    (issue) =>
      issue.project?.id === project.id && issue.projectMilestone?.id === milestone.id,
  );

  return createRoadmapPayload({
    id: `${project.id}:${milestone.id}`,
    kind: "milestone",
    title: formatProjectName(milestone.name),
    projectTitle: formatProjectName(project.name),
    startDate:
      entry.manualStartDate ||
      minDate(
        milestoneIssues
          .flatMap((issue) => [issue.startedAt, issue.createdAt])
          .filter(Boolean),
      ) ||
      project.startDate ||
      milestone.createdAt ||
      project.createdAt ||
      null,
    status: deriveEntryStatusGroup({ project, issues: milestoneIssues }) || "planned",
    progress: calculateProgress(milestoneIssues),
  });
}

function createRoadmapPayload({
  id,
  kind,
  title,
  projectTitle,
  startDate,
  status,
  progress,
}) {
  return {
    id,
    kind,
    title,
    projectTitle,
    startDate,
    status,
    progress,
    isMissing: false,
  };
}

function buildMissingRoadmapItem({ entry, index, message }) {
  return {
    id: `missing:${entry.type}:${index}`,
    kind: entry.type,
    title:
      entry.type === "milestone"
        ? `${entry.projectName} > ${entry.milestoneName}`
        : entry.projectName,
    projectTitle: entry.projectName,
    startDate: null,
    status: "missing",
    progress: null,
    isMissing: true,
    message,
  };
}

function buildProjectTimeline({ projects, issues }) {
  const eligibleProjects = projects
    .filter((project) => hasProjectLabel(project, "Nova iniciativa"))
    .flatMap((project) => buildTimelineEntries({ project, issues }))
    .filter((project) => project.statusGroup !== null);

  const datedProjects = eligibleProjects.filter(
    (project) => project.timelineStart && project.timelineEnd,
  );

  const timelineStart = datedProjects.length
    ? datedProjects.reduce((current, project) =>
        new Date(project.timelineStart) < new Date(current)
          ? project.timelineStart
          : current,
      datedProjects[0].timelineStart)
    : null;

  const timelineEnd = datedProjects.length
    ? datedProjects.reduce((current, project) =>
        new Date(project.timelineEnd) > new Date(current)
          ? project.timelineEnd
          : current,
      datedProjects[0].timelineEnd)
    : null;

  const sections = [
    createProjectSection("Em andamento", "in_progress", eligibleProjects),
    createProjectSection("Planejado", "planned", eligibleProjects),
    createProjectSection("Concluido", "completed", eligibleProjects),
  ].filter((section) => section.projects.length > 0);

  return {
    sections,
    phases: PROJECT_PHASES,
    timelineStart,
    timelineEnd,
    hasMappings: true,
  };
}

function createProjectSection(title, statusGroup, projects) {
  return {
    id: statusGroup,
    title,
    projects: projects
      .filter((project) => project.statusGroup === statusGroup)
      .sort((left, right) => {
        if (left.parentName !== right.parentName) {
          return left.parentName.localeCompare(right.parentName);
        }

        if (left.rowOrder !== right.rowOrder) {
          return left.rowOrder - right.rowOrder;
        }

        const leftDate = left.timelineStart || left.projectStart || left.updatedAt;
        const rightDate = right.timelineStart || right.projectStart || right.updatedAt;
        return new Date(leftDate) - new Date(rightDate);
      }),
  };
}

function buildTimelineEntries({ project, issues }) {
  const projectIssues = issues.filter((issue) => issue.project?.id === project.id);
  const milestones = project.projectMilestones?.nodes || [];

  if (!milestones.length) {
    return [
      buildTimelineEntry({
        project,
        issues: projectIssues,
        statusGroup: normalizeProjectStatus(project.state),
      }),
    ];
  }

  return milestones.map((milestone, index) => {
    const milestoneIssues = projectIssues.filter(
      (issue) => issue.projectMilestone?.id === milestone.id,
    );
    const sortOrder = Number(milestone.sortOrder);

    return buildTimelineEntry({
      project,
      milestone,
      issues: milestoneIssues,
      statusGroup: deriveEntryStatusGroup({
        project,
        issues: milestoneIssues,
      }),
      rowOrder: Number.isFinite(sortOrder) ? sortOrder : index,
    });
  });
}

function buildTimelineEntry({
  project,
  issues,
  milestone = null,
  statusGroup,
  rowOrder = 0,
}) {
  const phases = [];
  let previousPhaseEnd = null;
  const startAnchor = milestone?.createdAt || project.startDate || project.createdAt || null;
  const endAnchor =
    milestone?.targetDate ||
    project.completedAt ||
    project.targetDate ||
    milestone?.updatedAt ||
    project.updatedAt ||
    null;

  for (const phaseDefinition of PROJECT_PHASE_DEFINITIONS) {
    const phaseIssues = findPhaseIssues(phaseDefinition, issues);
    const startedAt =
      phaseDefinition.startsAt === "project_created"
        ? startAnchor
        : previousPhaseEnd;
    const endedAt = getPhaseEndDate(phaseDefinition, phaseIssues);
    const foundIssueCount = phaseIssues.filter(Boolean).length;
    const hasScheduledEnd = Boolean(endedAt);
    const completed = Boolean(
      foundIssueCount > 0 &&
      phaseIssues.every((issue) => issue && isDone(issue)),
    );

    phases.push({
      name: phaseDefinition.key,
      startedAt,
      endedAt,
      completed,
      issueCount: foundIssueCount,
      foundIssues: foundIssueCount > 0,
      hasScheduledEnd,
    });

    previousPhaseEnd = endedAt || previousPhaseEnd;
  }

  const datedPhases = phases.filter((phase) => phase.startedAt || phase.endedAt);
  const timelineStart =
    minDate(
      datedPhases
        .flatMap((phase) => [phase.startedAt, phase.endedAt])
        .filter(Boolean),
    ) ||
    startAnchor ||
    null;
  const timelineEnd =
    maxDate(
      datedPhases
        .flatMap((phase) => [phase.endedAt, phase.startedAt])
        .filter(Boolean),
    ) ||
    endAnchor ||
    null;

  return {
    id: milestone ? `${project.id}:${milestone.id}` : project.id,
    name: milestone ? formatProjectName(milestone.name) : formatProjectName(project.name),
    parentName: formatProjectName(project.name),
    subprojectName: milestone ? formatProjectName(milestone.name) : null,
    isSubproject: Boolean(milestone),
    state: getProjectStatusLabel(project),
    statusGroup,
    projectStart: startAnchor,
    projectEnd: endAnchor,
    updatedAt: project.updatedAt,
    timelineStart,
    timelineEnd,
    rowOrder,
    phases,
  };
}

function formatProjectName(value) {
  return String(value || "").replace(/^Allevo:\s*/i, "").trim();
}

function normalizeComparableName(value) {
  return normalizeText(formatProjectName(value));
}

function normalizeProjectStatus(value) {
  const state = String(value || "").toLowerCase().trim();

  if (
    state === "started" ||
    state === "active" ||
    state === "in progress" ||
    state === "in_progress"
  ) {
    return "in_progress";
  }

  if (state === "planned") {
    return "planned";
  }

  if (state === "completed") {
    return "completed";
  }

  return null;
}

function getProjectStatusLabel(project) {
  if (project.status?.name) {
    return project.status.name;
  }

  if (typeof project.state === "string") {
    return project.state;
  }

  return "desconhecido";
}

function deriveEntryStatusGroup({ project, issues }) {
  if (!issues.length) {
    return normalizeProjectStatus(project.state);
  }

  if (issues.every((issue) => isDone(issue))) {
    return "completed";
  }

  if (issues.some((issue) => isDone(issue) || isInProgress(issue))) {
    return "in_progress";
  }

  return "planned";
}

function findPhaseIssues(phaseDefinition, issues) {
  return phaseDefinition.issueNames.map((issueName) =>
    issues.find((issue) => normalizeText(issue.title) === normalizeText(issueName)),
  );
}

function getPhaseEndDate(phaseDefinition, issues) {
  if (phaseDefinition.completionMode === "single") {
    const issue = issues[0];
    if (!issue) {
      return null;
    }

    return getIssueCompletedDate(issue) || issue.dueDate || null;
  }

  if (phaseDefinition.completionMode === "all") {
    if (!issues.length || issues.some((issue) => !issue)) {
      return null;
    }

    if (issues.every((issue) => isDone(issue))) {
      return maxDate(issues.map((issue) => getIssueCompletedDate(issue)).filter(Boolean));
    }

    const dueDates = issues.map((issue) => issue.dueDate).filter(Boolean);
    return dueDates.length === issues.length ? maxDate(dueDates) : null;
  }

  return null;
}

function minDate(values) {
  if (!values.length) {
    return null;
  }

  return values.reduce((current, value) =>
    new Date(value) < new Date(current) ? value : current,
  values[0]);
}

function maxDate(values) {
  if (!values.length) {
    return null;
  }

  return values.reduce((current, value) =>
    new Date(value) > new Date(current) ? value : current,
  values[0]);
}

function completedLikeDate(issue) {
  return isDone(issue) ? issue.updatedAt : null;
}

function getIssueCompletedDate(issue) {
  return issue.completedAt || completedLikeDate(issue);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isDone(issue) {
  const type = String(issue.state?.type || "").toLowerCase();
  return type === "completed" || type === "canceled";
}

function isInProgress(issue) {
  const type = String(issue.state?.type || "").toLowerCase();
  return type === "started" || type === "inprogress";
}

function calculateProgress(issues) {
  const relevantIssues = issues.filter((issue) => !isCanceled(issue));

  if (!relevantIssues.length) {
    return 0;
  }

  const completedIssues = relevantIssues.filter((issue) => isDone(issue)).length;
  return Math.round((completedIssues / relevantIssues.length) * 100);
}

function isCanceled(issue) {
  const type = String(issue.state?.type || "").toLowerCase();
  return type === "canceled";
}

function priorityLabel(priority) {
  switch (Number(priority)) {
    case 1:
      return "Urgente";
    case 2:
      return "Alta";
    case 3:
      return "Normal";
    case 4:
      return "Baixa";
    default:
      return "Nenhuma";
  }
}

module.exports = {
  createDashboardStore,
};

function hasProjectLabel(project, labelName) {
  return Boolean(
    project.labels?.nodes?.some(
      (label) => normalizeText(label.name) === normalizeText(labelName),
    ),
  );
}
