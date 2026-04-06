const PROJECT_PHASES = [
  "Ideacao",
  "Definicao",
  "Briefing design",
  "Prototipo",
  "Revisao prototipo",
  "Briefing tecnico",
  "Implementacao",
  "Integracao",
  "Revisao final",
  "Deploy",
];

const PROJECT_PHASE_DEFINITIONS = [
  {
    key: "Ideacao",
    issueNames: ["ideacao"],
    completionMode: "single",
    startsAt: "project_created",
  },
  {
    key: "Definicao",
    issueNames: ["definicao"],
    completionMode: "single",
    startsAt: "previous_end",
  },
  {
    key: "Briefing design",
    issueNames: ["briefing design"],
    completionMode: "single",
    startsAt: "previous_end",
  },
  {
    key: "Prototipo",
    issueNames: ["design"],
    completionMode: "single",
    startsAt: "previous_end",
  },
  {
    key: "Revisao prototipo",
    issueNames: ["review design + produto"],
    completionMode: "single",
    startsAt: "previous_end",
  },
  {
    key: "Briefing tecnico",
    issueNames: ["briefing tecnico"],
    completionMode: "single",
    startsAt: "previous_end",
  },
  {
    key: "Implementacao",
    issueNames: ["front-end", "back-end"],
    completionMode: "all",
    startsAt: "previous_end",
  },
  {
    key: "Integracao",
    issueNames: ["integracao"],
    completionMode: "single",
    startsAt: "previous_end",
  },
  {
    key: "Revisao final",
    issueNames: ["review engenharia + produto"],
    completionMode: "single",
    startsAt: "previous_end",
  },
  {
    key: "Deploy",
    issueNames: ["deploy"],
    completionMode: "single",
    startsAt: "previous_end",
  },
];

module.exports = {
  PROJECT_PHASES,
  PROJECT_PHASE_DEFINITIONS,
};
