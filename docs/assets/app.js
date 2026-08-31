import {
  FALLBACK_LOCALE,
  SUPPORTED_LOCALES,
  getCurrentLocale,
  getLocaleLabel,
  onLocaleChange,
  setLocale,
  t,
} from "./i18n.js?v=20260831-token-efficiency";
import {
  CATEGORY_CHART_CONFIG,
  CATEGORY_ORDER,
  CNY_PER_USD,
  DEFAULT_COUNTRY_FILTER,
  DEFAULT_INFERENCE_FILTER,
  HIDDEN_CATEGORIES,
  MOBILE_BREAKPOINT_PX,
  MODEL_HEADER_CANDIDATES,
  TRENDS_DEFAULT_SELECTED,
  TRENDS_MAX_MONTHS,
  TRENDS_RECENT_MONTHS,
  TRENDS_SUPPORTED,
  buildCodeV3InsightIndex,
  buildDatasetKey,
  classifyModelCountry,
  extractCodeV3TaskId,
  getDatasetDirectoryFromPath,
  getModelFamily,
  isCodeV3AuxiliaryHeader,
  isThinkRow,
  normalizeCountryFilter,
  normalizeInferenceFilter,
  parseCodeV3RankGrade as parseCodeV3RankGradeValue,
  parseCsv,
  parseSortableNumber,
  resolveCodeV3Insight,
  sortRows as sortBenchmarkRows,
} from "./benchmark-domain.js?v=20260831-token-efficiency";
import { createCharts } from "./charts.js?v=20260831-token-efficiency";

const DATASET_TITLE_KEYS = {
  月榜: "dataset.title.monthly",
};

const DEFAULT_DATASET_TITLE_KEY = "dataset.title.default";

const HEADER_TRANSLATIONS = {
  模型: "table.header.model",
  极限分数: "table.header.maxScore",
  中位分数: "table.header.medianScore",
  中位差距: "table.header.medianGap",
  "平均耗时(秒)": "table.header.avgTimeSeconds",
  发布时间: "table.header.releaseDate",
  变更: "table.header.change",
  平均Token: "table.header.avgTokens",
  "平均耗时/s": "table.header.avgTimePerSecond",
  成本: "table.header.cost",
  "价格(元/百万)": "table.header.pricePerMillion",
  "测试成本(元)": "table.header.testCostCny",
};

const THEME_STORAGE_KEY = "llm-dashboard-theme";
const THEME_MODES = ["system", "light", "dark"];
const prefersDarkQuery =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

const MODEL_LOGO_MAP_PATH = "data/model-logo-map.json";
const VALID_VIEWS = new Set(["board", "trends"]);

// 货币本地化：数据层始终是人民币，仅展示层在英文界面按固定汇率换算。
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

const MOBILE_CARD_LAYOUTS = {
  logic: {
    className: "mobile-card--logic",
    suppressDetails: true,
    rows: [
      {
        className: "mobile-card-row--hero",
        columns: 3,
        fields: [
          "极限分数",
          "中位分数",
          { candidates: ["中位差距"], tone: "muted" },
        ],
      },
      {
        className: "mobile-card-row--secondary",
        columns: 3,
        fields: ["测试成本(元)", "Token", "价格(元/百万)"],
      },
      {
        className: "mobile-card-row--tertiary",
        columns: 2,
        fields: ["平均耗时(秒)", "发布时间"],
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
          "极限分数",
          "中位分数",
          { candidates: ["中位差距"], tone: "muted" },
        ],
      },
      {
        className: "mobile-card-row--secondary",
        columns: 3,
        fields: ["成本", "平均Token", "价格(元/百万)"],
      },
      {
        className: "mobile-card-row--tertiary",
        columns: 2,
        fields: ["平均耗时/s", "发布时间"],
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
    footerNoteField: ["IDE/CLI", "Scaffold"],
  },
  default: {
    className: "mobile-card--default",
    fieldGroups: [],
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
  modelLogos: {
    matchers: [],
    images: new Map(),
  },
  insights: createEmptyCodeV3InsightIndex(),
  trends: {
    category: null,
    mode: "rank",
    months: [],
    models: [],
    selected: new Set(),
    loadedCategory: null,
    loading: false,
  },
};

const csvCache = new Map();
const insightCache = new Map();

const elements = {
  categoryNav: document.getElementById("viewTabsCategories"),
  datasetSelect: document.getElementById("datasetSelect"),
  inferenceFilter: document.getElementById("inferenceFilter"),
  countryFilter: document.getElementById("countryFilter"),
  searchInput: document.getElementById("searchInput"),
  tableStickyScope: document.getElementById("tableStickyScope"),
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

const charts = createCharts({
  state,
  elements,
  prefersDarkQuery,
  findModelColumnIndex,
  getModelLogoImage,
});
let isApplyingHashState = false;
let insightPopover = null;
let insightBackdrop = null;
let activeInsightCell = null;

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

function createEmptyCodeV3InsightIndex() {
  return {
    schemaVersion: 1,
    datasetKey: "",
    defaultLocale: FALLBACK_LOCALE,
    byRow: new Map(),
  };
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
      charts.renderTrends();
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
      charts.renderChart();
      charts.renderTrendsChart();
    });
  }

  const handleSystemThemeChange = () => {
    if (state.themeMode !== "system") return;
    charts.renderChart();
    charts.renderTrendsChart();
  };

  if (prefersDarkQuery && typeof prefersDarkQuery.addEventListener === "function") {
    prefersDarkQuery.addEventListener("change", handleSystemThemeChange);
  } else if (prefersDarkQuery && typeof prefersDarkQuery.addListener === "function") {
    prefersDarkQuery.addListener(handleSystemThemeChange);
  }
}

function updateStaticCopy() {
  const documentTitle = t("app.documentTitle");
  const metaDescription = t("app.metaDescription");
  const socialDescription = t("app.socialDescription");

  document.title = documentTitle;
  updateMetaContent('meta[name="description"]', metaDescription);
  updateMetaContent('meta[property="og:title"]', documentTitle);
  updateMetaContent('meta[property="og:description"]', socialDescription);
  updateMetaContent('meta[property="og:locale"]', state.locale.replace("-", "_"));
  updateMetaContent('meta[name="twitter:title"]', documentTitle);
  updateMetaContent('meta[name="twitter:description"]', socialDescription);
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
  updateChartMetricOptions();
  if (elements.footerNote) {
    elements.footerNote.textContent = t("footer.note");
  }
  if (elements.viewTabs) {
    elements.viewTabs.setAttribute("aria-label", t("view.tabs.aria"));
  }
  if (elements.viewTabBoard) {
    const boardLabel = t("view.board");
    elements.viewTabBoard.setAttribute("aria-label", boardLabel);
    elements.viewTabBoard.title = boardLabel;
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
        { value: "rank", label: t("trends.mode.rank") },
        { value: "percentile", label: t("trends.mode.percentile") },
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

function updateChartMetricOptions() {
  if (!elements.yAxisSelect) return;
  const config = state.currentCategory
    ? CATEGORY_CHART_CONFIG[state.currentCategory]
    : null;
  const ariaKey = config?.swapAxes ? "chart.xAxis.aria" : "chart.yAxis.aria";
  const options = [
    { value: "cost", label: t("chart.yAxis.option.cost") },
    { value: "time", label: t("chart.yAxis.option.time") },
  ];
  if (config?.token) {
    options.push({ value: "token", label: t("chart.yAxis.option.token") });
  }

  elements.yAxisSelect.setAttribute("aria-label", t(ariaKey));
  setSelectOptions(
    elements.yAxisSelect,
    options,
    elements.yAxisSelect.value || "cost"
  );
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

function updateMetaContent(selector, content) {
  const element = document.head.querySelector(selector);
  if (element) {
    element.setAttribute("content", content);
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
  const [manifest] = await Promise.all([fetchManifest(), loadModelLogoAssets()]);
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

async function loadModelLogoAssets() {
  try {
    const response = await fetch(MODEL_LOGO_MAP_PATH, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Unable to load model logo map: ${response.status}`);
    }

    const payload = await response.json();
    const prefixToLogo = payload?.prefixToLogo || {};
    const prefixAliases = payload?.prefixAliases || {};
    const matchers = [];

    Object.entries(prefixAliases).forEach(([prefix, aliases]) => {
      const logoPath = prefixToLogo[prefix];
      if (!logoPath || !Array.isArray(aliases)) return;
      aliases.forEach((alias) => {
        const normalizedAlias = String(alias || "").trim().toLowerCase();
        if (!normalizedAlias) return;
        matchers.push({ alias: normalizedAlias, logoPath });
      });
    });

    // Longer aliases win, e.g. "OpenAI o" is checked before shorter families.
    matchers.sort((a, b) => b.alias.length - a.alias.length);
    state.modelLogos.matchers = matchers;

    const logoPaths = [...new Set(matchers.map((matcher) => matcher.logoPath))];
    const loaded = await Promise.all(
      logoPaths.map(async (logoPath) => [logoPath, await loadLogoImage(logoPath)])
    );
    loaded.forEach(([logoPath, image]) => {
      if (image) {
        state.modelLogos.images.set(logoPath, image);
      }
    });
  } catch (error) {
    // Logo is progressive enhancement: the chart remains usable with circles.
    console.warn("Unable to initialize model logos; using circle markers.", error);
    state.modelLogos.matchers = [];
    state.modelLogos.images.clear();
  }
}

function loadLogoImage(path) {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => {
      console.warn(`Unable to load model logo: ${path}`);
      resolve(null);
    };
    image.src = path;
  });
}

function getModelLogoPath(modelName) {
  const normalizedName = String(modelName || "").trim().toLowerCase();
  if (!normalizedName) return null;
  const matcher = state.modelLogos.matchers.find(({ alias }) =>
    normalizedName.startsWith(alias)
  );
  return matcher && state.modelLogos.images.has(matcher.logoPath) ? matcher.logoPath : null;
}

function getModelLogoImage(modelName) {
  const logoPath = getModelLogoPath(modelName);
  return logoPath ? state.modelLogos.images.get(logoPath) || null : null;
}

function createModelLogoSlot(modelName) {
  const slot = document.createElement("span");
  slot.className = "model-logo-slot";
  slot.setAttribute("aria-hidden", "true");

  const logoPath = getModelLogoPath(modelName);
  if (logoPath) {
    const logo = document.createElement("img");
    logo.className = "model-logo";
    logo.src = logoPath;
    logo.alt = "";
    slot.appendChild(logo);
  }

  return slot;
}

function appendModelNameContent(target, modelName) {
  const content = document.createElement("span");
  content.className = "model-name-content";
  content.appendChild(createModelLogoSlot(modelName));

  const label = document.createElement("span");
  label.className = "model-name-label";
  label.textContent = modelName;
  content.appendChild(label);
  target.appendChild(content);
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
      charts.renderChart();
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
      ensureTrendsData().then(charts.renderTrends);
      syncHashFromState();
    });
  }

  if (elements.trendsModeSelect) {
    elements.trendsModeSelect.addEventListener("change", (event) => {
      state.trends.mode = event.target.value === "rank" ? "rank" : "percentile";
      charts.renderTrendsChart();
      charts.updateTrendsCaption();
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
    hideCodeV3InsightPopover();
    const isMobile = isMobileViewport();
    if (isMobile === wasMobileViewport) return;
    wasMobileViewport = isMobile;
    renderTable();
  });
  elements.tableContainer.addEventListener(
    "scroll",
    () => {
      syncStickyTableHeaderScroll();
      hideCodeV3InsightPopover();
    },
    { passive: true }
  );
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !activeInsightCell) return;
    const target = activeInsightCell;
    hideCodeV3InsightPopover();
    if (target.isConnected) target.focus();
  });
}

async function handleCategoryChange(category, options = {}) {
  const { preferredDatasetKey = null } = options;
  state.currentCategory = category;
  updateMetricAxisLabel();
  updateChartMetricOptions();
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
  state.insights = createEmptyCodeV3InsightIndex();
  hideCodeV3InsightPopover();
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

  state.insights = createEmptyCodeV3InsightIndex();
  hideCodeV3InsightPopover();
  const [{ headers, rows }, insights] = await Promise.all([
    fetchCsvDataset(dataset.csv),
    fetchCodeV3Insights(dataset.insights),
  ]);
  state.insights = insights;
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
  const modelColumnIndex = findModelColumnIndex(displayHeaders);
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

async function fetchCodeV3Insights(path) {
  if (!path) return createEmptyCodeV3InsightIndex();
  if (insightCache.has(path)) {
    return insightCache.get(path);
  }

  const promise = (async () => {
    try {
      const response = await fetch(path, { cache: "no-cache" });
      if (!response.ok) {
        throw new Error(`Unable to load Code V3 insights: ${path} (${response.status})`);
      }
      return buildCodeV3InsightIndex(await response.json());
    } catch (error) {
      console.warn("Code V3 insights are unavailable; continuing without detail cards.", error);
      return createEmptyCodeV3InsightIndex();
    }
  })();

  insightCache.set(path, promise);
  return promise;
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
  charts.updateChartVisibility();
  charts.renderChart();
}

function sortRows(rows, columnIndex, direction) {
  return sortBenchmarkRows(rows, columnIndex, direction, {
    currentCategory: state.currentCategory,
    headers: state.headers,
    collator: state.collator,
  });
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
  return parseCodeV3RankGradeValue(value);
}

function formatCodeV3Price(priceCny) {
  if (!priceCny) return null;
  if (state.locale !== "en-US") return `¥${priceCny}`;
  return formatUsd(Number(priceCny) / CNY_PER_USD);
}

function appendCodeV3ValueContent(target, value) {
  const parsed = parseCodeV3RankGrade(value);
  if (!parsed) {
    target.textContent = value;
    return;
  }

  const result = document.createElement("span");
  result.className = "codev3-result";
  const score = document.createElement("span");
  score.className = "codev3-score";

  const rank = document.createElement("span");
  rank.className = "codev3-rank";
  rank.textContent = `${parsed.rank}/`;
  score.appendChild(rank);

  const grade = document.createElement("span");
  grade.className = `codev3-grade codev3-grade--${parsed.gradeBase.toLowerCase()}`;
  grade.textContent = parsed.grade;
  score.appendChild(grade);
  result.appendChild(score);

  const price = formatCodeV3Price(parsed.priceCny);
  if (price) {
    const priceLabel = document.createElement("span");
    priceLabel.className = "codev3-price";
    priceLabel.textContent = price;
    result.appendChild(priceLabel);
  }

  target.appendChild(result);
}

function ensureCodeV3InsightPopover() {
  if (insightPopover) return insightPopover;

  insightBackdrop = document.createElement("div");
  insightBackdrop.className = "codev3-insight-backdrop";
  insightBackdrop.setAttribute("aria-hidden", "true");
  insightBackdrop.addEventListener("click", () => hideCodeV3InsightPopover());
  document.body.appendChild(insightBackdrop);

  insightPopover = document.createElement("aside");
  insightPopover.id = "codev3InsightPopover";
  insightPopover.className = "codev3-insight-popover";
  insightPopover.setAttribute("role", "tooltip");
  insightPopover.setAttribute("aria-hidden", "true");
  document.body.appendChild(insightPopover);
  return insightPopover;
}

function getInsightKindLabel(kind) {
  return t(`insight.type.${kind}`, undefined, kind);
}

function buildCodeV3InsightPopoverContent({ rowId, taskId, taskLabel, insight }) {
  const fragment = document.createDocumentFragment();
  const header = document.createElement("header");
  header.className = "codev3-insight-header";

  const heading = document.createElement("div");
  const kicker = document.createElement("p");
  kicker.className = "codev3-insight-kicker";
  kicker.textContent = `${t("insight.task", { id: taskId })} · ${taskLabel}`;

  const title = document.createElement("h3");
  title.className = "codev3-insight-title";
  title.textContent = rowId;
  heading.appendChild(kicker);
  heading.appendChild(title);
  header.appendChild(heading);

  const actions = document.createElement("div");
  actions.className = "codev3-insight-actions";

  const closeButton = document.createElement("button");
  closeButton.className = "codev3-insight-close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", t("insight.close"));
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => {
    const target = activeInsightCell;
    hideCodeV3InsightPopover();
    if (target?.isConnected) target.focus();
  });
  actions.appendChild(closeButton);
  header.appendChild(actions);
  fragment.appendChild(header);

  const list = document.createElement("ul");
  list.className = "codev3-insight-list";
  insight.lines.forEach((line) => {
    const item = document.createElement("li");
    item.className = `codev3-insight-line codev3-insight-line--${line.kind}`;
    item.setAttribute("aria-label", `${getInsightKindLabel(line.kind)}：${line.text}`);

    const marker = document.createElement("span");
    marker.className = "codev3-insight-marker";
    marker.textContent = line.marker;
    marker.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.className = "codev3-insight-text";
    text.textContent = line.text;
    item.appendChild(marker);
    item.appendChild(text);
    list.appendChild(item);
  });
  fragment.appendChild(list);
  return fragment;
}

function positionCodeV3InsightPopover(cell, popover) {
  const cellRect = cell.getBoundingClientRect();
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  const viewportPadding = 12;
  const gap = 10;

  const left = Math.min(
    window.innerWidth - width - viewportPadding,
    Math.max(viewportPadding, cellRect.left + cellRect.width / 2 - width / 2)
  );
  const fitsBelow = cellRect.bottom + gap + height <= window.innerHeight - viewportPadding;
  const placement = fitsBelow ? "bottom" : "top";
  const top = fitsBelow ? cellRect.bottom + gap : Math.max(viewportPadding, cellRect.top - height - gap);

  popover.dataset.placement = placement;
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
  popover.style.setProperty(
    "--insight-anchor-x",
    `${Math.round(Math.min(width - 18, Math.max(18, cellRect.left + cellRect.width / 2 - left)))}px`
  );
}

function showCodeV3InsightPopover(cell, context, { mobile = false } = {}) {
  const popover = ensureCodeV3InsightPopover();
  if (activeInsightCell && activeInsightCell !== cell) {
    activeInsightCell.classList.remove("insight-active");
    if (activeInsightCell.hasAttribute("aria-expanded")) {
      activeInsightCell.setAttribute("aria-expanded", "false");
    }
  }
  activeInsightCell = cell;
  cell.classList.add("insight-active");
  if (cell.hasAttribute("aria-expanded")) {
    cell.setAttribute("aria-expanded", "true");
  }

  popover.classList.remove("is-visible");
  popover.classList.toggle("codev3-insight-popover--mobile", mobile);
  popover.replaceChildren(buildCodeV3InsightPopoverContent(context));
  popover.setAttribute("role", mobile ? "dialog" : "tooltip");
  popover.setAttribute("aria-label", `${context.rowId} · ${context.taskLabel}`);
  popover.setAttribute("aria-hidden", "false");
  if (mobile) {
    popover.dataset.placement = "mobile";
    popover.style.removeProperty("left");
    popover.style.removeProperty("top");
    popover.style.removeProperty("--insight-anchor-x");
  } else {
    positionCodeV3InsightPopover(cell, popover);
  }
  void popover.offsetWidth;
  popover.classList.add("is-visible");
  insightBackdrop?.classList.toggle("is-visible", mobile);
}

function hideCodeV3InsightPopover(cell = null) {
  if (cell && activeInsightCell !== cell) return;
  if (activeInsightCell) {
    activeInsightCell.classList.remove("insight-active");
    if (activeInsightCell.hasAttribute("aria-expanded")) {
      activeInsightCell.setAttribute("aria-expanded", "false");
    }
  }
  activeInsightCell = null;
  if (!insightPopover) return;
  insightPopover.classList.remove("is-visible");
  insightPopover.setAttribute("aria-hidden", "true");
  insightBackdrop?.classList.remove("is-visible");
}

function getCodeV3InsightContext(rowId, header) {
  const taskId = extractCodeV3TaskId(header);
  if (!rowId || !taskId) return null;
  const insight = resolveCodeV3Insight(state.insights, rowId, taskId, state.locale);
  if (!insight) return null;

  const taskLabel = String(header).replace(/\s*\([A-Z]\)\s*$/, "").trim();
  return { rowId, taskId, taskLabel, insight };
}

function attachCodeV3InsightCell(cell, { rowId, header }) {
  const context = getCodeV3InsightContext(rowId, header);
  if (!context) return;
  const popover = ensureCodeV3InsightPopover();
  cell.classList.add("codev3-cell--has-insight");
  cell.tabIndex = 0;
  cell.setAttribute("aria-describedby", popover.id);
  cell.addEventListener("mouseenter", () => showCodeV3InsightPopover(cell, context));
  cell.addEventListener("mouseleave", () => hideCodeV3InsightPopover(cell));
  cell.addEventListener("focus", () => showCodeV3InsightPopover(cell, context));
  cell.addEventListener("blur", () => hideCodeV3InsightPopover(cell));
}

function attachMobileCodeV3InsightTarget(target, { rowId, header }) {
  const context = getCodeV3InsightContext(rowId, header);
  if (!context) return;
  const popover = ensureCodeV3InsightPopover();
  target.classList.add("mobile-codev3-insight-trigger");
  target.tabIndex = 0;
  target.setAttribute("role", "button");
  target.setAttribute("aria-haspopup", "dialog");
  target.setAttribute("aria-controls", popover.id);
  target.setAttribute("aria-expanded", "false");

  const toggle = () => {
    const isAlreadyOpen =
      activeInsightCell === target && popover.classList.contains("is-visible");
    if (isAlreadyOpen) {
      hideCodeV3InsightPopover(target);
    } else {
      showCodeV3InsightPopover(target, context, { mobile: true });
    }
  };

  target.addEventListener("click", toggle);
  target.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle();
  });
}

function findModelColumnIndex(headers) {
  return MODEL_HEADER_CANDIDATES.reduce((foundIndex, candidate) => {
    if (foundIndex !== -1) return foundIndex;
    return headers.indexOf(candidate);
  }, -1);
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
      rawHeader,
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

function appendStructuredMetric(rowElement, metric, rowId = "") {
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
  if (state.currentCategory === "code_v3") {
    attachMobileCodeV3InsightTarget(item, { rowId, header: metric.rawHeader });
  }
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
    rawHeader,
    statusClass: getCodeV3StatusClass(value),
  };
}

function renderCodeV3PrimaryRows(card, row, modelColumnIndex, usedIndices) {
  const primaryIndices = getCodeV3PrimaryHeaderIndices(modelColumnIndex).filter(
    (index) => !usedIndices.has(index) && normalizeCellValue(row.cells[index])
  );

  if (!primaryIndices.length) return false;

  // Keep all project results in one semantic grid. CSS can then switch the
  // grid from three to two columns on narrow phones without leaving holes
  // created by hard-coded, three-item DOM rows.
  const rowElement = document.createElement("div");
  rowElement.className = "mobile-card-row mobile-card-row--codev3-primary";
  const rowId = modelColumnIndex >= 0 ? String(row.cells[modelColumnIndex] ?? "").trim() : "";

  primaryIndices.forEach((index) => {
    const metric = buildMetricFromIndex(row, index, usedIndices);
    if (metric) {
      appendStructuredMetric(rowElement, metric, rowId);
    }
  });

  card.appendChild(rowElement);

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
  const rowId = modelColumnIndex >= 0 ? String(row.cells[modelColumnIndex] ?? "").trim() : "";

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

    rowMetrics.forEach((metric) => appendStructuredMetric(rowElement, metric, rowId));
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
  appendModelNameContent(title, modelValue || t("table.mobile.unknownModel"));
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
  const modelColumnIndex = findModelColumnIndex(state.headers);

  state.filteredRows.forEach((row) => {
    list.appendChild(createMobileCard(row, layout, headerIndexMap, modelColumnIndex));
  });

  container.appendChild(list);
}

function renderTable() {
  const container = elements.tableContainer;
  hideCodeV3InsightPopover();
  cleanupStickyTableHeader();
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
  const modelColumnIndex = findModelColumnIndex(state.headers);
  const isCodeV3Table = state.currentCategory === "code_v3";
  // 成本列（logic 为“测试成本(元)”，vision 为“成本”）：用于 hover 局部对比
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
    const rowId = modelColumnIndex >= 0 ? String(row.cells[modelColumnIndex] ?? "").trim() : "";
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
      if (columnIndex === modelColumnIndex) {
        appendModelNameContent(td, displayValue);
      } else {
        appendCodeV3ValueContent(td, displayValue);
      }

      if (isCodeV3Table && columnIndex !== modelColumnIndex) {
        attachCodeV3InsightCell(td, {
          rowId,
          header: state.headers[columnIndex],
        });
      }

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
  prepareStickyTableHeader();
}

function prepareStickyTableHeader() {
  const container = elements.tableContainer;
  const scope = elements.tableStickyScope;
  const table = container.querySelector("table");
  const thead = container.querySelector("thead");
  if (!scope || !table || !thead || !container.classList.contains("table-container--codev3")) return;

  const stickyHeader = document.createElement("div");
  stickyHeader.className = "sticky-table-header";
  stickyHeader.setAttribute("aria-hidden", "true");

  const viewport = document.createElement("div");
  viewport.className = "table-container table-container--codev3 sticky-table-header-viewport";

  const clonedTable = table.cloneNode(false);
  const clonedHead = thead.cloneNode(true);
  clonedHead.querySelectorAll("th").forEach((th, index) => {
    th.addEventListener("click", () => toggleSort(index));
  });
  clonedTable.appendChild(clonedHead);
  viewport.appendChild(clonedTable);
  stickyHeader.appendChild(viewport);
  scope.prepend(stickyHeader);
  syncStickyTableHeaderScroll();
}

function cleanupStickyTableHeader() {
  elements.tableStickyScope?.querySelector(".sticky-table-header")?.remove();
}

function syncStickyTableHeaderScroll() {
  const viewport = elements.tableStickyScope?.querySelector(".sticky-table-header-viewport");
  if (viewport) viewport.scrollLeft = elements.tableContainer.scrollLeft;
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
    ["skip", t("codev3Note.skip")],
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

  const projectGuide = hasNewMode
    ? [
        `<h3>${t("codev3Note.projectsTitle")}</h3>`,
        `<p>${t("codev3Note.projectC")}</p>`,
        `<p>${t("codev3Note.projectE")}</p>`,
        `<p>${t("codev3Note.projectF")}</p>`,
        `<p>${t("codev3Note.projectH")}</p>`,
        `<p>${t("codev3Note.projectI")}</p>`,
        `<p>${t("codev3Note.projectJ")}</p>`,
        `<p>${t("codev3Note.projectK")}</p>`,
        `<p>${t("codev3Note.projectL")}</p>`,
      ].join("")
    : "";

  note.innerHTML = [
    `<h3>${t("codev3Note.title")}</h3>`,
    `<ul class="grade-list">${gradeList}</ul>`,
    `<p>${t("codev3Note.halfGrade")}</p>`,
    projectGuide,
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
  cleanupStickyTableHeader();
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
    ensureTrendsData().then(charts.renderTrends);
  } else {
    if (!state.currentDatasetKey && state.currentCategory) {
      handleCategoryChange(state.currentCategory);
    } else {
      charts.updateChartVisibility();
      charts.renderChart();
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
  charts.renderTrendsStatus();

  const config = CATEGORY_CHART_CONFIG[category];
  const entries = state.manifest
    .filter((entry) => entry.category === category && (entry.title === "月榜" || !entry.title))
    .sort((a, b) => (a.reportDate < b.reportDate ? -1 : a.reportDate > b.reportDate ? 1 : 0))
    .slice(-TRENDS_MAX_MONTHS);

  const months = await Promise.all(
    entries.map(async (entry) => {
      try {
        const { headers, rows } = await fetchCsvDataset(entry.csv);
        const scoreIndex = headers.indexOf(config.score);
        const modelIndex = findModelColumnIndex(headers);
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
