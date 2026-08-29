const SUPPORTED_LOCALES = ["zh-CN", "en-US"];
const FALLBACK_LOCALE = "zh-CN";
const STORAGE_KEY = "llm-dashboard-locale";

const LOCALE_LABELS = {
  "zh-CN": "中文",
  "en-US": "English",
};

/** @type {Record<string, Record<string, string>>} */
const TRANSLATIONS = {
  "app.title": {
    "zh-CN": "致知",
    "en-US": "LLM Benchmark Dashboard",
  },
  "app.documentTitle": {
    "zh-CN": "致知｜大模型智力长期追踪榜单",
    "en-US": "LLM Benchmark Dashboard | Long-Term Model Rankings",
  },
  "app.metaDescription": {
    "zh-CN": "致知持续追踪主流大语言模型在逻辑、编程与视觉等私有基准上的表现，提供月度榜单、模型筛选、成本与趋势对比。",
    "en-US": "Track leading large language models across private logic, coding, and vision benchmarks with monthly rankings, model filters, cost analysis, and performance trends.",
  },
  "app.socialDescription": {
    "zh-CN": "持续追踪主流大语言模型在逻辑、编程与视觉等私有基准上的表现，对比月度排名、成本与长期趋势。",
    "en-US": "Compare leading language models on private logic, coding, and vision benchmarks through monthly rankings, costs, and long-term trends.",
  },
  "header.subtitle": {
    "zh-CN": "大模型智力长期追踪榜单",
    "en-US": "Long-term evaluation of large language models on private benchmarks",
  },
  "controls.category.label": {
    "zh-CN": "数据类别",
    "en-US": "Category",
  },
  "controls.category.aria": {
    "zh-CN": "选择数据类别",
    "en-US": "Select data category",
  },
  "controls.dataset.label": {
    "zh-CN": "数据集",
    "en-US": "Dataset",
  },
  "controls.dataset.aria": {
    "zh-CN": "选择数据集",
    "en-US": "Choose a dataset",
  },
  "controls.inference.label": {
    "zh-CN": "模型模式",
    "en-US": "Model mode",
  },
  "controls.inference.aria": {
    "zh-CN": "筛选模型模式",
    "en-US": "Filter model mode",
  },
  "controls.inference.option.all": {
    "zh-CN": "全部模型",
    "en-US": "All models",
  },
  "controls.inference.option.think": {
    "zh-CN": "仅推理模型",
    "en-US": "Reasoning models only",
  },
  "controls.inference.option.nonThink": {
    "zh-CN": "仅非推理模型",
    "en-US": "Non-reasoning models only",
  },
  "controls.country.label": {
    "zh-CN": "模型国家",
    "en-US": "Model country",
  },
  "controls.country.aria": {
    "zh-CN": "筛选模型国家",
    "en-US": "Filter model country",
  },
  "controls.country.option.all": {
    "zh-CN": "全部模型",
    "en-US": "All models",
  },
  "controls.country.option.china": {
    "zh-CN": "中国模型",
    "en-US": "Chinese models",
  },
  "controls.country.option.usa": {
    "zh-CN": "美国模型",
    "en-US": "US models",
  },
  "controls.country.option.other": {
    "zh-CN": "其他模型",
    "en-US": "Other models",
  },
  "controls.search.label": {
    "zh-CN": "搜索",
    "en-US": "Search",
  },
  "controls.search.aria": {
    "zh-CN": "按模型或字段筛选",
    "en-US": "Filter by model or column",
  },
  "controls.search.placeholder": {
    "zh-CN": "按模型或字段关键字过滤",
    "en-US": "Filter by model or column keywords",
  },
  "placeholders.loadingError": {
    "zh-CN": "加载数据失败，请稍后重试。",
    "en-US": "Failed to load data. Please try again soon.",
  },
  "placeholders.loadingData": {
    "zh-CN": "正在加载数据资源...",
    "en-US": "Loading data resources...",
  },
  "placeholders.noDatasets": {
    "zh-CN": "未找到任何数据集",
    "en-US": "No datasets found.",
  },
  "placeholders.loadingCategory": {
    "zh-CN": "正在加载数据集列表...",
    "en-US": "Loading dataset list...",
  },
  "placeholders.emptyCategory": {
    "zh-CN": "该类别暂无可用数据。",
    "en-US": "No datasets available for this category.",
  },
  "placeholders.datasetNotFound": {
    "zh-CN": "无法找到所选数据集。",
    "en-US": "The selected dataset could not be found.",
  },
  "placeholders.loadingTable": {
    "zh-CN": "正在加载表格...",
    "en-US": "Loading table...",
  },
  "placeholders.selectDataset": {
    "zh-CN": "请选择数据集开始浏览。",
    "en-US": "Select a dataset to start exploring.",
  },
  "placeholders.noMatches": {
    "zh-CN": "当前筛选条件下没有匹配的记录。",
    "en-US": "No records match the current filters.",
  },
  "errors.manifestLoad": {
    "zh-CN": "无法加载清单：{{status}}",
    "en-US": "Unable to load dataset manifest: {{status}}",
  },
  "errors.csvLoad": {
    "zh-CN": "无法加载 CSV：{{path}}",
    "en-US": "Unable to load CSV: {{path}}",
  },
  "category.code_v3": {
    "zh-CN": "Agentic",
    "en-US": "Agentic",
  },
  "category.logic": {
    "zh-CN": "推理",
    "en-US": "Logic",
  },
  "category.vision": {
    "zh-CN": "视觉",
    "en-US": "Vision",
  },
  "dataset.title.default": {
    "zh-CN": "主要数据",
    "en-US": "Primary data",
  },
  "dataset.title.monthly": {
    "zh-CN": "月榜",
    "en-US": "Monthly ranking",
  },
  "table.header.model": {
    "zh-CN": "模型",
    "en-US": "Model",
  },
  "table.header.maxScore": {
    "zh-CN": "极限分数",
    "en-US": "Max",
  },
  "table.header.medianScore": {
    "zh-CN": "中位分数",
    "en-US": "Median",
  },
  "table.header.medianGap": {
    "zh-CN": "中位差距",
    "en-US": "Gap",
  },
  "table.header.avgTimeSeconds": {
    "zh-CN": "平均耗时(秒)",
    "en-US": "Avg Time (s)",
  },
  "table.header.releaseDate": {
    "zh-CN": "发布时间",
    "en-US": "Release Date",
  },
  "table.header.change": {
    "zh-CN": "变更",
    "en-US": "Changed",
  },
  "table.header.avgTokens": {
    "zh-CN": "平均Token",
    "en-US": "Avg Tokens",
  },
  "table.header.avgTimePerSecond": {
    "zh-CN": "平均耗时/s",
    "en-US": "Avg Time (sec.)",
  },
  "table.header.cost": {
    "zh-CN": "成本",
    "en-US": "Cost",
  },
  "table.header.pricePerMillion": {
    "zh-CN": "价格(元/百万)",
    "en-US": "Price ($ / 1M)",
  },
  "table.header.testCostCny": {
    "zh-CN": "测试成本(元)",
    "en-US": "Test Cost ($)",
  },
  "table.reasoningBadge": {
    "zh-CN": "推理",
    "en-US": "Reasoning",
  },
  "table.mobile.moreFields": {
    "zh-CN": "更多字段",
    "en-US": "More fields",
  },
  "table.mobile.unnamedField": {
    "zh-CN": "未命名字段",
    "en-US": "Unnamed field",
  },
  "table.mobile.unknownModel": {
    "zh-CN": "未命名模型",
    "en-US": "Unnamed model",
  },
  "meta.category": {
    "zh-CN": "<strong>类别：</strong>{{label}}",
    "en-US": "<strong>Category:</strong>{{label}}",
  },
  "meta.dataset": {
    "zh-CN": "<strong>数据集：</strong>{{label}}",
    "en-US": "<strong>Dataset:</strong>{{label}}",
  },
  "meta.records.single": {
    "zh-CN": "<strong>记录数：</strong>{{count}}",
    "en-US": "<strong>Rows:</strong>{{count}}",
  },
  "meta.records.withTotal": {
    "zh-CN": "<strong>记录数：</strong>{{count}} / {{total}}",
    "en-US": "<strong>Rows:</strong>{{count}} / {{total}}",
  },
  "meta.datasetCount": {
    "zh-CN": "<strong>该类别数据集：</strong>{{count}} 个",
    "en-US": "<strong>Datasets in category:</strong>{{count}}",
  },
  "language.switcher.aria": {
    "zh-CN": "切换站点语言",
    "en-US": "Switch site language",
  },
  "language.switcher.toggle": {
    "zh-CN": "切换为 {{target}}",
    "en-US": "Switch to {{target}}",
  },
  "theme.switcher.aria": {
    "zh-CN": "切换站点主题",
    "en-US": "Switch site theme",
  },
  "theme.switcher.toggle": {
    "zh-CN": "主题：{{mode}}",
    "en-US": "Theme: {{mode}}",
  },
  "theme.mode.system": {
    "zh-CN": "跟随系统",
    "en-US": "System",
  },
  "theme.mode.light": {
    "zh-CN": "浅色",
    "en-US": "Light",
  },
  "theme.mode.dark": {
    "zh-CN": "深色",
    "en-US": "Dark",
  },
  "chart.yAxis.label": {
    "zh-CN": "纵轴指标",
    "en-US": "Y-Axis Metric",
  },
  "chart.xAxis.label": {
    "zh-CN": "横轴指标",
    "en-US": "X-Axis Metric",
  },
  "chart.yAxis.aria": {
    "zh-CN": "选择纵轴指标",
    "en-US": "Select Y-axis metric",
  },
  "chart.yAxis.option.cost": {
    "zh-CN": "成本",
    "en-US": "Cost",
  },
  "chart.yAxis.option.time": {
    "zh-CN": "平均耗时",
    "en-US": "Average Time",
  },
  "chart.axis.medianScore": {
    "zh-CN": "中位分数",
    "en-US": "Median Score",
  },
  "chart.axis.avgTime": {
    "zh-CN": "平均耗时(秒)",
    "en-US": "Average Time (seconds)",
  },
  "chart.tooltip.model": {
    "zh-CN": "模型",
    "en-US": "Model",
  },
  "chart.dataset.performance": {
    "zh-CN": "模型性能",
    "en-US": "Model Performance",
  },
  "chart.axis.cost": {
    "zh-CN": "成本(元)",
    "en-US": "Cost (USD)",
  },
  "chart.caption.cost": {
    "zh-CN": "图 1. 性能 × 成本象限分布（性能分界固定为 40 分，成本分界为当月中位数）",
    "en-US":
      "Fig. 1. Performance vs. cost quadrants (performance threshold fixed at 40; cost threshold marks the monthly median; CNY converted to USD at 6.9)",
  },
  "chart.caption.time": {
    "zh-CN": "图 1. 性能 × 耗时象限分布（虚线为当月中位数）",
    "en-US": "Fig. 1. Performance vs. latency quadrants (dashed lines mark medians)",
  },
  "chart.quad.cost.tr": {
    "zh-CN": "高价旗舰",
    "en-US": "Premium",
  },
  "chart.quad.cost.br": {
    "zh-CN": "性价比区",
    "en-US": "Best value",
  },
  "chart.quad.cost.tl": {
    "zh-CN": "性价失衡",
    "en-US": "Poor value",
  },
  "chart.quad.cost.bl": {
    "zh-CN": "经济入门",
    "en-US": "Budget",
  },
  "chart.quad.time.tr": {
    "zh-CN": "高性能 · 高耗时",
    "en-US": "Strong, slow",
  },
  "chart.quad.time.br": {
    "zh-CN": "高性能 · 低耗时",
    "en-US": "Strong, fast",
  },
  "chart.quad.time.tl": {
    "zh-CN": "低性能 · 高耗时",
    "en-US": "Weak, slow",
  },
  "chart.quad.time.bl": {
    "zh-CN": "低性能 · 低耗时",
    "en-US": "Light, fast",
  },
  "view.board": {
    "zh-CN": "致知",
    "en-US": "Leaderboard",
  },
  "view.trends": {
    "zh-CN": "趋势",
    "en-US": "Trends",
  },
  "view.tabs.aria": {
    "zh-CN": "切换视图",
    "en-US": "Switch view",
  },
  "trends.category.label": {
    "zh-CN": "数据类别",
    "en-US": "Category",
  },
  "trends.category.aria": {
    "zh-CN": "选择趋势视图的数据类别",
    "en-US": "Select category for trends",
  },
  "trends.mode.label": {
    "zh-CN": "排名方式",
    "en-US": "Ranking",
  },
  "trends.mode.aria": {
    "zh-CN": "选择排名方式",
    "en-US": "Select ranking mode",
  },
  "trends.mode.percentile": {
    "zh-CN": "当月百分位",
    "en-US": "Monthly percentile",
  },
  "trends.mode.rank": {
    "zh-CN": "当月名次",
    "en-US": "Monthly rank",
  },
  "trends.loading": {
    "zh-CN": "正在汇总历史数据…",
    "en-US": "Aggregating historical data…",
  },
  "trends.unsupported": {
    "zh-CN": "该类别为等级制结果，暂不支持跨月排名趋势。",
    "en-US": "This category reports letter grades; ranking trends are not available.",
  },
  "trends.empty": {
    "zh-CN": "暂无可用的历史数据。",
    "en-US": "No historical data available.",
  },
  "trends.note": {
    "zh-CN":
      "说明：评测题目逐月更换，绝对分数不可跨月直接比较；本图展示各模型在当月参评集合中的相对位置（点击上方标签可增删模型）。",
    "en-US":
      "Note: benchmark questions rotate monthly, so raw scores are not comparable across months. This chart shows each model's relative position within that month's cohort (toggle models via the tags above).",
  },
  "trends.caption.percentile": {
    "zh-CN": "图 2. 当月百分位走势（100 = 当月最佳）",
    "en-US": "Fig. 2. Monthly percentile trend (100 = best of the month)",
  },
  "trends.caption.rank": {
    "zh-CN": "图 2. 当月名次走势（1 = 当月最佳）",
    "en-US": "Fig. 2. Monthly rank trend (1 = best of the month)",
  },
  "trends.picker.aria": {
    "zh-CN": "选择要对比的模型",
    "en-US": "Select models to compare",
  },
  "trends.tooltip.score": {
    "zh-CN": "当月得分",
    "en-US": "Score",
  },
  "codev3Note.title": {
    "zh-CN": "档位说明",
    "en-US": "Grade Guide",
  },
  "codev3Note.gradeA": {
    "zh-CN": "档：几乎不犯错，只犯微小的 UI、交互类错误。",
    "en-US": "Grade: almost never makes mistakes — only minor UI or interaction errors.",
  },
  "codev3Note.gradeB": {
    "zh-CN": "档：大概率会错，但只要描述错误现象，都可以1轮修复。",
    "en-US": "Grade: likely to make mistakes, but any described issue can be fixed in 1 round.",
  },
  "codev3Note.gradeC": {
    "zh-CN": "档：大概率错，但需要交互更多轮，模型能自主推进修复，无需人工提供辅助。",
    "en-US":
      "Grade: likely to make mistakes and needs more interaction rounds, but the model drives fixes autonomously without human assistance.",
  },
  "codev3Note.gradeD": {
    "zh-CN": "档：必须有人工提供大量 log、视觉描述，协助操作等才能修复问题。",
    "en-US":
      "Grade: requires the human to provide extensive logs, visual descriptions, and hands-on assistance to fix issues.",
  },
  "codev3Note.failed": {
    "zh-CN": "知识或方法论不够，即便有人帮助，也无法完成任务。",
    "en-US": "— lacks the knowledge or methodology to complete the task even with help.",
  },
  "codev3Note.pass": {
    "zh-CN": "：前代模型已经拿到 A，不再测试。",
    "en-US": ": a previous model version already earned an A, so it is no longer tested.",
  },
  "codev3Note.skip": {
    "zh-CN": "：各方面原因，不进行测试。",
    "en-US": ": not tested for various reasons.",
  },
  "codev3Note.pending": {
    "zh-CN": "：正在测试中。",
    "en-US": ": testing in progress.",
  },
  "codev3Note.halfGrade": {
    "zh-CN": "同档位中，只有少数轮次出现问题，大部分情况表现良好时，会升半档，用 B+、C+ 来表示。",
    "en-US":
      "Within the same grade, when only a few rounds have issues and the model performs well most of the time, it is upgraded by a half grade, denoted as B+ or C+.",
  },
  "codev3Note.projectsTitle": {
    "zh-CN": "项目说明",
    "en-US": "Project Guide",
  },
  "codev3Note.projectC": {
    "zh-CN": "C: MacOS App + OpenGL",
    "en-US": "C: MacOS App + OpenGL",
  },
  "codev3Note.projectE": {
    "zh-CN": "E: Web + WASM",
    "en-US": "E: Web + WASM",
  },
  "codev3Note.projectF": {
    "zh-CN": "F: Godot + Physics",
    "en-US": "F: Godot + Physics",
  },
  "codev3Note.projectH": {
    "zh-CN": "H: Web + 3D Modeling",
    "en-US": "H: Web + 3D Modeling",
  },
  "codev3Note.projectI": {
    "zh-CN": "I: iOS App + Rust Server",
    "en-US": "I: iOS App + Rust Server",
  },
  "codev3Note.projectJ": {
    "zh-CN": "J: Web + 2D Animation",
    "en-US": "J: Web + 2D Animation",
  },
  "codev3Note.projectK": {
    "zh-CN": "K: Harmony OS App + C++ Native",
    "en-US": "K: Harmony OS App + C++ Native",
  },
  "meta.codev3CellFormat": {
    "zh-CN": "1/A 代表扣分数/档位",
    "en-US": "1/A means deduction points / grade",
  },
};

const listeners = new Set();

let currentLocale = detectInitialLocale();
setDocumentLocale(currentLocale);

function detectInitialLocale() {
  const stored = readStoredLocale();
  if (stored) return stored;

  const browserPreferred = detectBrowserLocale();
  if (browserPreferred) return browserPreferred;

  return FALLBACK_LOCALE;
}

function readStoredLocale() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LOCALES.includes(stored)) {
      return stored;
    }
  } catch (error) {
    console.warn("Unable to read stored locale:", error);
  }
  return null;
}

function detectBrowserLocale() {
  const navigatorLocales = [];
  if (Array.isArray(navigator.languages)) {
    navigatorLocales.push(...navigator.languages);
  }
  if (navigator.language) {
    navigatorLocales.push(navigator.language);
  }
  for (const locale of navigatorLocales) {
    const normalized = normalizeLocale(locale);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function normalizeLocale(locale) {
  if (!locale || typeof locale !== "string") return null;
  const trimmed = locale.trim();
  if (!trimmed) return null;
  if (SUPPORTED_LOCALES.includes(trimmed)) {
    return trimmed;
  }
  const short = trimmed.split("-")[0];
  if (short === "zh") return "zh-CN";
  if (short === "en") return "en-US";
  return null;
}

function setDocumentLocale(locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
}

/**
 * Translate message by key.
 * @param {string} key
 * @param {Record<string, string|number>} [replacements]
 * @param {string} [fallbackValue]
 */
function t(key, replacements = undefined, fallbackValue = key) {
  const messages = TRANSLATIONS[key];
  let template =
    (messages && messages[currentLocale]) ||
    (messages && messages[FALLBACK_LOCALE]) ||
    fallbackValue;
  if (replacements && typeof template === "string") {
    template = Object.entries(replacements).reduce((acc, [name, value]) => {
      const pattern = new RegExp(`{{\\s*${escapeRegExp(name)}\\s*}}`, "g");
      return acc.replace(pattern, String(value));
    }, template);
  }
  return template;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Update locale and notify listeners.
 * @param {string} locale
 */
function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }
  if (locale === currentLocale) {
    return;
  }
  currentLocale = locale;
  setDocumentLocale(locale);
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch (error) {
    console.warn("Unable to persist locale:", error);
  }
  for (const listener of listeners) {
    try {
      listener(currentLocale);
    } catch (error) {
      console.error("Locale listener error:", error);
    }
  }
}

function getCurrentLocale() {
  return currentLocale;
}

function getLocaleLabel(locale) {
  return LOCALE_LABELS[locale] || locale;
}

function onLocaleChange(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export {
  SUPPORTED_LOCALES,
  FALLBACK_LOCALE,
  getCurrentLocale,
  getLocaleLabel,
  onLocaleChange,
  setLocale,
  t,
};
