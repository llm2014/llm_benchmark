/**
 * Benchmark domain rules and data helpers.
 *
 * This module intentionally has no DOM or Chart.js dependency so it can be
 * imported directly by lightweight validation scripts and browser modules.
 */

export const CATEGORY_ORDER = ["logic", "code_v3", "vision"];

export const DEFAULT_INFERENCE_FILTER = "all";
const VALID_INFERENCE_FILTERS = new Set(["all", "think", "non-think"]);

export const DEFAULT_COUNTRY_FILTER = "all";
const VALID_COUNTRY_FILTERS = new Set(["all", "china", "usa", "other"]);

export const MOBILE_BREAKPOINT_PX = 768;
export const MODEL_HEADER_CANDIDATES = ["模型", "Model"];

const CHINA_MODEL_PATTERNS = [
  /[\u4e00-\u9fff]/,
  /^k2(?:\b|[.\s-])/i,
  /\b(?:baichuan|chatglm|deepseek|doubao|ernie|erine|glm|hunyuan|kat|kimi|ling|longcat|minimax|mimo|openpangu|pangu|qwen|qwn|qvq|qwq|ring|seed|sensechat|sensenova|spark|step|tencent|tiangong|yi)(?=$|[^a-z0-9]|[0-9])/i,
];

const US_MODEL_PATTERNS = [
  /\b(?:anthropic|chatgpt|claude|fable|gemini|gemm3|gemma|gpt|grok|haiku|llama|muse|o1|o3|o4|openai|opus|sonnet)(?=$|[^a-z0-9]|[0-9])/i,
];

export const CODE_V3_AUXILIARY_HEADERS = new Set([
  "unprompted",
  "ide/cli",
  "scaffold",
  "think",
  "总扣分",
]);

const CODE_V3_GRADE_ORDER = new Map([
  ["A+", 8],
  ["A", 7],
  ["B+", 6],
  ["B", 5],
  ["C+", 4],
  ["C", 3],
  ["D+", 2],
  ["D", 1],
]);

// Historical data remains in the manifest but is not exposed in navigation.
export const HIDDEN_CATEGORIES = new Set(["code"]);

export const CATEGORY_CHART_CONFIG = {
  logic: {
    score: "中位分数",
    fallbackScore: "极限分数",
    cost: "测试成本(元)",
    time: "平均耗时(秒)",
    token: "Token",
    swapAxes: true,
  },
  vision: {
    score: "中位分数",
    fallbackScore: "极限分数",
    cost: "成本",
    time: "平均耗时/s",
    swapAxes: true,
  },
};

export const TRENDS_SUPPORTED = new Set(
  Object.keys(CATEGORY_CHART_CONFIG).filter((category) => !HIDDEN_CATEGORIES.has(category))
);

export const TRENDS_DEFAULT_SELECTED = 6;
export const CNY_PER_USD = 6.9;

export function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function normalizeInferenceFilter(value) {
  return VALID_INFERENCE_FILTERS.has(value) ? value : DEFAULT_INFERENCE_FILTER;
}

export function normalizeCountryFilter(value) {
  return VALID_COUNTRY_FILTERS.has(value) ? value : DEFAULT_COUNTRY_FILTER;
}

export function buildDatasetKey(dataset) {
  return `${dataset.category}|${dataset.reportDate}|${dataset.tableIndex}`;
}

export function getDatasetDirectoryFromPath(path) {
  if (typeof path !== "string" || !path) return "default";
  const normalized = path.replace(/^\.\//, "");
  const segments = normalized.split("/");
  if (segments.length >= 2 && segments[0] === "data") {
    return segments[1];
  }
  return "default";
}

export function classifyModelCountry(modelName) {
  const normalizedName = String(modelName || "").trim();
  if (CHINA_MODEL_PATTERNS.some((pattern) => pattern.test(normalizedName))) {
    return "china";
  }
  if (US_MODEL_PATTERNS.some((pattern) => pattern.test(normalizedName))) {
    return "usa";
  }
  return "other";
}

export function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (!lines.length) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => parseCsvLine(line, headers.length));
  return { headers, rows };
}

export function parseCsvLine(line, expectedLength) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  if (typeof expectedLength === "number" && result.length < expectedLength) {
    while (result.length < expectedLength) {
      result.push("");
    }
  }

  return result;
}

export function parseSortableNumber(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || /^-+$/.test(trimmed)) return null;
  if (/^\d{2}-\d{2}-\d{2}$/.test(trimmed) || /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const normalized = trimmed.replace(/[¥￥,%]/g, "").replace(/[^\d.-]/g, "");
  if (!normalized || normalized === "-" || normalized === ".") return null;
  const number = Number(normalized);
  return Number.isNaN(number) ? null : number;
}

export function isThinkRow(value) {
  if (value === undefined || value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

export function getModelFamily(name) {
  const normalized = String(name || "").trim();
  if (!normalized) return "";
  const match = normalized.match(/^[^\s-]+/);
  return match ? match[0].toLowerCase() : "";
}

export function normalizeHeaderKey(header) {
  return String(header ?? "").trim().toLowerCase();
}

export function isCodeV3AuxiliaryHeader(header) {
  return CODE_V3_AUXILIARY_HEADERS.has(normalizeHeaderKey(header));
}

export function isCodeV3ProjectColumn(headers, currentCategory, columnIndex) {
  if (currentCategory !== "code_v3") return false;
  const header = headers[columnIndex];
  return (
    !isCodeV3AuxiliaryHeader(header) &&
    !MODEL_HEADER_CANDIDATES.some(
      (candidate) => normalizeHeaderKey(candidate) === normalizeHeaderKey(header)
    )
  );
}

export function parseCodeV3RankGrade(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const match = normalized.match(/^(.+?)\/([ABCD])([+-]?)(?:\(\s*(\d+(?:\.\d+)?)\s*\))?$/i);
  if (!match) return null;
  return {
    rank: match[1].trim(),
    grade: `${match[2].toUpperCase()}${match[3] || ""}`,
    gradeBase: match[2].toUpperCase(),
    priceCny: match[4] || null,
  };
}

const CODE_V3_INSIGHT_KIND_BY_MARKER = new Map([
  ["+", "positive"],
  ["-", "negative"],
  ["#", "finding"],
]);

export function extractCodeV3TaskId(header) {
  const match = String(header ?? "").trim().match(/\(([A-Z])\)\s*$/);
  return match ? match[1] : null;
}

export function parseCodeV3InsightLine(value) {
  const line = String(value ?? "").trim();
  const marker = line.charAt(0);
  const kind = CODE_V3_INSIGHT_KIND_BY_MARKER.get(marker);
  const text = line.slice(1).trim();
  if (!kind || !text) return null;
  return { marker, kind, text };
}

export function buildCodeV3InsightIndex(payload) {
  const byRow = new Map();
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];

  rows.forEach((row) => {
    const rowId = String(row?.rowId ?? "").trim();
    if (!rowId || !Array.isArray(row?.tasks)) return;

    const byTask = new Map();
    row.tasks.forEach((task) => {
      const taskId = String(task?.taskId ?? "").trim().toUpperCase();
      if (!/^[A-Z]$/.test(taskId) || !task?.lines || typeof task.lines !== "object") return;

      const linesByLocale = new Map();
      Object.entries(task.lines).forEach(([locale, lines]) => {
        if (!Array.isArray(lines)) return;
        const parsedLines = lines.map(parseCodeV3InsightLine).filter(Boolean);
        if (parsedLines.length) {
          linesByLocale.set(locale, parsedLines);
        }
      });

      if (linesByLocale.size) {
        byTask.set(taskId, { taskId, linesByLocale });
      }
    });

    if (byTask.size) {
      byRow.set(rowId, byTask);
    }
  });

  return {
    schemaVersion: Number(payload?.schemaVersion) || 1,
    datasetKey: String(payload?.datasetKey ?? ""),
    defaultLocale: String(payload?.defaultLocale ?? "zh-CN"),
    byRow,
  };
}

export function resolveCodeV3Insight(index, rowId, taskId, locale) {
  const task = index?.byRow?.get(rowId)?.get(taskId);
  if (!task) return null;
  const lines =
    task.linesByLocale.get(locale) ?? task.linesByLocale.get(index.defaultLocale) ?? null;
  return lines?.length ? { taskId, lines } : null;
}

export function parseCodeV3SortKey(value) {
  const normalized = String(value ?? "").trim();
  if (/^pass$/i.test(normalized)) return { gradeOrder: 9, errorCount: 0 };
  if (/^failed/i.test(normalized)) return { gradeOrder: 0, errorCount: 0 };
  const parsed = parseCodeV3RankGrade(normalized);
  if (parsed) {
    const errorCount = Number(parsed.rank);
    if (!Number.isNaN(errorCount)) {
      return {
        gradeOrder: CODE_V3_GRADE_ORDER.get(parsed.grade),
        errorCount,
      };
    }
  }
  const match = normalized.match(/^>?\s*(\d+(?:\.\d+)?)$/);
  return match ? { gradeOrder: 0.5, errorCount: Number(match[1]) } : null;
}

export function compareCodeV3SortKeys(a, b, direction) {
  if (a.gradeOrder !== b.gradeOrder) {
    return (a.gradeOrder - b.gradeOrder) * (direction === "desc" ? -1 : 1);
  }
  if (a.errorCount !== b.errorCount) {
    return (a.errorCount - b.errorCount) * (direction === "desc" ? 1 : -1);
  }
  return 0;
}

export function sortRows(rows, columnIndex, direction, context) {
  const { currentCategory, headers, collator } = context;
  const isCodeV3Project = isCodeV3ProjectColumn(headers, currentCategory, columnIndex);
  const multiplier = direction === "desc" ? -1 : 1;
  const parseNumber = isCodeV3Project ? parseCodeV3SortKey : parseSortableNumber;
  const numbers = rows
    .map((row) => parseNumber(row.cells[columnIndex]))
    .filter((value) => value !== null);
  const isMostlyNumeric = isCodeV3Project || numbers.length >= rows.length / 2;

  return rows.slice().sort((a, b) => {
    const valueA = a.cells[columnIndex] ?? "";
    const valueB = b.cells[columnIndex] ?? "";

    if (isMostlyNumeric) {
      const numA = parseNumber(valueA);
      const numB = parseNumber(valueB);
      if (numA === null && numB === null) {
        return collator.compare(String(valueA), String(valueB));
      }
      if (numA === null) return 1;
      if (numB === null) return -1;
      if (isCodeV3Project) {
        return compareCodeV3SortKeys(numA, numB, direction);
      }
      if (numA === numB) return 0;
      return numA > numB ? multiplier : -multiplier;
    }

    return collator.compare(String(valueA), String(valueB)) * multiplier;
  });
}
