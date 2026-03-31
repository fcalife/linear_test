const metricsEl = document.getElementById("metrics");
const teamsEl = document.getElementById("teams");
const assigneesEl = document.getElementById("assignees");
const recentIssuesEl = document.getElementById("recent-issues");
const projectsEl = document.getElementById("projects");
const teamCountEl = document.getElementById("team-count");
const syncStatusEl = document.getElementById("sync-status");
const syncMetaEl = document.getElementById("sync-meta");

init();

async function init() {
  await refreshDashboard();
  connectEvents();
  setInterval(refreshDashboard, 60000);
}

async function refreshDashboard() {
  const response = await fetch("/api/dashboard");
  const payload = await response.json();
  render(payload);
}

function connectEvents() {
  const source = new EventSource("/api/events");
  source.addEventListener("dashboard", (event) => {
    render(JSON.parse(event.data));
  });
  source.addEventListener("sync-error", (event) => {
    const payload = JSON.parse(event.data);
    syncStatusEl.textContent = "Sync error";
    syncMetaEl.textContent = payload.message;
  });
}

function render(payload) {
  const metrics = [
    ["Total issues", payload.metrics.totalIssues],
    ["Open issues", payload.metrics.openIssues],
    ["In progress", payload.metrics.inProgressIssues],
    ["Completed", payload.metrics.completedIssues],
    ["Active projects", payload.metrics.activeProjects],
    ["Teams", payload.metrics.teams],
  ];

  metricsEl.innerHTML = metrics
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <p class="metric-label">${escapeHtml(label)}</p>
          <p class="metric-value">${escapeHtml(String(value))}</p>
        </article>
      `,
    )
    .join("");

  teamCountEl.textContent = `${payload.teams.length} teams`;
  teamsEl.innerHTML = renderList(
    payload.teams,
    (team) => `
      <div class="item">
        <div class="item-row">
          <div>
            <p class="item-title">${escapeHtml(team.name)}</p>
            <p class="item-meta">${escapeHtml(team.key || "No key")}</p>
          </div>
          <span class="pill">${escapeHtml(String(team.openIssues))} open</span>
        </div>
        <p class="item-meta">${escapeHtml(String(team.inProgress))} in progress · ${escapeHtml(String(team.totalIssues))} total</p>
      </div>
    `,
  );

  assigneesEl.innerHTML = renderList(
    payload.assignees.slice(0, 10),
    (assignee) => `
      <div class="item">
        <div class="item-row">
          <p class="item-title">${escapeHtml(assignee.name)}</p>
          <span class="pill">${escapeHtml(String(assignee.issueCount))} open</span>
        </div>
        <p class="item-meta">${escapeHtml(String(assignee.highPriorityCount))} urgent/high priority</p>
      </div>
    `,
  );

  recentIssuesEl.innerHTML = renderList(
    payload.recentIssues,
    (issue) => `
      <tr>
        <td><strong>${escapeHtml(issue.identifier)}</strong> ${escapeHtml(issue.title)}</td>
        <td>${escapeHtml(issue.teamName)}</td>
        <td>${escapeHtml(issue.assigneeName)}</td>
        <td>${escapeHtml(issue.stateName)}</td>
        <td>${escapeHtml(issue.priorityLabel)}</td>
        <td class="dim">${escapeHtml(formatDateTime(issue.updatedAt))}</td>
      </tr>
    `,
    `<tr><td colspan="6" class="empty">No issue data yet.</td></tr>`,
  );

  projectsEl.innerHTML = renderList(
    payload.projects,
    (project) => `
      <div class="item">
        <div class="item-row">
          <p class="item-title">${escapeHtml(project.name)}</p>
          <span class="pill">${escapeHtml(project.state)}</span>
        </div>
        <p class="item-meta">Lead: ${escapeHtml(project.leadName)}</p>
        <p class="item-meta">Target: ${escapeHtml(project.targetDate || "No target date")}</p>
      </div>
    `,
  );

  syncStatusEl.textContent =
    payload.sync.status === "ready"
      ? "Live"
      : payload.sync.status === "syncing"
        ? "Syncing"
        : payload.sync.status === "error"
          ? "Error"
          : "Idle";

  if (payload.sync.lastError) {
    syncMetaEl.textContent = payload.sync.lastError.message;
  } else if (payload.sync.lastSuccessAt) {
    syncMetaEl.textContent = `Last sync ${formatDateTime(payload.sync.lastSuccessAt)} via ${payload.sync.lastReason}.`;
  } else {
    syncMetaEl.textContent = "Waiting for first successful sync.";
  }
}

function renderList(items, renderItem, emptyMarkup = `<p class="empty">No data yet.</p>`) {
  if (!items.length) {
    return emptyMarkup;
  }
  return items.map(renderItem).join("");
}

function formatDateTime(value) {
  return new Date(value).toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
