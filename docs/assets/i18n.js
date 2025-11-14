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
    "zh-CN": "LLM Benchmark Dashboard",
    "en-US": "LLM Benchmark Dashboard",
  },
  "header.subtitle": {
    "zh-CN":
      '基于个人私有题目的大模型长期跟踪测评项目(<a href="https://github.com/llm2014/llm_benchmark/">GitHub</a>)',
    "en-US":
      'Long-term evaluation of large language models on private benchmarks (<a href="https://github.com/llm2014/llm_benchmark/">GitHub</a>)',
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
  "category.code": {
    "zh-CN": "代码",
    "en-US": "Code",
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
  "dataset.title.averageByLanguage": {
    "zh-CN": "各语言平均成绩",
    "en-US": "Average score by language",
  },
  "table.header.reportDate": {
    "zh-CN": "报告日期",
    "en-US": "Report Date",
  },
  "table.header.model": {
    "zh-CN": "模型",
    "en-US": "Model",
  },
  "table.header.rawScore": {
    "zh-CN": "原始分数",
    "en-US": "Raw Score",
  },
  "table.header.rawMedian": {
    "zh-CN": "原始中位",
    "en-US": "Raw Median",
  },
  "table.header.runtimeErrors": {
    "zh-CN": "运行异常",
    "en-US": "Runtime Errors",
  },
  "table.header.syntaxErrors": {
    "zh-CN": "语法错误",
    "en-US": "Syntax Errors",
  },
  "table.header.zeroRate": {
    "zh-CN": "0分率",
    "en-US": "Zero-score Rate",
  },
  "table.header.totalErrors": {
    "zh-CN": "总异常",
    "en-US": "Total Errors",
  },
  "table.header.maxScore": {
    "zh-CN": "极限分数",
    "en-US": "Max Score",
  },
  "table.header.medianScore": {
    "zh-CN": "中位分数",
    "en-US": "Median Score",
  },
  "table.header.medianGap": {
    "zh-CN": "中位差距",
    "en-US": "Median Gap",
  },
  "table.header.avgTimeSeconds": {
    "zh-CN": "平均耗时(秒)",
    "en-US": "Avg Time (s)",
  },
  "table.header.avgLines": {
    "zh-CN": "平均代码行",
    "en-US": "Avg Lines of Code",
  },
  "table.header.costCny": {
    "zh-CN": "成本(元)",
    "en-US": "Cost (CNY)",
  },
  "table.header.notes": {
    "zh-CN": "备注",
    "en-US": "Notes",
  },
  "table.header.usageCostCny": {
    "zh-CN": "使用成本(元)",
    "en-US": "Usage Cost (CNY)",
  },
  "table.header.errorsAfterFix": {
    "zh-CN": "修复后异常",
    "en-US": "Errors After Fix",
  },
  "table.header.adjustedMaxScore": {
    "zh-CN": "修正极限",
    "en-US": "Max Score After Fix",
  },
  "table.header.scoreDelta": {
    "zh-CN": "分差",
    "en-US": "Score Gap",
  },
  "table.header.releaseDate": {
    "zh-CN": "发布时间",
    "en-US": "Release Date",
  },
  "table.header.change": {
    "zh-CN": "变更",
    "en-US": "Changed",
  },
  "table.header.multiTurnScore": {
    "zh-CN": "多轮总分",
    "en-US": "Multi-turn Score",
  },
  "table.header.avgTokens": {
    "zh-CN": "平均Token",
    "en-US": "Avg Tokens",
  },
  "table.header.avgTimePerSecond": {
    "zh-CN": "平均耗时/s",
    "en-US": "Avg Time (sec.)",
  },
  "table.header.avgLength": {
    "zh-CN": "平均长度",
    "en-US": "Avg Length",
  },
  "table.header.avgLengthChars": {
    "zh-CN": "平均长度(字)",
    "en-US": "Avg Length (chars)",
  },
  "table.header.errorRate": {
    "zh-CN": "异常率",
    "en-US": "Error Rate",
  },
  "table.header.totalRounds": {
    "zh-CN": "总轮数",
    "en-US": "Total Rounds",
  },
  "table.header.cost": {
    "zh-CN": "成本",
    "en-US": "Cost",
  },
  "table.header.pricePerMillion": {
    "zh-CN": "价格(元/百万)",
    "en-US": "Price (CNY / 1M tokens)",
  },
  "table.header.finalUnavailable": {
    "zh-CN": "最终不可用",
    "en-US": "Final Unavailable",
  },
  "table.header.testCostCny": {
    "zh-CN": "测试成本(元)",
    "en-US": "Test Cost (CNY)",
  },
  "table.header.testTime": {
    "zh-CN": "测试时间",
    "en-US": "Test Time",
  },
  "table.header.percentScale": {
    "zh-CN": "百分制",
    "en-US": "Percent",
  },
  "table.header.changeSinceLast": {
    "zh-CN": "较上次变更",
    "en-US": "Changed",
  },
  "table.header.firstRoundScore": {
    "zh-CN": "首轮总分",
    "en-US": "First-round Score",
  },
  "table.header.usageCost": {
    "zh-CN": "使用成本",
    "en-US": "Usage Cost",
  },
  "table.reasoningBadge": {
    "zh-CN": "推理",
    "en-US": "Reasoning",
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
  "chart.yAxis.label": {
    "zh-CN": "纵轴指标",
    "en-US": "Y-Axis Metric",
  },
  "chart.yAxis.aria": {
    "zh-CN": "选择纵轴指标",
    "en-US": "Select Y-axis metric",
  },
  "chart.yAxis.option.cost": {
    "zh-CN": "测试成本",
    "en-US": "Test Cost",
  },
  "chart.yAxis.option.time": {
    "zh-CN": "平均耗时",
    "en-US": "Average Time",
  },
  "chart.axis.multiTurnScore": {
    "zh-CN": "多轮总分",
    "en-US": "Multi-turn Score",
  },
  "chart.axis.maxScore": {
    "zh-CN": "极限分数",
    "en-US": "Max Score",
  },
  "chart.axis.testCost": {
    "zh-CN": "测试成本(元)",
    "en-US": "Test Cost (CNY)",
  },
  "chart.axis.avgTime": {
    "zh-CN": "平均耗时(秒)",
    "en-US": "Average Time (seconds)",
  },
  "chart.tooltip.model": {
    "zh-CN": "模型",
    "en-US": "Model",
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
