import {
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  getCurrentLocale,
  getLocaleLabel,
  onLocaleChange,
  setLocale,
  t,
} from "./i18n.js";

const DATASET_TITLE_KEYS = {
  月榜: "dataset.title.monthly",
  "各语言平均成绩": "dataset.title.averageByLanguage",
};

const DEFAULT_DATASET_TITLE_KEY = "dataset.title.default";

const HEADER_TRANSLATIONS = {
  报告日期: "table.header.reportDate",
  模型: "table.header.model",
  原始分数: "table.header.rawScore",
  原始中位: "table.header.rawMedian",
  运行异常: "table.header.runtimeErrors",
  语法错误: "table.header.syntaxErrors",
  "0分率": "table.header.zeroRate",
  总异常: "table.header.totalErrors",
  极限分数: "table.header.maxScore",
  中位分数: "table.header.medianScore",
  中位差距: "table.header.medianGap",
  "平均耗时(秒)": "table.header.avgTimeSeconds",
  平均代码行: "table.header.avgLines",
  "成本(元)": "table.header.costCny",
  备注: "table.header.notes",
  "使用成本(元)": "table.header.usageCostCny",
  修复后异常: "table.header.errorsAfterFix",
  修正极限: "table.header.adjustedMaxScore",
  分差: "table.header.scoreDelta",
  发布时间: "table.header.releaseDate",
  变更: "table.header.change",
  多轮总分: "table.header.multiTurnScore",
  平均Token: "table.header.avgTokens",
  "平均耗时/s": "table.header.avgTimePerSecond",
  平均长度: "table.header.avgLength",
  "平均长度(字)": "table.header.avgLengthChars",
  异常率: "table.header.errorRate",
  总轮数: "table.header.totalRounds",
  成本: "table.header.cost",
  "价格(元/百万)": "table.header.pricePerMillion",
  最终不可用: "table.header.finalUnavailable",
  "测试成本(元)": "table.header.testCostCny",
  测试时间: "table.header.testTime",
  百分制: "table.header.percentScale",
  较上次变更: "table.header.changeSinceLast",
  首轮总分: "table.header.firstRoundScore",
  使用成本: "table.header.usageCost",
};

const CATEGORY_ORDER = ["logic", "code", "code_v3", "vision"];
const DEFAULT_INFERENCE_FILTER = "all";
const VALID_INFERENCE_FILTERS = new Set(["all", "think", "non-think"]);
const DEFAULT_COUNTRY_FILTER = "all";
const VALID_COUNTRY_FILTERS = new Set(["all", "china", "usa", "other"]);
const MOBILE_BREAKPOINT_PX = 768;
const MODEL_HEADER_CANDIDATES = ["模型", "Model", "Language"];
const MODEL_COUNTRY_HEADER_CANDIDATES = ["模型", "Model"];
const CHINA_MODEL_PATTERNS = [
  /[\u4e00-\u9fff]/,
  /^k2(?:\b|[.\s-])/i,
  /\b(?:baichuan|chatglm|deepseek|doubao|ernie|erine|glm|hunyuan|kat|kimi|ling|longcat|minimax|mimo|openpangu|pangu|qwen|qwn|qvq|qwq|ring|seed|sensenova|step|tencent|yi)(?=$|[^a-z0-9]|[0-9])/i,
];
const US_MODEL_PATTERNS = [
  /\b(?:anthropic|chatgpt|claude|fable|gemini|gemm3|gemma|gpt|grok|haiku|llama|muse|o1|o3|o4|openai|opus|sonnet)(?=$|[^a-z0-9]|[0-9])/i,
];
const CODE_V3_AUXILIARY_HEADERS = new Set(["unprompted", "ide/cli", "think", "总扣分"]);
const THEME_STORAGE_KEY = "llm-dashboard-theme";
const THEME_MODES = ["system", "light", "dark"];
const prefersDarkQuery =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

// 暂时在类别下拉中隐藏的分类（数据仍在 manifest 中，仅不展示）
const HIDDEN_CATEGORIES = new Set(["code"]);

// 各榜单类别的数值列配置：趋势视图与象限图共用。
// code_v3 为等级制（Pass/A+…），不在此列。
// scoreFallbacks 供趋势视图使用：评分体系迭代过，早期月份用旧列名，
// 排名只要求当月分数单调可比，跨月不做绝对比较。
const CATEGORY_CHART_CONFIG = {
  logic: {
    score: "极限分数",
    cost: "测试成本(元)",
    time: "平均耗时(秒)",
    scoreFallbacks: ["极限分数", "百分制", "原始分数"],
    // 推理类别交换横纵坐标：横轴 = 指标（成本/耗时），纵轴 = 分数
    swapAxes: true,
  },
  code: {
    score: "多轮总分",
    cost: "测试成本(元)",
    time: "平均耗时(秒)",
    scoreFallbacks: ["多轮总分"],
  },
  vision: {
    score: "极限分数",
    cost: "成本",
    time: "平均耗时/s",
    scoreFallbacks: ["极限分数", "原始分数"],
    // 与推理类别一致：横轴 = 指标（成本/耗时），纵轴 = 分数
    swapAxes: true,
  },
};
const TRENDS_SUPPORTED = new Set(
  Object.keys(CATEGORY_CHART_CONFIG).filter((category) => !HIDDEN_CATEGORIES.has(category))
);
// 趋势视图只取相对最新数据集的最近 18 期（动态计算，随数据更新滚动）
const TRENDS_MAX_MONTHS = 18;
const TRENDS_RECENT_MONTHS = 6;
const TRENDS_DEFAULT_SELECTED = 6;
const SERIES_PALETTE_LIGHT = [
  "#1f4e79", "#9e3b32", "#3a6b4f", "#8a6d1f",
  "#6b4f8a", "#2f6b6b", "#a2543a", "#5a5f6b",
];
const SERIES_PALETTE_DARK = [
  "#93b8dc", "#d9907f", "#8fbf9f", "#c9a94f",
  "#b39ddb", "#7fb3b3", "#cf8a6f", "#9aa0ab",
];
const VALID_VIEWS = new Set(["board", "trends"]);

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// 货币本地化：数据层始终是人民币，仅展示层在英文界面按固定汇率换算。
const CNY_PER_USD = 6.9;

function formatUsd(usd) {
  const decimals = Math.abs(usd) >= 1 ? 2 : 3;
  return `$${usd.toFixed(decimals)}`;
}

function formatCurrencyForLocale(value) {
  if (state.locale !== "en-US") return value;
  const match = String(value).match(/^[¥￥]\s*(-?[\d,]+(?:\.\d+)?)$/);
  if (!match) return value;
  const cny = Number(match[1].replace(/,/g, ""));
  if (Number.isNaN(cny)) return value;
  return formatUsd(cny / CNY_PER_USD);
}

// 纯数字计数字段展示时加千分位（原始数据不变，排序/搜索不受影响）
const THOUSANDS_SEPARATOR_HEADERS = new Set(["Token", "平均Token"]);

function formatCellForDisplay(header, value) {
  const formatted = formatCurrencyForLocale(value);
  if (header && THOUSANDS_SEPARATOR_HEADERS.has(header) && /^\d+$/.test(formatted)) {
    return Number(formatted).toLocaleString("en-US");
  }
  return formatted;
}

// Chart.js 自定义插件：绘制象限底色、中位分割线与区域标签。
const quadrantPlugin = {
  id: "quadrants",  beforeDatasetsDraw(chart, args, opts) {
    if (!opts || typeof opts.medianX !== "number" || typeof opts.medianY !== "number") return;
    const { ctx, chartArea, scales } = chart;
    if (!chartArea) return;
    const midX = scales.x.getPixelForValue(opts.medianX);
    const midY = scales.y.getPixelForValue(opts.medianY);
    const { top, bottom, left, right } = chartArea;
    ctx.save();
    if (opts.sweetBg) {
      ctx.fillStyle = opts.sweetBg;
      ctx.fillRect(midX, midY, right - midX, bottom - midY);
    }
    if (opts.lineColor) {
      ctx.strokeStyle = opts.lineColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(midX, top);
      ctx.lineTo(midX, bottom);
      ctx.moveTo(left, midY);
      ctx.lineTo(right, midY);
      ctx.stroke();
    }
    ctx.restore();
  },
  afterDatasetsDraw(chart, args, opts) {
    if (!opts || !opts.labels) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const { top, bottom, left, right } = chartArea;
    const pad = 8;
    ctx.save();
    ctx.font = `12px ${getComputedStyle(document.body).fontFamily}`;
    ctx.fillStyle = opts.labelColor || "#999";
    if (opts.labels.tr) {
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(opts.labels.tr, right - pad, top + pad);
    }
    if (opts.labels.br) {
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(opts.labels.br, right - pad, bottom - pad);
    }
    if (opts.labels.tl) {
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(opts.labels.tl, left + pad, top + pad);
    }
    if (opts.labels.bl) {
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(opts.labels.bl, left + pad, bottom - pad);
    }
    ctx.restore();
  },
};

// Chart.js 自定义插件：在散点旁直接标注模型名。
// 贪心防重叠：按 右→左→上→下 顺序尝试，全部冲突才放弃该标签；
// 数据顺序即优先级（排名靠前的模型优先获得标注位）。
const pointLabelsPlugin = {
  id: "pointLabels",
  afterDatasetsDraw(chart, args, opts) {
    if (!opts || !opts.display) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const meta = chart.getDatasetMeta(0);
    const dataset = chart.data.datasets[0];
    if (!meta || !dataset) return;

    const fontSize = opts.fontSize || 11;
    const padX = 2;
    const boxH = fontSize + 4;
    const offset = 7;
    const placed = [];

    const intersects = (a, b) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const inside = (box) =>
      box.x >= chartArea.left &&
      box.x + box.w <= chartArea.right &&
      box.y >= chartArea.top &&
      box.y + box.h <= chartArea.bottom;

    ctx.save();
    ctx.font = `${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    dataset.data.forEach((point, index) => {
      const element = meta.data[index];
      if (!element || !point || !point.label) return;
      const boxW = ctx.measureText(point.label).width + padX * 2;
      const candidates = [
        { x: element.x + offset, y: element.y - boxH / 2 },
        { x: element.x - offset - boxW, y: element.y - boxH / 2 },
        { x: element.x - boxW / 2, y: element.y - offset - boxH },
        { x: element.x - boxW / 2, y: element.y + offset },
      ];
      for (const candidate of candidates) {
        const box = { x: candidate.x, y: candidate.y, w: boxW, h: boxH };
        if (!inside(box)) continue;
        if (placed.some((other) => intersects(box, other))) continue;
        ctx.fillStyle = point.isThink ? opts.thinkColor : opts.defaultColor;
        ctx.fillText(point.label, candidate.x + padX, candidate.y + boxH / 2);
        placed.push(box);
        return;
      }
    });

    ctx.restore();
  },
};

const MOBILE_CARD_LAYOUTS = {
  code: {
    className: "mobile-card--code",
    fieldGroups: [
      ["多轮总分", "极限分数", "修正极限"],
      ["首轮总分", "中位分数", "原始分数"],
      ["测试成本(元)", "成本(元)", "使用成本(元)", "成本"],
      ["平均耗时(秒)", "平均耗时/s"],
      ["发布时间", "报告日期", "测试时间"],
    ],
  },
  logic: {
    className: "mobile-card--logic",
    suppressDetails: true,
    rows: [
      {
        className: "mobile-card-row--hero",
        columns: 3,
        fields: [
          ["极限分数", "百分制", "原始分数"],
          ["中位分数", "原始中位"],
          { candidates: ["中位差距"], tone: "muted" },
        ],
      },
      {
        className: "mobile-card-row--secondary",
        columns: 3,
        fields: [
          ["测试成本(元)", "成本(元)", "使用成本(元)", "成本"],
          ["Token", "平均Token"],
          ["价格(元/百万)"],
        ],
      },
      {
        className: "mobile-card-row--tertiary",
        columns: 2,
        fields: [
          ["平均耗时(秒)", "平均耗时/s"],
          ["发布时间", "报告日期", "测试时间"],
        ],
      },
    ],
  },
  vision: {
    className: "mobile-card--vision",
    suppressDetails: true,
    rows: [
      {
        className: "mobile-card-row--hero",
        columns: 3,
        fields: [
          ["极限分数", "原始分数"],
          ["中位分数", "原始中位"],
          { candidates: ["中位差距"], tone: "muted" },
        ],
      },
      {
        className: "mobile-card-row--secondary",
        columns: 3,
        fields: [
          ["成本", "成本(元)", "测试成本(元)"],
          ["平均Token", "Token"],
          ["价格(元/百万)"],
        ],
      },
      {
        className: "mobile-card-row--tertiary",
        columns: 2,
        fields: [
          ["平均耗时/s", "平均耗时(秒)"],
          ["发布时间", "报告日期", "测试时间"],
        ],
      },
    ],
  },
  code_v3: {
    className: "mobile-card--codev3",
    suppressDetails: true,
    rows: [
      {
        className: "mobile-card-row--codev3-secondary",
        columns: 2,
        fields: [["Unprompted"], ["总扣分"]],
      },
    ],
    footerNoteField: ["IDE/CLI"],
  },
  default: {
    className: "mobile-card--default",
    fieldGroups: [
      ["极限分数", "多轮总分", "原始分数"],
      ["测试成本(元)", "成本(元)", "使用成本(元)", "成本"],
      ["平均耗时(秒)", "平均耗时/s"],
      ["发布时间", "报告日期", "测试时间"],
    ],
  },
};

const state = {
  locale: getCurrentLocale(),
  collator: createCollator(getCurrentLocale()),
  manifest: [],
  categoryOptions: [],
  currentCategory: null,
  currentDatasetKey: null,
  currentDatasetDirectory: null,
  headers: [],
  rows: [],
  filteredRows: [],
  searchQuery: "",
  inferenceFilter: DEFAULT_INFERENCE_FILTER,
  hasThinkColumn: false,
  countryFilter: DEFAULT_COUNTRY_FILTER,
  hasModelColumn: false,
  sort: { columnIndex: null, direction: null },
  themeMode: readStoredThemeMode(),
  view: "board",
  trends: {
    category: null,
    mode: "percentile",
    months: [],
    models: [],
    selected: new Set(),
    loadedCategory: null,
    loading: false,
  },
};

const csvCache = new Map();

const elements = {
  categoryNav: document.getElementById("viewTabsCategories"),
  datasetSelect: document.getElementById("datasetSelect"),
  inferenceFilter: document.getElementById("inferenceFilter"),
  countryFilter: document.getElementById("countryFilter"),
  searchInput: document.getElementById("searchInput"),
  tableContainer: document.getElementById("tableContainer"),
  tableNote: document.getElementById("tableNote"),
  datasetMeta: document.getElementById("datasetMeta"),
  datasetLabel: document.getElementById("datasetLabel"),
  inferenceLabel: document.getElementById("inferenceLabel"),
  countryLabel: document.getElementById("countryLabel"),
  searchLabel: document.getElementById("searchLabel"),
  pageTitle: document.getElementById("pageTitle"),
  pageSubtitle: document.getElementById("pageSubtitle"),
  themeToggle: document.getElementById("themeToggle"),
  languageToggle: document.getElementById("languageToggle"),
  footerNote: document.getElementById("footerNote"),
  chartSection: document.getElementById("chartSection"),
  chartCanvas: document.getElementById("benchmarkChart"),
  chartCaption: document.getElementById("chartCaption"),
  yAxisSelect: document.getElementById("yAxisSelect"),
  yAxisLabel: document.getElementById("yAxisLabel"),
  viewTabs: document.getElementById("viewTabs"),
  viewTabBoard: document.getElementById("viewTabBoard"),
  viewTabTrends: document.getElementById("viewTabTrends"),
  boardView: document.getElementById("boardView"),
  trendsSection: document.getElementById("trendsSection"),
  trendsCategorySelect: document.getElementById("trendsCategorySelect"),
  trendsCategoryLabel: document.getElementById("trendsCategoryLabel"),
  trendsModeSelect: document.getElementById("trendsModeSelect"),
  trendsModeLabel: document.getElementById("trendsModeLabel"),
  modelPicker: document.getElementById("modelPicker"),
  trendsCanvas: document.getElementById("trendsChart"),
  trendsCaption: document.getElementById("trendsCaption"),
  trendsNote: document.getElementById("trendsNote"),
};

let chartInstance = null;
let trendsChartInstance = null;
let isApplyingHashState = false;

initializeLocaleUi();
initializeThemeUi();

init().catch((error) => {
  console.error(error);
  showPlaceholder(t("placeholders.loadingError"));
});

function createCollator(locale) {
  try {
    return new Intl.Collator(locale);
  } catch (error) {
    console.warn("Collator initialization failed, falling back to default locale.", error);
    return new Intl.Collator(FALLBACK_LOCALE);
  }
}

function initializeLocaleUi() {
  updateStaticCopy();
  updateLanguageToggle();

  if (elements.languageToggle) {
    elements.languageToggle.addEventListener("click", () => {
      const nextLocale = getNextLocale();
      setLocale(nextLocale);
    });
  }

  onLocaleChange((locale) => {
    state.locale = locale;
    state.collator = createCollator(locale);
    updateStaticCopy();
    renderCategoryNav({ preserveSelection: true });
    if (state.currentCategory) {
      refreshDatasetOptions();
    }
    applyFiltersAndRender();
    updateLanguageToggle();
    updateMeta();
    if (state.view === "trends") {
      renderTrends();
    }
  });
}

function initializeThemeUi() {
  applyThemeMode(state.themeMode, { persist: false });
  updateThemeToggle();

  if (elements.themeToggle) {
    elements.themeToggle.addEventListener("click", () => {
      const nextMode = getNextThemeMode(state.themeMode);
      applyThemeMode(nextMode);
      updateThemeToggle();
      renderChart();
      renderTrendsChart();
    });
  }

  const handleSystemThemeChange = () => {
    if (state.themeMode !== "system") return;
    renderChart();
    renderTrendsChart();
  };

  if (prefersDarkQuery && typeof prefersDarkQuery.addEventListener === "function") {
    prefersDarkQuery.addEventListener("change", handleSystemThemeChange);
  } else if (prefersDarkQuery && typeof prefersDarkQuery.addListener === "function") {
    prefersDarkQuery.addListener(handleSystemThemeChange);
  }
}

function updateStaticCopy() {
  document.title = t("app.title");
  if (elements.pageTitle) {
    elements.pageTitle.textContent = t("app.title");
  }
  if (elements.pageSubtitle) {
    elements.pageSubtitle.innerHTML = t("header.subtitle");
  }

  if (elements.categoryNav) {
    elements.categoryNav.setAttribute("aria-label", t("controls.category.aria"));
  }
  if (elements.datasetLabel) {
    elements.datasetLabel.textContent = t("controls.dataset.label");
  }
  if (elements.inferenceLabel) {
    elements.inferenceLabel.textContent = t("controls.inference.label");
  }
  if (elements.countryLabel) {
    elements.countryLabel.textContent = t("controls.country.label");
  }
  if (elements.searchLabel) {
    elements.searchLabel.textContent = t("controls.search.label");
  }
  if (elements.datasetSelect) {
    elements.datasetSelect.setAttribute("aria-label", t("controls.dataset.aria"));
  }
  if (elements.inferenceFilter) {
    elements.inferenceFilter.setAttribute("aria-label", t("controls.inference.aria"));
    setSelectOptions(
      elements.inferenceFilter,
      [
        { value: "all", label: t("controls.inference.option.all") },
        { value: "think", label: t("controls.inference.option.think") },
        { value: "non-think", label: t("controls.inference.option.nonThink") },
      ],
      state.inferenceFilter
    );
  }
  if (elements.countryFilter) {
    elements.countryFilter.setAttribute("aria-label", t("controls.country.aria"));
    setSelectOptions(
      elements.countryFilter,
      [
        { value: "all", label: t("controls.country.option.all") },
        { value: "china", label: t("controls.country.option.china") },
        { value: "usa", label: t("controls.country.option.usa") },
        { value: "other", label: t("controls.country.option.other") },
      ],
      state.countryFilter
    );
  }
  if (elements.searchInput) {
    elements.searchInput.setAttribute("aria-label", t("controls.search.aria"));
    elements.searchInput.placeholder = t("controls.search.placeholder");
  }
  if (elements.yAxisLabel) {
    updateMetricAxisLabel();
  }
  if (elements.yAxisSelect) {
    elements.yAxisSelect.setAttribute("aria-label", t("chart.yAxis.aria"));
    const currentValue = elements.yAxisSelect.value || "cost";
    setSelectOptions(
      elements.yAxisSelect,
      [
        { value: "cost", label: t("chart.yAxis.option.cost") },
        { value: "time", label: t("chart.yAxis.option.time") },
      ],
      currentValue
    );
  }
  if (elements.footerNote) {
    elements.footerNote.textContent = t("footer.note");
  }
  if (elements.viewTabs) {
    elements.viewTabs.setAttribute("aria-label", t("view.tabs.aria"));
  }
  if (elements.viewTabBoard) {
    elements.viewTabBoard.textContent = t("view.board");
  }
  if (elements.viewTabTrends) {
    elements.viewTabTrends.textContent = t("view.trends");
  }
  if (elements.trendsCategoryLabel) {
    elements.trendsCategoryLabel.textContent = t("trends.category.label");
  }
  if (elements.trendsCategorySelect) {
    elements.trendsCategorySelect.setAttribute("aria-label", t("trends.category.aria"));
  }
  if (elements.trendsModeLabel) {
    elements.trendsModeLabel.textContent = t("trends.mode.label");
  }
  if (elements.trendsModeSelect) {
    elements.trendsModeSelect.setAttribute("aria-label", t("trends.mode.aria"));
    setSelectOptions(
      elements.trendsModeSelect,
      [
        { value: "percentile", label: t("trends.mode.percentile") },
        { value: "rank", label: t("trends.mode.rank") },
      ],
      state.trends.mode
    );
  }
  if (elements.modelPicker) {
    elements.modelPicker.setAttribute("aria-label", t("trends.picker.aria"));
  }
  buildTrendsCategoryOptions();
  updateThemeToggle();
}

function updateMetricAxisLabel() {
  if (!elements.yAxisLabel) return;
  const swapped =
    state.currentCategory && CATEGORY_CHART_CONFIG[state.currentCategory]?.swapAxes;
  elements.yAxisLabel.textContent = swapped
    ? t("chart.xAxis.label")
    : t("chart.yAxis.label");
}

function updateLanguageToggle() {
  if (!elements.languageToggle) return;
  const nextLocale = getNextLocale();
  const label = t("language.switcher.toggle", { target: getLocaleLabel(nextLocale) });
  elements.languageToggle.textContent = label;
  elements.languageToggle.setAttribute("aria-label", t("language.switcher.aria"));
}

function getNextLocale() {
  const currentIndex = SUPPORTED_LOCALES.indexOf(state.locale);
  if (currentIndex === -1) {
    return FALLBACK_LOCALE;
  }
  const nextIndex = (currentIndex + 1) % SUPPORTED_LOCALES.length;
  return SUPPORTED_LOCALES[nextIndex];
}

function readStoredThemeMode() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return normalizeThemeMode(stored);
  } catch (error) {
    console.warn("Unable to read stored theme:", error);
    return "system";
  }
}

function normalizeThemeMode(mode) {
  return THEME_MODES.includes(mode) ? mode : "system";
}

function getNextThemeMode(currentMode) {
  const normalized = normalizeThemeMode(currentMode);
  const currentIndex = THEME_MODES.indexOf(normalized);
  const nextIndex = (currentIndex + 1) % THEME_MODES.length;
  return THEME_MODES[nextIndex];
}

function applyThemeMode(mode, { persist = true } = {}) {
  const normalized = normalizeThemeMode(mode);
  state.themeMode = normalized;

  if (normalized === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", normalized);
  }

  if (!persist) return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, normalized);
  } catch (error) {
    console.warn("Unable to store theme mode:", error);
  }
}

function updateThemeToggle() {
  if (!elements.themeToggle) return;
  const modeLabel = t(`theme.mode.${state.themeMode}`);
  elements.themeToggle.textContent = t("theme.switcher.toggle", { mode: modeLabel });
  elements.themeToggle.setAttribute("aria-label", t("theme.switcher.aria"));
}

function setSelectOptions(select, options, selectedValue) {
  if (!select) return;
  const previousValue = typeof selectedValue === "string" ? selectedValue : select.value;
  select.innerHTML = options
    .map(({ value, label }) => `<option value="${value}">${label}</option>`)
    .join("");
  if (previousValue && options.some((option) => option.value === previousValue)) {
    select.value = previousValue;
  }
}

function normalizeInferenceFilter(value) {
  return VALID_INFERENCE_FILTERS.has(value) ? value : DEFAULT_INFERENCE_FILTER;
}

function normalizeCountryFilter(value) {
  return VALID_COUNTRY_FILTERS.has(value) ? value : DEFAULT_COUNTRY_FILTER;
}

function parseHashState(rawHash = window.location.hash) {
  const hash = String(rawHash || "").replace(/^#/, "");
  const params = new URLSearchParams(hash);

  return {
    hasParams: hash.length > 0,
    view: (params.get("view") || "").trim(),
    trendsCategory: (params.get("trendcat") || "").trim(),
    category: (params.get("category") || "").trim(),
    datasetKey: (params.get("dataset") || "").trim(),
    inferenceFilter: normalizeInferenceFilter((params.get("inference") || "").trim()),
    countryFilter: normalizeCountryFilter((params.get("country") || "").trim()),
    searchQuery: (params.get("search") || "").trim(),
  };
}

function resolveCategoryFromHash(category, datasetKey) {
  if (datasetKey) {
    const dataset = state.manifest.find((entry) => buildDatasetKey(entry) === datasetKey);
    if (dataset && !HIDDEN_CATEGORIES.has(dataset.category)) return dataset.category;
  }

  if (!category || HIDDEN_CATEGORIES.has(category)) return null;
  const exists = state.manifest.some((entry) => entry.category === category);
  return exists ? category : null;
}

function isDatasetInCategory(datasetKey, category) {
  if (!datasetKey || !category) return false;
  return state.manifest.some(
    (entry) => entry.category === category && buildDatasetKey(entry) === datasetKey
  );
}

function buildHashFromState() {
  const params = new URLSearchParams();
  if (state.view === "trends") {
    params.set("view", "trends");
    if (state.trends.category) {
      params.set("trendcat", state.trends.category);
    }
    return params.toString();
  }
  if (state.currentCategory) {
    params.set("category", state.currentCategory);
  }
  if (state.currentDatasetKey) {
    params.set("dataset", state.currentDatasetKey);
  }
  if (state.inferenceFilter && state.inferenceFilter !== DEFAULT_INFERENCE_FILTER) {
    params.set("inference", state.inferenceFilter);
  }
  if (state.countryFilter && state.countryFilter !== DEFAULT_COUNTRY_FILTER) {
    params.set("country", state.countryFilter);
  }
  if (state.searchQuery) {
    params.set("search", state.searchQuery);
  }
  return params.toString();
}

function syncHashFromState() {
  if (isApplyingHashState) return;

  const nextHash = buildHashFromState();
  const currentHash = window.location.hash.replace(/^#/, "");
  if (nextHash === currentHash) return;

  const basePath = `${window.location.pathname}${window.location.search}`;
  const nextUrl = nextHash ? `${basePath}#${nextHash}` : basePath;
  window.history.replaceState(null, "", nextUrl);
}

async function applyStateFromHash(rawHash = window.location.hash) {
  if (!state.manifest.length) return false;

  const hashState = parseHashState(rawHash);
  if (!hashState.hasParams) {
    if (state.view !== "board") {
      setView("board", { sync: false });
    }
    return false;
  }

  if (hashState.view === "trends") {
    const trendCategory = hashState.trendsCategory;
    if (
      trendCategory &&
      TRENDS_SUPPORTED.has(trendCategory) &&
      state.manifest.some((entry) => entry.category === trendCategory)
    ) {
      if (state.trends.category !== trendCategory) {
        state.trends.category = trendCategory;
        state.trends.loadedCategory = null;
      }
    }
    setView("trends", { sync: false });
    return true;
  }

  const targetCategory = resolveCategoryFromHash(hashState.category, hashState.datasetKey);
  if (!targetCategory) return false;

  const targetDatasetKey = isDatasetInCategory(hashState.datasetKey, targetCategory)
    ? hashState.datasetKey
    : null;

  isApplyingHashState = true;
  try {
    if (state.currentCategory !== targetCategory) {
      setActiveCategory(targetCategory);
      await handleCategoryChange(targetCategory, { preferredDatasetKey: targetDatasetKey });
    } else if (!state.currentDatasetKey) {
      await handleCategoryChange(targetCategory, { preferredDatasetKey: targetDatasetKey });
    } else if (targetDatasetKey && targetDatasetKey !== state.currentDatasetKey) {
      if (elements.datasetSelect.value !== targetDatasetKey) {
        elements.datasetSelect.value = targetDatasetKey;
      }
      await loadDatasetByKey(targetDatasetKey);
    }

    const nextInference = state.hasThinkColumn
      ? normalizeInferenceFilter(hashState.inferenceFilter)
      : DEFAULT_INFERENCE_FILTER;
    state.inferenceFilter = nextInference;
    elements.inferenceFilter.value = nextInference;

    const nextCountry = state.hasModelColumn
      ? normalizeCountryFilter(hashState.countryFilter)
      : DEFAULT_COUNTRY_FILTER;
    state.countryFilter = nextCountry;
    elements.countryFilter.value = nextCountry;

    const nextSearch = hashState.searchQuery;
    state.searchQuery = nextSearch;
    elements.searchInput.value = nextSearch;

    applyFiltersAndRender();
  } finally {
    isApplyingHashState = false;
  }

  if (state.view !== "board") {
    setView("board", { sync: false });
  }
  syncHashFromState();
  return true;
}

async function init() {
  showPlaceholder(t("placeholders.loadingData"));
  const manifest = await fetchManifest();
  if (!manifest.length) {
    showPlaceholder(t("placeholders.noDatasets"));
    return;
  }

  state.manifest = manifest;
  renderCategoryNav();
  buildTrendsCategoryOptions();
  bindEventHandlers();

  const appliedFromHash = await applyStateFromHash(window.location.hash);
  if (!appliedFromHash) {
    const firstCategory = state.categoryOptions[0] || null;
    if (firstCategory) {
      await handleCategoryChange(firstCategory);
    }
  }
  syncHashFromState();
}

async function fetchManifest() {
  const response = await fetch("data/datasets.json", { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(t("errors.manifestLoad", { status: response.status }, `Unable to load manifest: ${response.status}`));
  }
  const payload = await response.json();
  return Array.isArray(payload.datasets) ? payload.datasets : [];
}

function renderCategoryNav({ preserveSelection = false } = {}) {
  const container = elements.categoryNav;
  if (!container) return;
  container.innerHTML = "";

  const seen = new Set();
  const categories = state.manifest
    .map((entry) => entry.category)
    .filter((category) => {
      if (HIDDEN_CATEGORIES.has(category)) {
        return false;
      }
      if (seen.has(category)) {
        return false;
      }
      seen.add(category);
      return true;
    });

  categories.sort((a, b) => {
    const indexA = CATEGORY_ORDER.indexOf(a);
    const indexB = CATEGORY_ORDER.indexOf(b);
    if (indexA === -1 && indexB === -1) {
      return state.collator.compare(getCategoryLabel(a), getCategoryLabel(b));
    }
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  state.categoryOptions = categories;

  categories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-item";
    button.dataset.category = category;
    button.textContent = getCategoryLabel(category);
    button.setAttribute("aria-pressed", "false");
    container.appendChild(button);
  });

  const previous = preserveSelection ? state.currentCategory : null;
  state.currentCategory =
    previous && categories.includes(previous) ? previous : categories[0] || null;
  setActiveCategory(state.currentCategory);
}

function setActiveCategory(category) {
  const container = elements.categoryNav;
  if (!container) return;
  container.querySelectorAll(".category-item").forEach((button) => {
    const active = button.dataset.category === category;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function getCategoryLabel(category) {
  return t(`category.${category}`, undefined, category);
}

function getHeaderLabel(header) {
  const key = HEADER_TRANSLATIONS[header];
  if (!key) {
    return header;
  }
  return t(key);
}

function bindEventHandlers() {
  if (elements.categoryNav) {
    elements.categoryNav.addEventListener("click", async (event) => {
      const button = event.target.closest(".category-item");
      if (!button) return;
      const category = button.dataset.category;
      if (!category) return;
      // 仅当已在榜单视图且点击的是当前类别时才忽略；趋势视图下点击
      // 当前类别也应切回榜单视图
      if (state.view === "board" && category === state.currentCategory) return;
      if (state.view !== "board") {
        setView("board", { sync: false });
      }
      setActiveCategory(category);
      await handleCategoryChange(category);
      syncHashFromState();
    });
  }

  elements.datasetSelect.addEventListener("change", async (event) => {
    const key = event.target.value;
    if (!key) return;
    await loadDatasetByKey(key);
    syncHashFromState();
  });

  elements.inferenceFilter.addEventListener("change", (event) => {
    state.inferenceFilter = event.target.value;
    applyFiltersAndRender();
    syncHashFromState();
  });

  elements.countryFilter.addEventListener("change", (event) => {
    state.countryFilter = normalizeCountryFilter(event.target.value);
    applyFiltersAndRender();
    syncHashFromState();
  });

  elements.searchInput.addEventListener("input", (event) => {
    state.searchQuery = (event.target.value || "").trim();
    applyFiltersAndRender();
    syncHashFromState();
  });

  if (elements.yAxisSelect) {
    elements.yAxisSelect.addEventListener("change", () => {
      renderChart();
    });
  }

  if (elements.viewTabBoard) {
    elements.viewTabBoard.addEventListener("click", () => {
      setView("board");
      // 点击「致知」默认跳转第一个类别
      const firstCategory = state.categoryOptions[0] || null;
      if (firstCategory && firstCategory !== state.currentCategory) {
        setActiveCategory(firstCategory);
        handleCategoryChange(firstCategory);
        syncHashFromState();
      }
    });
  }
  if (elements.viewTabTrends) {
    elements.viewTabTrends.addEventListener("click", () => setView("trends"));
  }

  if (elements.trendsCategorySelect) {
    elements.trendsCategorySelect.addEventListener("change", (event) => {
      const category = event.target.value;
      if (!TRENDS_SUPPORTED.has(category)) return;
      state.trends.category = category;
      state.trends.loadedCategory = null;
      state.trends.selected = new Set();
      ensureTrendsData().then(renderTrends);
      syncHashFromState();
    });
  }

  if (elements.trendsModeSelect) {
    elements.trendsModeSelect.addEventListener("change", (event) => {
      state.trends.mode = event.target.value === "rank" ? "rank" : "percentile";
      renderTrendsChart();
      updateTrendsCaption();
    });
  }

  window.addEventListener("hashchange", () => {
    applyStateFromHash(window.location.hash)
      .then(async (appliedFromHash) => {
        if (appliedFromHash) return;
        const firstCategory = state.categoryOptions[0] || null;
        if (!firstCategory) return;
        await handleCategoryChange(firstCategory);
        syncHashFromState();
      })
      .catch((error) => {
        console.error(error);
      });
  });

  let wasMobileViewport = isMobileViewport();
  window.addEventListener("resize", () => {
    const isMobile = isMobileViewport();
    if (isMobile === wasMobileViewport) return;
    wasMobileViewport = isMobile;
    renderTable();
  });
}

async function handleCategoryChange(category, options = {}) {
  const { preferredDatasetKey = null } = options;
  state.currentCategory = category;
  updateMetricAxisLabel();
  state.currentDatasetKey = null;
  state.currentDatasetDirectory = null;
  elements.datasetSelect.disabled = true;
  elements.searchInput.disabled = true;
  elements.searchInput.value = "";
  state.searchQuery = "";
  state.inferenceFilter = DEFAULT_INFERENCE_FILTER;
  state.hasThinkColumn = false;
  state.countryFilter = DEFAULT_COUNTRY_FILTER;
  state.hasModelColumn = false;
  elements.inferenceFilter.value = DEFAULT_INFERENCE_FILTER;
  elements.inferenceFilter.disabled = true;
  elements.countryFilter.value = DEFAULT_COUNTRY_FILTER;
  elements.countryFilter.disabled = true;
  state.sort = { columnIndex: null, direction: null };
  state.headers = [];
  state.rows = [];
  state.filteredRows = [];
  updateMeta();
  showPlaceholder(t("placeholders.loadingCategory"));

  const datasets = getDatasetsForCategory(category);
  if (!datasets.length) {
    elements.datasetSelect.innerHTML = "";
    showPlaceholder(t("placeholders.emptyCategory"));
    return;
  }

  setSelectOptions(
    elements.datasetSelect,
    datasets.map((dataset) => ({
      value: buildDatasetKey(dataset),
      label: buildDatasetLabel(dataset),
    }))
  );

  elements.datasetSelect.disabled = false;
  let targetKey = elements.datasetSelect.value;
  if (preferredDatasetKey && datasets.some((dataset) => buildDatasetKey(dataset) === preferredDatasetKey)) {
    targetKey = preferredDatasetKey;
    elements.datasetSelect.value = preferredDatasetKey;
  }

  if (targetKey) {
    await loadDatasetByKey(targetKey);
  }
}

function refreshDatasetOptions() {
  if (!elements.datasetSelect || !state.currentCategory) return;
  const datasets = getDatasetsForCategory(state.currentCategory);
  if (!datasets.length) {
    elements.datasetSelect.innerHTML = "";
    elements.datasetSelect.disabled = true;
    return;
  }

  setSelectOptions(
    elements.datasetSelect,
    datasets.map((dataset) => ({
      value: buildDatasetKey(dataset),
      label: buildDatasetLabel(dataset),
    })),
    state.currentDatasetKey
  );
  elements.datasetSelect.disabled = false;
}

function getDatasetsForCategory(category) {
  const datasets = state.manifest.filter((entry) => entry.category === category);
  datasets.sort((a, b) => {
    if (a.reportDate === b.reportDate) {
      return a.tableIndex - b.tableIndex;
    }
    return a.reportDate > b.reportDate ? -1 : 1;
  });
  return datasets;
}

function buildDatasetLabel(dataset) {
  const parts = [dataset.reportDate];
  if (dataset.title) {
    parts.push(translateDatasetTitle(dataset.title));
  }
  return parts.join(" · ");
}

function translateDatasetTitle(title) {
  if (!title) {
    return t(DEFAULT_DATASET_TITLE_KEY);
  }
  const key = DATASET_TITLE_KEYS[title];
  if (key) {
    return t(key);
  }
  return title;
}

async function loadDatasetByKey(key) {
  state.currentDatasetKey = key;
  state.searchQuery = "";
  state.sort = { columnIndex: null, direction: null };
  elements.searchInput.value = "";

  const dataset = state.manifest.find((entry) => buildDatasetKey(entry) === key);
  if (!dataset) {
    showPlaceholder(t("placeholders.datasetNotFound"));
    return;
  }

  state.currentDatasetDirectory = getDatasetDirectoryFromPath(dataset.csv);

  showPlaceholder(t("placeholders.loadingTable"));

  const { headers, rows } = await fetchCsvDataset(dataset.csv);
  const thinkIndex = headers.findIndex(
    (header) => header && header.trim().toLowerCase() === "think"
  );
  state.hasThinkColumn = thinkIndex !== -1;

  if (state.hasThinkColumn) {
    elements.inferenceFilter.disabled = false;
    elements.inferenceFilter.value = state.inferenceFilter;
  } else {
    state.inferenceFilter = DEFAULT_INFERENCE_FILTER;
    elements.inferenceFilter.value = DEFAULT_INFERENCE_FILTER;
    elements.inferenceFilter.disabled = true;
  }

  const displayHeaders =
    thinkIndex === -1 ? headers.slice() : headers.filter((_, index) => index !== thinkIndex);
  const modelColumnIndex = findCountryModelColumnIndex(displayHeaders);
  state.hasModelColumn = modelColumnIndex !== -1;

  if (state.hasModelColumn) {
    elements.countryFilter.disabled = false;
    elements.countryFilter.value = state.countryFilter;
  } else {
    state.countryFilter = DEFAULT_COUNTRY_FILTER;
    elements.countryFilter.value = DEFAULT_COUNTRY_FILTER;
    elements.countryFilter.disabled = true;
  }

  state.headers = displayHeaders;
  state.rows = rows.map((row) => {
    const cells =
      thinkIndex === -1 ? row.slice() : row.filter((_, index) => index !== thinkIndex);
    const thinkValue = thinkIndex === -1 ? null : row[thinkIndex];
    const modelName = modelColumnIndex === -1 ? "" : cells[modelColumnIndex];
    return {
      cells,
      isThink: thinkIndex !== -1 && isThinkRow(thinkValue),
      modelCountry: classifyModelCountry(modelName),
    };
  });

  // 数据集的默认序为“中位分数”降序（无该列则不排序）
  const medianScoreIndex = displayHeaders.indexOf("中位分数");
  if (medianScoreIndex !== -1) {
    state.sort = { columnIndex: medianScoreIndex, direction: "desc" };
  }

  applyFiltersAndRender();

  elements.searchInput.disabled = false;
  updateMeta(dataset);
}

function buildDatasetKey(dataset) {
  return `${dataset.category}|${dataset.reportDate}|${dataset.tableIndex}`;
}

function getDatasetDirectoryFromPath(path) {
  if (typeof path !== "string" || !path) return "default";
  const normalized = path.replace(/^\.\//, "");
  const segments = normalized.split("/");
  if (segments.length >= 2 && segments[0] === "data") {
    return segments[1];
  }
  return "default";
}

function findCountryModelColumnIndex(headers) {
  return MODEL_COUNTRY_HEADER_CANDIDATES.reduce((foundIndex, candidate) => {
    if (foundIndex !== -1) return foundIndex;
    return headers.findIndex((header) => header === candidate);
  }, -1);
}

function classifyModelCountry(modelName) {
  const normalizedName = String(modelName || "").trim();
  if (CHINA_MODEL_PATTERNS.some((pattern) => pattern.test(normalizedName))) {
    return "china";
  }
  if (US_MODEL_PATTERNS.some((pattern) => pattern.test(normalizedName))) {
    return "usa";
  }
  return "other";
}

async function fetchCsvDataset(path) {
  if (csvCache.has(path)) {
    return csvCache.get(path);
  }
  const promise = (async () => {
    const response = await fetch(path, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(t("errors.csvLoad", { path }, `Unable to load CSV: ${path}`));
    }
    const text = await response.text();
    return parseCsv(text);
  })();
  csvCache.set(path, promise);
  return promise;
}

function parseCsv(text) {
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

function parseCsvLine(line, expectedLength) {
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

function applyFiltersAndRender() {
  let rows = state.rows.slice();
  const query = state.searchQuery.toLocaleLowerCase(state.locale);

  if (state.hasThinkColumn) {
    if (state.inferenceFilter === "think") {
      rows = rows.filter((row) => row.isThink);
    } else if (state.inferenceFilter === "non-think") {
      rows = rows.filter((row) => !row.isThink);
    }
  }

  if (state.hasModelColumn && state.countryFilter !== DEFAULT_COUNTRY_FILTER) {
    rows = rows.filter((row) => row.modelCountry === state.countryFilter);
  }

  if (query) {
    rows = rows.filter((row) =>
      row.cells.some((cell) =>
        String(cell ?? "")
          .toLocaleLowerCase(state.locale)
          .includes(query)
      )
    );
  }

  if (state.sort.columnIndex !== null && state.sort.direction) {
    rows = sortRows(rows, state.sort.columnIndex, state.sort.direction);
  }

  state.filteredRows = rows;
  renderTable();
  updateMeta();
  updateChartVisibility();
  renderChart();
}

function sortRows(rows, columnIndex, direction) {
  const multiplier = direction === "desc" ? -1 : 1;
  const numbers = rows
    .map((row) => parseSortableNumber(row.cells[columnIndex]))
    .filter((value) => value !== null);
  const isMostlyNumeric = numbers.length >= rows.length / 2;

  const sorted = rows.slice().sort((a, b) => {
    const valueA = a.cells[columnIndex] ?? "";
    const valueB = b.cells[columnIndex] ?? "";

    if (isMostlyNumeric) {
      const numA = parseSortableNumber(valueA);
      const numB = parseSortableNumber(valueB);

      if (numA === null && numB === null) {
        return state.collator.compare(String(valueA), String(valueB));
      }
      if (numA === null) return 1;
      if (numB === null) return -1;
      if (numA === numB) return 0;
      return numA > numB ? multiplier : -multiplier;
    }

    return state.collator.compare(String(valueA), String(valueB)) * multiplier;
  });

  return sorted;
}

function parseSortableNumber(value) {
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

function isThinkRow(value) {
  if (value === undefined || value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

// 模型家族：命名的首个词（短横线或空格分隔），如
// "GPT-5.5 (xhigh)" → gpt，"Claude Opus 5" → claude，"Kimi-K3 (max)" → kimi
function getModelFamily(name) {
  const normalized = String(name || "").trim();
  if (!normalized) return "";
  const match = normalized.match(/^[^\s-]+/);
  return match ? match[0].toLowerCase() : "";
}

function isMobileViewport() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches;
}

function resolveMobileCardLayout() {
  const directory = state.currentDatasetDirectory || "default";
  return MOBILE_CARD_LAYOUTS[directory] || MOBILE_CARD_LAYOUTS.default;
}

function buildHeaderIndexMap(headers) {
  const indexMap = new Map();
  headers.forEach((header, index) => {
    if (!indexMap.has(header)) {
      indexMap.set(header, index);
    }
  });
  return indexMap;
}

function normalizeCellValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized.length ? normalized : null;
}

function normalizeHeaderKey(header) {
  return String(header ?? "").trim().toLowerCase();
}

function isCodeV3AuxiliaryHeader(header) {
  return CODE_V3_AUXILIARY_HEADERS.has(normalizeHeaderKey(header));
}

function getCodeV3PrimaryHeaderIndices(modelColumnIndex = -1) {
  if (state.currentCategory !== "code_v3") return [];

  return state.headers.reduce((indices, header, index) => {
    if (index === modelColumnIndex || isCodeV3AuxiliaryHeader(header)) {
      return indices;
    }
    indices.push(index);
    return indices;
  }, []);
}

function getCodeV3StatusClass(value) {
  if (state.currentCategory !== "code_v3") return null;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "skip") return "codev3-status codev3-status--skip";
  if (normalized.startsWith("failed")) return "codev3-status codev3-status--failed";
  if (normalized.startsWith("pending")) return "codev3-status codev3-status--pending";
  return null;
}

function getCodeV3GradeCellClass(value) {
  if (state.currentCategory !== "code_v3") return null;
  const parsed = parseCodeV3RankGrade(value);
  if (!parsed) return null;
  return `codev3-cell--${parsed.gradeBase.toLowerCase()}`;
}

function getCodeV3CellBackgroundClass(value) {
  if (state.currentCategory !== "code_v3") return null;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "pass") return "codev3-cell--pass";
  if (normalized.startsWith("failed")) return "codev3-cell--failed";
  if (normalized.startsWith("pending")) return "codev3-cell--pending";
  return null;
}

function parseCodeV3RankGrade(value) {
  if (state.currentCategory !== "code_v3") return null;
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const match = normalized.match(/^(.+?)\/([ABCD])([+-]?)$/i);
  if (!match) return null;
  return {
    rank: match[1].trim(),
    grade: `${match[2].toUpperCase()}${match[3] || ""}`,
    gradeBase: match[2].toUpperCase(),
  };
}

function appendCodeV3ValueContent(target, value) {
  const parsed = parseCodeV3RankGrade(value);
  if (!parsed) {
    target.textContent = value;
    return;
  }

  target.appendChild(document.createTextNode(`${parsed.rank}/`));
  const grade = document.createElement("span");
  grade.className = `codev3-grade codev3-grade--${parsed.gradeBase.toLowerCase()}`;
  grade.textContent = parsed.grade;
  target.appendChild(grade);
}

function findModelColumnIndex(headers, rows, headerIndexMap) {
  for (const candidate of MODEL_HEADER_CANDIDATES) {
    if (headerIndexMap.has(candidate)) {
      return headerIndexMap.get(candidate);
    }
  }

  let bestIndex = headers.length ? 0 : -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  const sampleRows = rows.slice(0, 10);

  headers.forEach((_, index) => {
    let nonEmpty = 0;
    let textLike = 0;
    let numericLike = 0;
    let totalLength = 0;

    sampleRows.forEach((row) => {
      const value = normalizeCellValue(row.cells[index]);
      if (!value) return;
      nonEmpty += 1;
      totalLength += value.length;

      if (parseSortableNumber(value) !== null) {
        numericLike += 1;
      }
      if (/[A-Za-z\u4e00-\u9fff]/.test(value)) {
        textLike += 1;
      }
    });

    if (!nonEmpty) return;

    const averageLength = totalLength / nonEmpty;
    const score = textLike * 2 - numericLike + averageLength / 10;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function resolveFieldByGroup(row, fieldGroup, headerIndexMap, usedIndices) {
  let candidates;
  let tone = "default";

  if (Array.isArray(fieldGroup)) {
    candidates = fieldGroup;
  } else if (typeof fieldGroup === "string") {
    candidates = [fieldGroup];
  } else if (fieldGroup && Array.isArray(fieldGroup.candidates)) {
    candidates = fieldGroup.candidates;
    tone = fieldGroup.tone || tone;
  } else {
    candidates = [];
  }

  for (const field of candidates) {
    if (!headerIndexMap.has(field)) continue;
    const index = headerIndexMap.get(field);
    if (usedIndices.has(index)) continue;

    const value = normalizeCellValue(row.cells[index]);
    if (!value) continue;

    usedIndices.add(index);
    const rawHeader = state.headers[index];
    return {
      label: rawHeader ? getHeaderLabel(rawHeader) : t("table.mobile.unnamedField"),
      value: formatCellForDisplay(rawHeader, value),
      tone,
      statusClass: getCodeV3StatusClass(value),
    };
  }

  return null;
}

function collectRemainingFields(row, usedIndices) {
  const fields = [];

  state.headers.forEach((header, index) => {
    if (usedIndices.has(index)) return;
    const value = normalizeCellValue(row.cells[index]);
    if (!value) return;

    fields.push({
      label: header ? getHeaderLabel(header) : t("table.mobile.unnamedField"),
      value: formatCellForDisplay(header, value),
      statusClass: getCodeV3StatusClass(value),
    });
  });

  return fields;
}

function appendCardMetric(metricsContainer, metric, isPrimary = false) {
  const item = document.createElement("div");
  item.className = isPrimary ? "mobile-card-metric mobile-card-metric--primary" : "mobile-card-metric";
  if (metric.tone === "muted") {
    item.classList.add("mobile-card-metric--muted");
  }

  const label = document.createElement("span");
  label.className = "mobile-card-metric-label";
  label.textContent = metric.label;

  const value = document.createElement("strong");
  value.className = "mobile-card-metric-value";
  if (metric.statusClass) {
    value.classList.add(...metric.statusClass.split(" "));
  }
  appendCodeV3ValueContent(value, metric.value);

  item.appendChild(label);
  item.appendChild(value);
  metricsContainer.appendChild(item);
}

function appendStructuredMetric(rowElement, metric) {
  const item = document.createElement("div");
  item.className = "mobile-card-row-metric";
  if (metric.tone === "muted") {
    item.classList.add("mobile-card-row-metric--muted");
  }
  const cellClass =
    getCodeV3GradeCellClass(metric.value) || getCodeV3CellBackgroundClass(metric.value);
  if (cellClass) {
    item.classList.add(cellClass);
  }

  const label = document.createElement("span");
  label.className = "mobile-card-row-metric-label";
  label.textContent = metric.label;

  const value = document.createElement("strong");
  value.className = "mobile-card-row-metric-value";
  if (metric.statusClass) {
    value.classList.add(...metric.statusClass.split(" "));
  }
  appendCodeV3ValueContent(value, metric.value);

  item.appendChild(label);
  item.appendChild(value);
  rowElement.appendChild(item);
}

function appendStructuredPlaceholder(rowElement) {
  const item = document.createElement("div");
  item.className = "mobile-card-row-placeholder";
  item.setAttribute("aria-hidden", "true");
  rowElement.appendChild(item);
}

function buildMetricFromIndex(row, index, usedIndices) {
  const value = normalizeCellValue(row.cells[index]);
  if (!value) return null;

  usedIndices.add(index);
  const rawHeader = state.headers[index];
  return {
    label: rawHeader ? getHeaderLabel(rawHeader) : t("table.mobile.unnamedField"),
    value: formatCellForDisplay(rawHeader, value),
    statusClass: getCodeV3StatusClass(value),
  };
}

function renderCodeV3PrimaryRows(card, row, modelColumnIndex, usedIndices) {
  const primaryIndices = getCodeV3PrimaryHeaderIndices(modelColumnIndex).filter(
    (index) => !usedIndices.has(index) && normalizeCellValue(row.cells[index])
  );

  if (!primaryIndices.length) return false;

  for (let start = 0; start < primaryIndices.length; start += 3) {
    const chunk = primaryIndices.slice(start, start + 3);
    const rowElement = document.createElement("div");
    rowElement.className = "mobile-card-row mobile-card-row--codev3-primary";
    rowElement.style.setProperty("--mobile-card-row-columns", "3");

    chunk.forEach((index) => {
      const metric = buildMetricFromIndex(row, index, usedIndices);
      if (metric) {
        appendStructuredMetric(rowElement, metric);
      }
    });

    for (let index = chunk.length; index < 3; index += 1) {
      appendStructuredPlaceholder(rowElement);
    }

    card.appendChild(rowElement);
  }

  return true;
}

function renderStructuredCardRows(card, row, layout, headerIndexMap, usedIndices, modelColumnIndex) {
  const hasCodeV3PrimaryRows =
    state.currentCategory === "code_v3"
      ? renderCodeV3PrimaryRows(card, row, modelColumnIndex, usedIndices)
      : false;

  if (!Array.isArray(layout.rows) || !layout.rows.length) {
    return hasCodeV3PrimaryRows;
  }

  let rendered = hasCodeV3PrimaryRows;

  layout.rows.forEach((rowConfig) => {
    const fields = Array.isArray(rowConfig?.fields) ? rowConfig.fields : [];
    const rowMetrics = [];

    fields.forEach((descriptor) => {
      const resolved = resolveFieldByGroup(row, descriptor, headerIndexMap, usedIndices);
      if (resolved) {
        rowMetrics.push(resolved);
      }
    });

    if (!rowMetrics.length) return;

    rendered = true;
    const rowElement = document.createElement("div");
    rowElement.className = "mobile-card-row";
    if (rowConfig.className) {
      rowElement.classList.add(rowConfig.className);
    }

    const columns = Number(rowConfig.columns) || rowMetrics.length || 1;
    const normalizedColumns = Math.max(1, columns);
    rowElement.style.setProperty("--mobile-card-row-columns", String(normalizedColumns));

    rowMetrics.forEach((metric) => appendStructuredMetric(rowElement, metric));
    if (rowConfig.fillWithPlaceholders && rowMetrics.length < normalizedColumns) {
      for (let i = rowMetrics.length; i < normalizedColumns; i += 1) {
        appendStructuredPlaceholder(rowElement);
      }
    }
    card.appendChild(rowElement);
  });

  return rendered;
}

function renderCardFooterNote(card, row, layout, headerIndexMap, usedIndices) {
  if (!layout.footerNoteField) return;

  const noteMetric = resolveFieldByGroup(row, layout.footerNoteField, headerIndexMap, usedIndices);
  if (!noteMetric) return;

  const note = document.createElement("p");
  note.className = "mobile-card-note";
  note.textContent = `${noteMetric.label}: ${noteMetric.value}`;
  card.appendChild(note);
}

function createMobileCard(row, layout, headerIndexMap, modelColumnIndex) {
  const card = document.createElement("article");
  card.className = `mobile-card ${layout.className}`;

  const usedIndices = new Set();
  const modelValue = modelColumnIndex >= 0 ? normalizeCellValue(row.cells[modelColumnIndex]) : null;
  if (modelColumnIndex >= 0) {
    usedIndices.add(modelColumnIndex);
  }

  const header = document.createElement("header");
  header.className = "mobile-card-header";

  const title = document.createElement("h3");
  title.className = "mobile-card-title";
  title.textContent = modelValue || t("table.mobile.unknownModel");
  header.appendChild(title);

  if (row.isThink) {
    const badge = document.createElement("span");
    badge.className = "think-badge";
    badge.textContent = t("table.reasoningBadge");
    header.appendChild(badge);
  }

  card.appendChild(header);

  const hasStructuredRows = renderStructuredCardRows(
    card,
    row,
    layout,
    headerIndexMap,
    usedIndices,
    modelColumnIndex
  );

  if (!hasStructuredRows) {
    const metrics = [];
    const metricGroups = Array.isArray(layout.fieldGroups) ? layout.fieldGroups : [];

    metricGroups.forEach((group) => {
      const resolved = resolveFieldByGroup(row, group, headerIndexMap, usedIndices);
      if (resolved) {
        metrics.push(resolved);
      }
    });

    if (!metrics.length) {
      state.headers.forEach((header, index) => {
        if (metrics.length >= 4 || usedIndices.has(index)) return;
        const value = normalizeCellValue(row.cells[index]);
        if (!value) return;
        usedIndices.add(index);
        metrics.push({
          label: header ? getHeaderLabel(header) : t("table.mobile.unnamedField"),
          value,
        });
      });
    }

    if (metrics.length) {
      const metricsContainer = document.createElement("div");
      metricsContainer.className = "mobile-card-metrics";
      metrics.forEach((metric, index) => appendCardMetric(metricsContainer, metric, index === 0));
      card.appendChild(metricsContainer);
    }
  }

  renderCardFooterNote(card, row, layout, headerIndexMap, usedIndices);

  const detailsFields = collectRemainingFields(row, usedIndices);
  if (!layout.suppressDetails && detailsFields.length) {
    const details = document.createElement("details");
    details.className = "mobile-card-details";

    const summary = document.createElement("summary");
    summary.textContent = t("table.mobile.moreFields");
    details.appendChild(summary);

    const list = document.createElement("div");
    list.className = "mobile-card-detail-list";

    detailsFields.forEach((field) => {
      const rowNode = document.createElement("div");
      rowNode.className = "mobile-card-detail-row";

      const label = document.createElement("span");
      label.className = "mobile-card-detail-label";
      label.textContent = field.label;

      const value = document.createElement("span");
      value.className = "mobile-card-detail-value";
      value.textContent = field.value;

      rowNode.appendChild(label);
      rowNode.appendChild(value);
      list.appendChild(rowNode);
    });

    details.appendChild(list);
    card.appendChild(details);
  }

  return card;
}

function renderMobileCards(container) {
  const list = document.createElement("div");
  list.className = "mobile-card-list";

  const layout = resolveMobileCardLayout();
  const headerIndexMap = buildHeaderIndexMap(state.headers);
  const modelColumnIndex = findModelColumnIndex(state.headers, state.filteredRows, headerIndexMap);

  state.filteredRows.forEach((row) => {
    list.appendChild(createMobileCard(row, layout, headerIndexMap, modelColumnIndex));
  });

  container.appendChild(list);
}

function renderTable() {
  const container = elements.tableContainer;
  container.innerHTML = "";
  container.classList.remove("mobile-cards");
  container.classList.remove("table-container--codev3");
  renderTableNote();

  if (!state.headers.length) {
    showPlaceholder(t("placeholders.selectDataset"));
    return;
  }

  if (!state.filteredRows.length) {
    showPlaceholder(t("placeholders.noMatches"));
    return;
  }

  if (isMobileViewport()) {
    container.classList.add("mobile-cards");
    renderMobileCards(container);
    return;
  }

  const headerIndexMap = buildHeaderIndexMap(state.headers);
  const modelColumnIndex = findModelColumnIndex(state.headers, state.filteredRows, headerIndexMap);
  const isCodeV3Table = state.currentCategory === "code_v3";
  // 成本列（logic/code 为“测试成本(元)”，vision 为“成本”）：用于 hover 局部对比
  const costHeader = CATEGORY_CHART_CONFIG[state.currentCategory]?.cost ?? null;
  const costColumnIndex = costHeader ? state.headers.indexOf(costHeader) : -1;

  const table = document.createElement("table");
  if (isCodeV3Table) {
    table.classList.add("codev3-table");
    container.classList.add("table-container--codev3");
  }
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  state.headers.forEach((header, index) => {
    const th = document.createElement("th");
    th.textContent = getHeaderLabel(header);
    if (isCodeV3Table) {
      th.classList.add(index === modelColumnIndex ? "codev3-model-column" : "codev3-fixed-column");
    }
    th.addEventListener("click", () => toggleSort(index));

    const isActive = state.sort.columnIndex === index;
    if (isActive && state.sort.direction) {
      th.classList.add("sorted");
      const indicator = document.createElement("span");
      indicator.className = "sort-indicator";
      indicator.textContent = state.sort.direction === "asc" ? "↑" : "↓";
      th.appendChild(indicator);
      th.setAttribute("aria-sort", state.sort.direction === "asc" ? "ascending" : "descending");
    } else {
      th.setAttribute("aria-sort", "none");
    }

    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  state.filteredRows.forEach((row) => {
    const tr = document.createElement("tr");
    const family = modelColumnIndex >= 0 ? getModelFamily(row.cells[modelColumnIndex]) : "";
    if (family) {
      tr.dataset.family = family;
    }
    row.cells.forEach((cell, columnIndex) => {
      const td = document.createElement("td");
      if (isCodeV3Table) {
        td.classList.add(
          columnIndex === modelColumnIndex ? "codev3-model-column" : "codev3-fixed-column"
        );
      }
      if (columnIndex === modelColumnIndex) {
        td.classList.add("model-cell");
      }
      if (columnIndex === costColumnIndex) {
        td.classList.add("cost-cell");
        const costNumber = parseSortableNumber(cell);
        if (costNumber !== null) {
          td.dataset.cost = String(costNumber);
        }
      }
      const displayValue = cell ? formatCellForDisplay(state.headers[columnIndex], cell) : "—";
      const statusClass = getCodeV3StatusClass(cell);
      if (statusClass) {
        td.classList.add(...statusClass.split(" "));
      }
      const gradeCellClass = getCodeV3GradeCellClass(cell);
      if (gradeCellClass) {
        td.classList.add(gradeCellClass);
      }
      const cellBackgroundClass = getCodeV3CellBackgroundClass(cell);
      if (cellBackgroundClass) {
        td.classList.add(cellBackgroundClass);
      }
      appendCodeV3ValueContent(td, displayValue);

      if (columnIndex === modelColumnIndex && row.isThink) {
        td.classList.add("think-model");
        const badge = document.createElement("span");
        badge.className = "think-badge";
        badge.textContent = t("table.reasoningBadge");
        td.appendChild(badge);
      }

      if (cell && /^\d+(\.\d+)?%$/.test(cell)) {
        td.style.fontFamily = "var(--font-family-mono)";
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  // 家族高亮：hover 某行时，点亮榜上所有同家族模型（橙色圆点，见 CSS）
  let litFamily = null;
  const clearLitFamily = () => {
    if (litFamily === null) return;
    tbody.querySelectorAll("tr.family-lit").forEach((el) => el.classList.remove("family-lit"));
    litFamily = null;
  };
  tbody.addEventListener("mouseover", (event) => {
    const tr = event.target.closest("tr");
    const family = tr && tr.dataset.family ? tr.dataset.family : null;
    if (family === litFamily) return;
    clearLitFamily();
    if (family === null) return;
    litFamily = family;
    tbody
      .querySelectorAll(`tr[data-family="${CSS.escape(family)}"]`)
      .forEach((el) => el.classList.add("family-lit"));
  });
  tbody.addEventListener("mouseleave", clearLitFamily);

  // 成本局部对比：hover 某成本数字时，以上下 ±5 行为窗口，
  // 高于基准的标红、低于基准的标蓝，基准本身加粗；离开后整列恢复灰色
  let costBaselineRow = -1;
  const clearCostCompare = () => {
    if (costBaselineRow === -1) return;
    tbody.classList.remove("cost-compare-active");
    tbody
      .querySelectorAll(".cost-baseline, .cost-above, .cost-below")
      .forEach((el) => el.classList.remove("cost-baseline", "cost-above", "cost-below"));
    costBaselineRow = -1;
  };
  tbody.addEventListener("mouseover", (event) => {
    const cell = event.target.closest("td.cost-cell");
    if (!cell || cell.dataset.cost === undefined) {
      clearCostCompare();
      return;
    }
    const rowIndex = Array.prototype.indexOf.call(tbody.children, cell.parentElement);
    if (rowIndex === -1 || rowIndex === costBaselineRow) return;
    clearCostCompare();
    costBaselineRow = rowIndex;
    const baseline = Number(cell.dataset.cost);
    tbody.classList.add("cost-compare-active");
    cell.classList.add("cost-baseline");
    const rows = tbody.children;
    const from = Math.max(0, rowIndex - 5);
    const to = Math.min(rows.length - 1, rowIndex + 5);
    for (let i = from; i <= to; i += 1) {
      if (i === rowIndex) continue;
      const target = rows[i].querySelector("td.cost-cell");
      if (!target || target.dataset.cost === undefined) continue;
      const value = Number(target.dataset.cost);
      if (value > baseline) {
        target.classList.add("cost-above");
      } else if (value < baseline) {
        target.classList.add("cost-below");
      }
    }
  });
  tbody.addEventListener("mouseleave", clearCostCompare);

  table.appendChild(tbody);
  container.appendChild(table);
}

function renderTableNote() {
  const note = elements.tableNote;
  if (!note) return;

  const isCodeV3 = state.currentCategory === "code_v3" && state.headers.length > 0;
  const hasNewMode = isCodeV3 && state.headers.some((header) => /\(H\)|\(I\)/.test(header));
  const hasGradeValues =
    isCodeV3 &&
    state.rows.some((row) =>
      row.cells.some((cell) => /^.+?\/[ABCD][+-]?$/i.test(String(cell ?? "").trim()))
    );

  if (!hasNewMode && !hasGradeValues) {
    note.hidden = true;
    note.innerHTML = "";
    return;
  }

  note.hidden = false;

  const gradeItems = [
    ["a", t("codev3Note.gradeA")],
    ["b", t("codev3Note.gradeB")],
    ["c", t("codev3Note.gradeC")],
    ["d", t("codev3Note.gradeD")],
    ["failed", t("codev3Note.failed")],
    ["pass", t("codev3Note.pass")],
    ["pending", t("codev3Note.pending")],
  ];
  const gradeList = gradeItems
    .map(
      ([tier, text]) =>
        `<li><span class="grade-chip grade-chip--${tier}">${
          tier.length === 1 ? tier.toUpperCase() : tier[0].toUpperCase() + tier.slice(1)
        }</span><span>${text}</span></li>`
    )
    .join("");

  const monthly = hasNewMode
    ? [
        `<h3>${t("codev3Note.monthlyTitle")}</h3>`,
        `<p>${t("codev3Note.monthlyP1")}</p>`,
        `<p>${t("codev3Note.monthlyP2")}</p>`,
        `<p>${t("codev3Note.monthlyP3")}</p>`,
        `<p>${t("codev3Note.monthlyP4")}</p>`,
        `<p>${t("codev3Note.monthlyP5")}</p>`,
      ].join("")
    : "";

  note.innerHTML = [
    `<h3>${t("codev3Note.title")}</h3>`,
    `<ul class="grade-list">${gradeList}</ul>`,
    `<p>${t("codev3Note.halfGrade")}</p>`,
    monthly,
  ].join("");
}

function toggleSort(columnIndex) {
  if (state.sort.columnIndex === columnIndex) {
    if (state.sort.direction === "asc") {
      state.sort.direction = "desc";
    } else if (state.sort.direction === "desc") {
      state.sort = { columnIndex: null, direction: null };
    } else {
      state.sort.direction = "asc";
    }
  } else {
    state.sort = { columnIndex, direction: "asc" };
  }

  applyFiltersAndRender();
}

function updateMeta(dataset = null) {
  const meta = elements.datasetMeta;
  if (!dataset) {
    const activeDataset =
      state.manifest.find((entry) => buildDatasetKey(entry) === state.currentDatasetKey) ?? null;
    if (!activeDataset) {
      meta.classList.remove("active");
      meta.innerHTML = "";
      return;
    }
    dataset = activeDataset;
  }

  const total = state.rows.length;
  const filtered = state.filteredRows.length;
  const categoryLabel = getCategoryLabel(dataset.category);
  const datasetsForCategory = getDatasetsForCategory(dataset.category);
  const reportCount = datasetsForCategory.length;
  const datasetTitle = dataset.title
    ? translateDatasetTitle(dataset.title)
    : t(DEFAULT_DATASET_TITLE_KEY);
  const datasetLabel = `${dataset.reportDate} · ${datasetTitle}`;

  const recordsLabel =
    filtered !== total
      ? t("meta.records.withTotal", { count: filtered, total })
      : t("meta.records.single", { count: filtered });

  const codev3FormatNote =
    dataset.category === "code_v3"
      ? `<span class="meta-note">${t("meta.codev3CellFormat")}</span>`
      : "";

  meta.innerHTML = `
    <span>${t("meta.category", { label: categoryLabel })}</span>
    <span>${t("meta.dataset", { label: datasetLabel })}</span>
    <span>${recordsLabel}</span>
    <span>${t("meta.datasetCount", { count: reportCount })}</span>
    ${codev3FormatNote}
  `;
  meta.classList.add("active");
}

function showPlaceholder(message) {
  const container = elements.tableContainer;
  container.classList.remove("mobile-cards");
  container.classList.remove("table-container--codev3");
  container.innerHTML = `<div class="placeholder" role="status">${message}</div>`;
}

/* ---------------- 视图切换 ---------------- */

function setView(view, { sync = true } = {}) {
  const nextView = VALID_VIEWS.has(view) ? view : "board";
  state.view = nextView;

  // 榜单作为容器视图不显示选中态（选中体现在类别标签上）
  if (elements.viewTabTrends) {
    elements.viewTabTrends.classList.toggle("active", nextView === "trends");
  }
  if (elements.boardView) {
    elements.boardView.hidden = nextView !== "board";
  }
  if (elements.trendsSection) {
    elements.trendsSection.hidden = nextView !== "trends";
  }
  // 趋势视图下类别不显示选中态（回到榜单时恢复当前类别的选中态）
  if (elements.categoryNav) {
    setActiveCategory(nextView === "board" ? state.currentCategory : null);
  }

  if (nextView === "trends") {
    state.trends.category = resolveInitialTrendsCategory();
    if (elements.trendsCategorySelect) {
      elements.trendsCategorySelect.value = state.trends.category || "";
    }
    ensureTrendsData().then(renderTrends);
  } else {
    if (!state.currentDatasetKey && state.currentCategory) {
      handleCategoryChange(state.currentCategory);
    } else {
      updateChartVisibility();
      renderChart();
    }
  }

  if (sync) {
    syncHashFromState();
  }
}

function resolveInitialTrendsCategory() {
  if (state.trends.category && TRENDS_SUPPORTED.has(state.trends.category)) {
    return state.trends.category;
  }
  if (TRENDS_SUPPORTED.has(state.currentCategory)) {
    return state.currentCategory;
  }
  // 按固定的类别顺序取第一个有数据的，而不是依赖 manifest 排列顺序
  const available = new Set(state.manifest.map((entry) => entry.category));
  const preferred = CATEGORY_ORDER.find(
    (category) => TRENDS_SUPPORTED.has(category) && available.has(category)
  );
  return preferred || "logic";
}

function buildTrendsCategoryOptions() {
  if (!elements.trendsCategorySelect || !state.manifest.length) return;
  const seen = new Set();
  const categories = state.manifest
    .map((entry) => entry.category)
    .filter((category) => {
      if (!TRENDS_SUPPORTED.has(category) || seen.has(category)) return false;
      seen.add(category);
      return true;
    });
  categories.sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));
  setSelectOptions(
    elements.trendsCategorySelect,
    categories.map((category) => ({ value: category, label: getCategoryLabel(category) })),
    state.trends.category || resolveInitialTrendsCategory()
  );
}

/* ---------------- 趋势视图 ---------------- */

function findChartModelIndex(headers) {
  const direct = headers.indexOf("模型");
  if (direct !== -1) return direct;
  // vision 早期文件模型列表头为空，位于“报告日期”之后。
  if (headers[0] === "报告日期" && headers.length > 1) return 1;
  return -1;
}

async function ensureTrendsData() {
  const category = state.trends.category;
  if (!category || !TRENDS_SUPPORTED.has(category)) {
    state.trends.months = [];
    state.trends.models = [];
    return;
  }
  if (state.trends.loadedCategory === category && state.trends.months.length) {
    return;
  }

  state.trends.loading = true;
  renderTrendsStatus();

  const config = CATEGORY_CHART_CONFIG[category];
  const entries = state.manifest
    .filter((entry) => entry.category === category && (entry.title === "月榜" || !entry.title))
    .sort((a, b) => (a.reportDate < b.reportDate ? -1 : a.reportDate > b.reportDate ? 1 : 0))
    .slice(-TRENDS_MAX_MONTHS);

  const months = await Promise.all(
    entries.map(async (entry) => {
      try {
        const { headers, rows } = await fetchCsvDataset(entry.csv);
        const scoreIndex = config.scoreFallbacks.reduce(
          (found, candidate) => (found !== -1 ? found : headers.indexOf(candidate)),
          -1
        );
        const modelIndex = findChartModelIndex(headers);
        if (scoreIndex === -1 || modelIndex === -1) return null;

        const scored = [];
        rows.forEach((cells) => {
          const name = String(cells[modelIndex] || "").trim();
          const score = parseSortableNumber(cells[scoreIndex]);
          if (!name || score === null) return;
          scored.push({ name, score });
        });
        if (!scored.length) return null;

        scored.sort((a, b) => b.score - a.score);
        const n = scored.length;
        const ranks = new Map();
        scored.forEach((item, index) => {
          if (ranks.has(item.name)) return;
          ranks.set(item.name, {
            rank: index + 1,
            percentile: n > 1 ? ((n - index - 1) / (n - 1)) * 100 : 100,
            score: item.score,
            cohortSize: n,
          });
        });
        return { key: entry.reportDate, label: entry.reportDate, ranks };
      } catch (error) {
        console.warn("Trends: skipping", entry.csv, error);
        return null;
      }
    })
  );

  state.trends.months = months.filter(Boolean);
  state.trends.loadedCategory = category;
  state.trends.loading = false;
  buildTrendsModelList();
}

function buildTrendsModelList() {
  const months = state.trends.months;
  const latestByModel = new Map();
  months.forEach((month, monthIndex) => {
    month.ranks.forEach((value, name) => {
      const prev = latestByModel.get(name);
      if (!prev || monthIndex >= prev.monthIndex) {
        latestByModel.set(name, { monthIndex, percentile: value.percentile });
      }
    });
  });

  const cutoff = Math.max(0, months.length - TRENDS_RECENT_MONTHS);
  const models = [...latestByModel.entries()]
    .filter(([, value]) => value.monthIndex >= cutoff)
    .map(([name, value]) => ({ name, percentile: value.percentile }))
    .sort((a, b) => b.percentile - a.percentile);

  state.trends.models = models;
  const validNames = new Set(models.map((model) => model.name));
  state.trends.selected = new Set([...state.trends.selected].filter((name) => validNames.has(name)));
  if (!state.trends.selected.size) {
    models.slice(0, TRENDS_DEFAULT_SELECTED).forEach((model) => state.trends.selected.add(model.name));
  }
}

function renderTrends() {
  if (state.view !== "trends" || !elements.trendsSection) return;
  renderTrendsStatus();
  if (state.trends.loading) return;

  const hasData = state.trends.months.length > 0;
  if (elements.modelPicker) {
    elements.modelPicker.style.display = hasData ? "" : "none";
  }
  const chartWrap = elements.trendsCanvas ? elements.trendsCanvas.parentElement : null;
  if (chartWrap) {
    chartWrap.style.display = hasData && state.trends.selected.size ? "" : "none";
  }

  if (!hasData) {
    if (trendsChartInstance) {
      trendsChartInstance.destroy();
      trendsChartInstance = null;
    }
    if (elements.trendsCaption) {
      elements.trendsCaption.textContent = "";
    }
    return;
  }

  renderModelPicker();
  renderTrendsChart();
  updateTrendsCaption();
}

function renderTrendsStatus() {
  if (!elements.trendsNote) return;
  const category = state.trends.category;
  if (state.trends.loading) {
    elements.trendsNote.textContent = t("trends.loading");
  } else if (!category || !TRENDS_SUPPORTED.has(category)) {
    elements.trendsNote.textContent = t("trends.unsupported");
  } else if (!state.trends.months.length) {
    elements.trendsNote.textContent = t("trends.empty");
  } else {
    elements.trendsNote.textContent = t("trends.note");
  }
}

function renderModelPicker() {
  const picker = elements.modelPicker;
  if (!picker) return;
  picker.innerHTML = "";
  state.trends.models.forEach((model) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (state.trends.selected.has(model.name) ? " selected" : "");
    chip.textContent = model.name;
    chip.addEventListener("click", () => {
      if (state.trends.selected.has(model.name)) {
        state.trends.selected.delete(model.name);
      } else {
        state.trends.selected.add(model.name);
      }
      chip.classList.toggle("selected");
      renderTrendsChart();
      const chartWrap = elements.trendsCanvas ? elements.trendsCanvas.parentElement : null;
      if (chartWrap) {
        chartWrap.style.display = state.trends.selected.size ? "" : "none";
      }
    });
    picker.appendChild(chip);
  });
}

function updateTrendsCaption() {
  if (!elements.trendsCaption) return;
  elements.trendsCaption.textContent = state.trends.months.length
    ? t(`trends.caption.${state.trends.mode}`)
    : "";
}

function isDarkThemeActive() {
  if (state.themeMode === "dark") return true;
  if (state.themeMode === "light") return false;
  return prefersDarkQuery ? prefersDarkQuery.matches : false;
}

function renderTrendsChart() {
  if (!elements.trendsCanvas || state.view !== "trends") return;
  if (state.trends.loading || !state.trends.months.length) return;

  const months = state.trends.months;
  const selected = [...state.trends.selected];
  if (!selected.length) {
    if (trendsChartInstance) {
      trendsChartInstance.destroy();
      trendsChartInstance = null;
    }
    return;
  }

  const mode = state.trends.mode;
  const palette = isDarkThemeActive() ? SERIES_PALETTE_DARK : SERIES_PALETTE_LIGHT;
  const colorIndex = new Map(state.trends.models.map((model, index) => [model.name, index]));
  const labels = months.map((month) => month.label);

  const datasets = selected.map((name) => {
    const color = palette[(colorIndex.get(name) ?? 0) % palette.length];
    return {
      label: name,
      data: months.map((month) => {
        const record = month.ranks.get(name);
        if (!record) return null;
        return mode === "rank" ? record.rank : Math.round(record.percentile * 10) / 10;
      }),
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      spanGaps: true,
      tension: 0.25,
    };
  });

  const textColor = getCssVariable("--color-text", "#212428");
  const gridColor = getCssVariable("--color-border", "#e3e1d9");
  const panelColor = getCssVariable("--color-panel", "#ffffff");

  if (trendsChartInstance) {
    trendsChartInstance.destroy();
  }

  trendsChartInstance = new Chart(elements.trendsCanvas.getContext("2d"), {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: { color: textColor, boxWidth: 12, boxHeight: 2, font: { size: 12 } },
        },
        tooltip: {
          backgroundColor: panelColor,
          titleColor: textColor,
          bodyColor: textColor,
          borderColor: gridColor,
          borderWidth: 1,
          callbacks: {
            label: (context) => {
              const record = months[context.dataIndex].ranks.get(context.dataset.label);
              if (!record) return context.dataset.label;
              const rankText = `#${record.rank}/${record.cohortSize}`;
              const scoreText = `${t("trends.tooltip.score")}: ${record.score}`;
              return mode === "rank"
                ? `${context.dataset.label}: ${rankText} (${scoreText})`
                : `${context.dataset.label}: ${record.percentile.toFixed(1)}% (${rankText})`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 11 }, maxRotation: 45, autoSkip: true },
        },
        y:
          mode === "rank"
            ? {
                reverse: true,
                min: 1,
                grid: { color: gridColor },
                ticks: { color: textColor, font: { size: 11 }, precision: 0 },
                title: { display: true, text: t("trends.mode.rank"), color: textColor, font: { size: 12 } },
              }
            : {
                min: 0,
                max: 100,
                grid: { color: gridColor },
                ticks: { color: textColor, font: { size: 11 }, callback: (value) => `${value}%` },
                title: {
                  display: true,
                  text: t("trends.mode.percentile"),
                  color: textColor,
                  font: { size: 12 },
                },
              },
      },
    },
  });
}

function getCssVariable(name, fallback = "") {
  if (typeof window === "undefined") return fallback;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function updateChartVisibility() {
  if (!elements.chartSection) return;

  const show =
    state.view === "board" &&
    !!CATEGORY_CHART_CONFIG[state.currentCategory] &&
    state.filteredRows.length > 0;

  elements.chartSection.style.display = show ? "block" : "none";
}

function renderChart() {
  if (!elements.chartCanvas || !elements.chartSection) return;

  const config = CATEGORY_CHART_CONFIG[state.currentCategory];
  if (state.view !== "board" || !config || state.filteredRows.length === 0) {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    if (elements.chartCaption) {
      elements.chartCaption.textContent = "";
    }
    return;
  }

  // 使用 CSV 原始列名定位（非翻译后名称）
  const yAxisType = elements.yAxisSelect ? elements.yAxisSelect.value : "cost";
  const yAxisColumnName = yAxisType === "cost" ? config.cost : config.time;
  // 推理类别交换横纵坐标：横轴 = 指标（成本/耗时），纵轴 = 分数
  const swapped = !!config.swapAxes;

  const scoreLabel =
    state.currentCategory === "code" ? t("chart.axis.multiTurnScore") : t("chart.axis.maxScore");
  const metricLabel = yAxisType === "cost" ? t("chart.axis.cost") : t("chart.axis.avgTime");

  let scoreIndex = -1;
  let metricIndex = -1;

  for (let i = 0; i < state.headers.length; i++) {
    const header = state.headers[i];
    if (header === config.score) scoreIndex = i;
    if (header === yAxisColumnName) metricIndex = i;
  }
  const modelIndex = findChartModelIndex(state.headers);

  if (scoreIndex === -1 || metricIndex === -1 || modelIndex === -1) {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    if (elements.chartCaption) {
      elements.chartCaption.textContent = "";
    }
    return;
  }

  const xAxisIndex = swapped ? metricIndex : scoreIndex;
  const yAxisIndex = swapped ? scoreIndex : metricIndex;
  const chartXLabel = swapped ? metricLabel : scoreLabel;
  const chartYLabel = swapped ? scoreLabel : metricLabel;

  const chartData = state.filteredRows
    .map((row) => {
      let xValue = parseSortableNumber(row.cells[xAxisIndex]);
      let yValue = parseSortableNumber(row.cells[yAxisIndex]);
      const modelName = row.cells[modelIndex] || "Unknown";

      if (xValue === null || yValue === null) return null;
      if (yAxisType === "cost" && state.locale === "en-US") {
        // 货币换算作用于指标值（交换后指标在横轴）
        if (swapped) {
          xValue = xValue / CNY_PER_USD;
        } else {
          yValue = yValue / CNY_PER_USD;
        }
      }

      return {
        x: xValue,
        y: yValue,
        label: modelName,
        isThink: row.isThink,
      };
    })
    .filter((item) => item !== null);

  if (chartData.length === 0) {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    if (elements.chartCaption) {
      elements.chartCaption.textContent = "";
    }
    return;
  }

  // 指标数值跨度超过一个数量级时启用对数轴（成本常横跨 ¥2–¥207）
  const metricValues = chartData.map((point) => (swapped ? point.x : point.y));
  const minMetric = Math.min(...metricValues);
  const maxMetric = Math.max(...metricValues);
  const useLogScale = minMetric > 0 && maxMetric / minMetric >= 15;

  const medianX = median(chartData.map((point) => point.x));
  const medianY = median(chartData.map((point) => point.y));
  // 性能 × 成本图以 40 分作为固定性能分界；成本分界仍取当月中位数。
  const quadrantX = yAxisType === "cost" && !swapped ? 40 : medianX;
  const quadrantY = yAxisType === "cost" && swapped ? 40 : medianY;

  const ctx = elements.chartCanvas.getContext("2d");
  const chartTextColor = getCssVariable("--color-text", "#212428");
  const chartGridColor = getCssVariable("--color-border", "#e3e1d9");
  const chartPanelColor = getCssVariable("--color-panel", "#ffffff");
  const chartThinkBg = getCssVariable("--color-chart-think-bg", "rgba(158, 59, 50, 0.62)");
  const chartThinkBorder = getCssVariable("--color-chart-think-border", "rgba(158, 59, 50, 1)");
  const chartDefaultBg = getCssVariable("--color-chart-default-bg", "rgba(31, 78, 121, 0.58)");
  const chartDefaultBorder = getCssVariable("--color-chart-default-border", "rgba(31, 78, 121, 1)");

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: t("chart.dataset.performance"),
          data: chartData,
          backgroundColor: (context) => {
            const point = context.raw;
            return point && point.isThink ? chartThinkBg : chartDefaultBg;
          },
          borderColor: (context) => {
            const point = context.raw;
            return point && point.isThink ? chartThinkBorder : chartDefaultBorder;
          },
          borderWidth: 1.5,
          pointRadius: 5,
          pointHoverRadius: 7,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: chartPanelColor,
          titleColor: chartTextColor,
          bodyColor: chartTextColor,
          borderColor: chartGridColor,
          borderWidth: 1,
          callbacks: {
            label: (context) => {
              const point = context.raw;
              const metricValue = swapped ? point.x : point.y;
              const metricText =
                yAxisType === "cost"
                  ? state.locale === "en-US"
                    ? formatUsd(metricValue)
                    : `¥${metricValue}`
                  : `${metricValue}`;
              return [
                `${t("chart.tooltip.model")}: ${point.label}`,
                `${chartXLabel}: ${swapped ? metricText : point.x}`,
                `${chartYLabel}: ${swapped ? point.y : metricText}`,
              ];
            },
          },
        },
        quadrants: {
          medianX: quadrantX,
          medianY: quadrantY,
          sweetBg: getCssVariable("--color-chart-quadrant-sweet", "rgba(58, 107, 79, 0.05)"),
          lineColor: getCssVariable("--color-chart-median-line", "rgba(111, 108, 101, 0.75)"),
          labelColor: getCssVariable("--color-chart-quadrant-label", "rgba(111, 108, 101, 0.9)"),
          // 交换坐标后象限含义随之旋转：右上↔右下、左上↔左下
          labels: swapped
            ? {
                tr: t(`chart.quad.${yAxisType}.tr`),
                br: t(`chart.quad.${yAxisType}.tl`),
                tl: t(`chart.quad.${yAxisType}.br`),
                bl: t(`chart.quad.${yAxisType}.bl`),
              }
            : {
                tr: t(`chart.quad.${yAxisType}.tr`),
                br: t(`chart.quad.${yAxisType}.br`),
                tl: t(`chart.quad.${yAxisType}.tl`),
                bl: t(`chart.quad.${yAxisType}.bl`),
              },
        },
        pointLabels: {
          display: true,
          fontSize: 11,
          thinkColor: chartThinkBorder,
          defaultColor: chartDefaultBorder,
        },
      },
      scales: {
        x: {
          type: swapped && useLogScale ? "logarithmic" : "linear",
          suggestedMin: yAxisType === "cost" && !swapped ? 40 : undefined,
          suggestedMax: yAxisType === "cost" && !swapped ? 40 : undefined,
          title: {
            display: true,
            text: chartXLabel,
            color: chartTextColor,
            font: {
              size: 13,
              weight: "600",
            },
          },
          grid: {
            color: chartGridColor,
          },
          ticks: {
            color: chartTextColor,
            font: {
              size: 11,
            },
          },
        },
        y: {
          type: !swapped && useLogScale ? "logarithmic" : "linear",
          suggestedMin: yAxisType === "cost" && swapped ? 40 : undefined,
          suggestedMax: yAxisType === "cost" && swapped ? 40 : undefined,
          title: {
            display: true,
            text: chartYLabel,
            color: chartTextColor,
            font: {
              size: 13,
              weight: "600",
            },
          },
          grid: {
            color: chartGridColor,
          },
          ticks: {
            color: chartTextColor,
            font: {
              size: 11,
            },
          },
        },
      },
    },
    plugins: [quadrantPlugin, pointLabelsPlugin],
  });

  if (elements.chartCaption) {
    elements.chartCaption.textContent = t(`chart.caption.${yAxisType}`);
  }
}
