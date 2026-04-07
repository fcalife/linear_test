const metricsEl = document.getElementById("metrics");
const assigneesEl = document.getElementById("assignees");
const recentIssuesEl = document.getElementById("recent-issues");
const projectsEl = document.getElementById("projects");
const roadmapEl = document.getElementById("roadmap");
const roadmapMetaEl = document.getElementById("roadmap-meta");
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
    syncStatusEl.textContent = "Erro de sincronizacao";
    syncMetaEl.textContent = payload.message;
  });
}

function render(payload) {
  const metrics = [
    ["Total de issues", payload.metrics.totalIssues],
    ["Issues em aberto", payload.metrics.openIssues],
    ["Em andamento", payload.metrics.inProgressIssues],
    ["Concluidas", payload.metrics.completedIssues],
    ["Projetos ativos", payload.metrics.activeProjects],
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

  assigneesEl.innerHTML = renderList(
    payload.assignees.slice(0, 10),
    (assignee) => `
      <div class="item">
        <div class="item-row">
          <p class="item-title">${escapeHtml(assignee.name)}</p>
          <span class="pill">${escapeHtml(String(assignee.issueCount))} abertas</span>
        </div>
        <p class="item-meta">${escapeHtml(String(assignee.highPriorityCount))} urgentes/de alta prioridade</p>
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
    `<tr><td colspan="6" class="empty">Ainda nao ha dados de issues.</td></tr>`,
  );

  roadmapEl.innerHTML = renderRoadmap(payload.roadmap);
  roadmapMetaEl.textContent = buildRoadmapMeta(payload.roadmap);
  projectsEl.innerHTML = renderProjectTimeline(payload.projectTimeline);

  syncStatusEl.textContent =
    payload.sync.status === "ready"
      ? "Ao vivo"
      : payload.sync.status === "syncing"
        ? "Sincronizando"
        : payload.sync.status === "error"
          ? "Erro"
          : "Inativo";

  if (payload.sync.lastError) {
    syncMetaEl.textContent = payload.sync.lastError.message;
  } else if (payload.sync.lastSuccessAt) {
    syncMetaEl.textContent = `Ultima sincronizacao em ${formatDateTime(payload.sync.lastSuccessAt)} via ${translateSyncReason(payload.sync.lastReason)}.`;
  } else {
    syncMetaEl.textContent = "Aguardando a primeira sincronizacao bem-sucedida.";
  }
}

function renderRoadmap(roadmap) {
  if (roadmap?.error) {
    return `<p class="empty">${escapeHtml(roadmap.error)}</p>`;
  }

  if (!roadmap?.items?.length) {
    return `<p class="empty">Preencha o arquivo roadmap.txt para exibir a sequencia do roadmap.</p>`;
  }

  return `
    <div class="roadmap-strip">
      ${roadmap.items.map((item, index) => renderRoadmapItem(item, index, roadmap.items.length)).join("")}
    </div>
  `;
}

function renderRoadmapItem(item, index, total) {
  const classes = [
    "roadmap-item",
    item.status === "in_progress" ? "is-in-progress" : "",
    item.status === "completed" ? "is-complete" : "",
    item.status === "missing" ? "is-missing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const statusText =
    item.status === "in_progress"
      ? `${item.progress}% concluido`
      : item.status === "completed"
        ? "Concluido"
        : item.status === "missing"
          ? item.message || "Nao encontrado"
          : "Planejado";
  const progressBar =
    item.status === "in_progress" || item.status === "completed"
      ? `
        <div class="roadmap-progress" aria-hidden="true">
          <div class="roadmap-progress-fill" style="width:${Math.max(0, Math.min(item.progress ?? 0, 100))}%;"></div>
        </div>
      `
      : "";

  const connector =
    index < total - 1
      ? `<img class="roadmap-connector" src="/assets/arrow.png" alt="" aria-hidden="true">`
      : "";
  return `
    <div class="roadmap-node">
      <article class="${classes}">
        <h3 class="roadmap-title">${escapeHtml(item.title)}</h3>
        <p class="roadmap-date">${escapeHtml(formatRoadmapStart(item.startDate))}</p>
        <p class="roadmap-status">${escapeHtml(statusText)}</p>
        ${progressBar}
      </article>
      ${connector}
    </div>
  `;
}

function buildRoadmapMeta(roadmap) {
  if (roadmap?.error) {
    return "Corrija o arquivo de configuracao do roadmap";
  }

  const configured = roadmap?.totalConfigured || 0;
  const unresolved = roadmap?.unresolvedCount || 0;

  if (!configured) {
    return "Definido manualmente via roadmap.txt";
  }

  if (!unresolved) {
    return "";
  }

  return `${configured} itens configurados, ${unresolved} nao encontrados`;
}

function renderProjectTimeline(timeline) {
  if (!timeline?.sections?.length) {
    return `<p class="empty">Nenhuma iniciativa com status relevante para exibir.</p>`;
  }

  const boundsText =
    timeline.timelineStart && timeline.timelineEnd
      ? `Linha do tempo compartilhada de ${formatDate(timeline.timelineStart)} ate ${formatDate(timeline.timelineEnd)}.`
      : "Aguardando datas suficientes para desenhar a linha do tempo.";

  const mappingNotice = timeline.hasMappings
    ? ""
    : `<p class="timeline-note">As fases ja estao estruturadas. Assim que voce enviar a lista das issues por fase, eu conecto os intervalos reais de inicio e termino.</p>`;

  return `
    <div class="timeline-board">
      <div class="timeline-board-head">
        <p class="timeline-caption">${escapeHtml(boundsText)}</p>
        ${mappingNotice}
      </div>
      ${timeline.sections.map((section) => renderProjectSection(section, timeline)).join("")}
    </div>
  `;
}

function renderProjectSection(section, timeline) {
  return `
    <section class="timeline-section">
      <div class="timeline-section-head">
        <h3>${escapeHtml(section.title)}</h3>
        <span class="panel-meta">${escapeHtml(String(section.projects.length))} iniciativas</span>
      </div>
      <div class="timeline-scroll">
        <div class="timeline-axis">
          ${renderAxis(timeline.timelineStart, timeline.timelineEnd)}
        </div>
        <div class="timeline-rows">
          ${section.projects.map((project) => renderProjectRow(project, timeline)).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderAxis(start, end) {
  if (!start || !end) {
    return `<div class="timeline-axis-fallback">Sem eixo temporal compartilhado disponivel.</div>`;
  }

  const ticks = buildAxisTicks(start, end, 6);
  return ticks
    .map(
      (tick) => `
        <div class="timeline-tick" style="left:${tick.position}%;">
          <span>${escapeHtml(formatDate(tick.date))}</span>
        </div>
      `,
    )
    .join("");
}

function renderProjectRow(project, timeline) {
  const laidOutPhases = layoutProjectPhases(project, timeline);
  const laneCount = Math.max(
    laidOutPhases.reduce((max, phase) => Math.max(max, phase.lane + 1), 0),
    1,
  );
  const summaryMarkup = project.isSubproject
    ? `
        <p class="project-parent">${escapeHtml(project.parentName)}</p>
        <p class="project-name">${escapeHtml(project.subprojectName || project.name)}</p>
      `
    : `<p class="project-name">${escapeHtml(project.name)}</p>`;

  return `
    <article class="project-row project-row-lanes-${laneCount}">
      <div class="project-summary">
        ${summaryMarkup}
      </div>
      <div class="project-track" style="min-height:${laneCount * 58 + 18}px;">
        ${laidOutPhases.map((phase) => renderPhase(phase, timeline)).join("")}
      </div>
    </article>
  `;
}

function renderPhase(phase, timeline) {
  if (!phase.foundIssues) {
    return "";
  }

  const classes = [
    "phase-chip",
    phase.completed ? "is-complete" : "is-pending",
    phase.phaseNumber % 2 === 0 ? "is-even-phase" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const style = `left:${phase.left}%;width:${phase.width}%;top:${12 + phase.lane * 58}px;`;

  const dates = phase.startedAt || phase.endedAt
    ? `${formatDate(phase.startedAt || phase.endedAt)} - ${formatDate(phase.endedAt || phase.startedAt)}`
    : "Sem datas encontradas";

  return `
    <div class="${classes}" style="${style}">
      <span class="phase-name">${escapeHtml(phase.name)}</span>
      <span class="phase-meta">${escapeHtml(dates)}</span>
    </div>
  `;
}

function layoutProjectPhases(project, timeline) {
  const visiblePhases = project.phases
    .map((phase, index) => ({
      ...phase,
      phaseNumber: index + 1,
    }))
    .filter((phase) => phase.foundIssues)
    .map((phase) => {
      const start = phase.startedAt || project.timelineStart || timeline.timelineStart;
      const end = phase.endedAt || phase.startedAt || project.timelineEnd || timeline.timelineEnd;
      const left = getPosition(start, timeline);
      const right = Math.max(getPosition(end, timeline), left + 4);

      return {
        ...phase,
        left,
        width: right - left,
        right,
      };
    })
    .sort((left, right) => left.left - right.left || left.right - right.right);

  const laneEnds = [];

  for (const phase of visiblePhases) {
    let lane = 0;
    while (lane < laneEnds.length && phase.left < laneEnds[lane]) {
      lane += 1;
    }

    phase.lane = lane;
    laneEnds[lane] = phase.right + 1;
  }

  return visiblePhases;
}

function getPosition(date, timeline) {
  if (!date || !timeline.timelineStart || !timeline.timelineEnd) {
    return 0;
  }

  const start = new Date(timeline.timelineStart).getTime();
  const end = new Date(timeline.timelineEnd).getTime();
  const current = new Date(date).getTime();

  if (end <= start) {
    return 0;
  }

  return ((current - start) / (end - start)) * 100;
}

function buildAxisTicks(start, end, segments) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();

  if (endMs <= startMs) {
    return [{ date: start, position: 0 }];
  }

  return Array.from({ length: segments + 1 }, (_, index) => {
    const ratio = index / segments;
    return {
      date: new Date(startMs + (endMs - startMs) * ratio).toISOString(),
      position: ratio * 100,
    };
  });
}

function renderList(items, renderItem, emptyMarkup = `<p class="empty">Ainda nao ha dados.</p>`) {
  if (!items.length) {
    return emptyMarkup;
  }
  return items.map(renderItem).join("");
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("pt-BR");
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatRoadmapStart(value) {
  if (!value) {
    return "Inicio: sem data";
  }

  const formatted = new Date(value)
    .toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
    })
    .replace(".", "");

  return `Inicio: ${formatted}`;
}

function translateSyncReason(value) {
  switch (value) {
    case "startup":
      return "inicializacao";
    case "polling":
      return "atualizacao automatica";
    case "webhook":
      return "webhook";
    default:
      return "origem desconhecida";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
