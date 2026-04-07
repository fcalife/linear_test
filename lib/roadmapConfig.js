const fs = require("node:fs");

function loadRoadmapConfig(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      entries: [],
      error: null,
    };
  }

  const content = fs.readFileSync(filePath, "utf8");
  return parseRoadmapConfig(content);
}

function parseRoadmapConfig(content) {
  const entries = [];
  const lines = String(content || "").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      return {
        entries: [],
        error: `Linha ${index + 1}: use "project: Nome do projeto" ou "milestone: Projeto > Milestone".`,
      };
    }

    const type = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    const { mainValue, manualStartDate, error } = parseEntryOptions(value, index + 1);

    if (error) {
      return {
        entries: [],
        error,
      };
    }

    if (type === "project") {
      if (!mainValue) {
        return {
          entries: [],
          error: `Linha ${index + 1}: informe o nome do projeto apos "project:".`,
        };
      }

      entries.push({
        type,
        projectName: mainValue,
        manualStartDate,
        lineNumber: index + 1,
      });
      continue;
    }

    if (type === "milestone") {
      const parts = mainValue.split(">").map((part) => part.trim()).filter(Boolean);

      if (parts.length !== 2) {
        return {
          entries: [],
          error: `Linha ${index + 1}: milestones devem usar "milestone: Projeto > Milestone".`,
        };
      }

      entries.push({
        type,
        projectName: parts[0],
        milestoneName: parts[1],
        manualStartDate,
        lineNumber: index + 1,
      });
      continue;
    }

    return {
      entries: [],
      error: `Linha ${index + 1}: tipo "${type}" invalido. Use "project" ou "milestone".`,
    };
  }

  return {
    entries,
    error: null,
  };
}

function parseEntryOptions(value, lineNumber) {
  const segments = String(value || "").split("|");
  const mainValue = segments.shift()?.trim() || "";
  let manualStartDate = null;

  for (const rawSegment of segments) {
    const segment = rawSegment.trim();
    if (!segment) {
      continue;
    }

    const [rawKey, ...rest] = segment.split("=");
    const key = String(rawKey || "").trim().toLowerCase();
    const optionValue = rest.join("=").trim();

    if (key !== "inicio") {
      return {
        mainValue,
        manualStartDate: null,
        error: `Linha ${lineNumber}: opcao "${rawKey.trim()}" invalida. Use apenas "inicio=dd/mm/aaaa" ou "inicio=aaaa-mm-dd".`,
      };
    }

    const parsedDate = parseManualDate(optionValue);
    if (!parsedDate) {
      return {
        mainValue,
        manualStartDate: null,
        error: `Linha ${lineNumber}: data invalida em "inicio". Use "dd/mm/aaaa" ou "aaaa-mm-dd".`,
      };
    }

    manualStartDate = parsedDate;
  }

  return {
    mainValue,
    manualStartDate,
    error: null,
  };
}

function parseManualDate(value) {
  const isoMatch = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return buildUtcDate(year, month, day);
  }

  const brMatch = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return buildUtcDate(year, month, day);
  }

  return null;
}

function buildUtcDate(year, month, day) {
  const isoDate = `${year}-${month}-${day}T00:00:00.000Z`;
  const parsed = new Date(isoDate);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return isoDate;
}

module.exports = {
  loadRoadmapConfig,
};
