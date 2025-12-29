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

const CATEGORY_ORDER = ["code", "code_v3", "logic", "vision"];

const state = {
  locale: getCurrentLocale(),
  collator: createCollator(getCurrentLocale()),
  manifest: [],
  currentCategory: null,
  currentDatasetKey: null,
  headers: [],
  rows: [],
  filteredRows: [],
  searchQuery: "",
  inferenceFilter: "all",
  hasThinkColumn: false,
  sort: { columnIndex: null, direction: null },
};

const csvCache = new Map();

const elements = {
  categorySelect: document.getElementById("categorySelect"),
  datasetSelect: document.getElementById("datasetSelect"),
  inferenceFilter: document.getElementById("inferenceFilter"),
  searchInput: document.getElementById("searchInput"),
  tableContainer: document.getElementById("tableContainer"),
  datasetMeta: document.getElementById("datasetMeta"),
  categoryLabel: document.getElementById("categoryLabel"),
  datasetLabel: document.getElementById("datasetLabel"),
  inferenceLabel: document.getElementById("inferenceLabel"),
  searchLabel: document.getElementById("searchLabel"),
  pageTitle: document.getElementById("pageTitle"),
  pageSubtitle: document.getElementById("pageSubtitle"),
  languageToggle: document.getElementById("languageToggle"),
  footerNote: document.getElementById("footerNote"),
  chartSection: document.getElementById("chartSection"),
  chartCanvas: document.getElementById("benchmarkChart"),
  yAxisSelect: document.getElementById("yAxisSelect"),
  yAxisLabel: document.getElementById("yAxisLabel"),
};

let chartInstance = null;

initializeLocaleUi();

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
    buildCategoryOptions(true);
    if (state.currentCategory) {
      refreshDatasetOptions();
    }
    applyFiltersAndRender();
    updateLanguageToggle();
    updateMeta();
  });
}

function updateStaticCopy() {
  document.title = t("app.title");
  if (elements.pageTitle) {
    elements.pageTitle.textContent = t("app.title");
  }
  if (elements.pageSubtitle) {
    elements.pageSubtitle.innerHTML = t("header.subtitle");
  }

  if (elements.categoryLabel) {
    elements.categoryLabel.textContent = t("controls.category.label");
  }
  if (elements.datasetLabel) {
    elements.datasetLabel.textContent = t("controls.dataset.label");
  }
  if (elements.inferenceLabel) {
    elements.inferenceLabel.textContent = t("controls.inference.label");
  }
  if (elements.searchLabel) {
    elements.searchLabel.textContent = t("controls.search.label");
  }
  if (elements.categorySelect) {
    elements.categorySelect.setAttribute("aria-label", t("controls.category.aria"));
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
  if (elements.searchInput) {
    elements.searchInput.setAttribute("aria-label", t("controls.search.aria"));
    elements.searchInput.placeholder = t("controls.search.placeholder");
  }
  if (elements.yAxisLabel) {
    elements.yAxisLabel.textContent = t("chart.yAxis.label");
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

async function init() {
  showPlaceholder(t("placeholders.loadingData"));
  const manifest = await fetchManifest();
  if (!manifest.length) {
    showPlaceholder(t("placeholders.noDatasets"));
    return;
  }

  state.manifest = manifest;
  buildCategoryOptions();
  bindEventHandlers();

  const firstCategory = elements.categorySelect.value;
  if (firstCategory) {
    await handleCategoryChange(firstCategory);
  }
}

async function fetchManifest() {
  const response = await fetch("data/datasets.json", { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(t("errors.manifestLoad", { status: response.status }, `Unable to load manifest: ${response.status}`));
  }
  const payload = await response.json();
  return Array.isArray(payload.datasets) ? payload.datasets : [];
}

function buildCategoryOptions(preserveSelection = false) {
  if (!elements.categorySelect) return;
  const seen = new Set();
  const categories = state.manifest
    .map((entry) => entry.category)
    .filter((category) => {
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

  const selected = preserveSelection ? state.currentCategory : undefined;
  setSelectOptions(
    elements.categorySelect,
    categories.map((category) => ({
      value: category,
      label: getCategoryLabel(category),
    })),
    selected
  );
  state.currentCategory = elements.categorySelect.value || null;
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
  elements.categorySelect.addEventListener("change", async (event) => {
    const category = event.target.value;
    await handleCategoryChange(category);
  });

  elements.datasetSelect.addEventListener("change", async (event) => {
    const key = event.target.value;
    if (!key) return;
    await loadDatasetByKey(key);
  });

  elements.inferenceFilter.addEventListener("change", (event) => {
    state.inferenceFilter = event.target.value;
    applyFiltersAndRender();
  });

  elements.searchInput.addEventListener("input", (event) => {
    state.searchQuery = (event.target.value || "").trim();
    applyFiltersAndRender();
  });

  if (elements.yAxisSelect) {
    elements.yAxisSelect.addEventListener("change", () => {
      renderChart();
    });
  }
}

async function handleCategoryChange(category) {
  state.currentCategory = category;
  state.currentDatasetKey = null;
  elements.datasetSelect.disabled = true;
  elements.searchInput.disabled = true;
  elements.searchInput.value = "";
  state.searchQuery = "";
  state.inferenceFilter = "all";
  state.hasThinkColumn = false;
  elements.inferenceFilter.value = "all";
  elements.inferenceFilter.disabled = true;
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
  const firstKey = elements.datasetSelect.value;
  if (firstKey) {
    await loadDatasetByKey(firstKey);
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
    state.inferenceFilter = "all";
    elements.inferenceFilter.value = "all";
    elements.inferenceFilter.disabled = true;
  }

  const displayHeaders =
    thinkIndex === -1 ? headers.slice() : headers.filter((_, index) => index !== thinkIndex);

  state.headers = displayHeaders;
  state.rows = rows.map((row) => {
    const cells =
      thinkIndex === -1 ? row.slice() : row.filter((_, index) => index !== thinkIndex);
    const thinkValue = thinkIndex === -1 ? null : row[thinkIndex];
    return {
      cells,
      isThink: thinkIndex !== -1 && isThinkRow(thinkValue),
    };
  });

  applyFiltersAndRender();

  elements.searchInput.disabled = false;
  updateMeta(dataset);
}

function buildDatasetKey(dataset) {
  return `${dataset.category}|${dataset.reportDate}|${dataset.tableIndex}`;
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

function renderTable() {
  const container = elements.tableContainer;
  container.innerHTML = "";

  if (!state.headers.length) {
    showPlaceholder(t("placeholders.selectDataset"));
    return;
  }

  if (!state.filteredRows.length) {
    showPlaceholder(t("placeholders.noMatches"));
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  state.headers.forEach((header, index) => {
    const th = document.createElement("th");
    th.textContent = getHeaderLabel(header);
    th.addEventListener("click", () => toggleSort(index));

    const isActive = state.sort.columnIndex === index;
    if (isActive && state.sort.direction) {
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
    row.cells.forEach((cell, columnIndex) => {
      const td = document.createElement("td");
      const displayValue = cell || "—";
      td.appendChild(document.createTextNode(displayValue));

      if (columnIndex === 0 && row.isThink) {
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

  table.appendChild(tbody);
  container.appendChild(table);
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

  meta.innerHTML = `
    <span>${t("meta.category", { label: categoryLabel })}</span>
    <span>${t("meta.dataset", { label: datasetLabel })}</span>
    <span>${recordsLabel}</span>
    <span>${t("meta.datasetCount", { count: reportCount })}</span>
  `;
  meta.classList.add("active");
}

function showPlaceholder(message) {
  const container = elements.tableContainer;
  container.innerHTML = `<div class="placeholder" role="status">${message}</div>`;
}

function updateChartVisibility() {
  if (!elements.chartSection) return;

  const isCodeOrReasoning = state.currentCategory === "code" || state.currentCategory === "logic";

  if (isCodeOrReasoning && state.filteredRows.length > 0) {
    elements.chartSection.style.display = "block";
  } else {
    elements.chartSection.style.display = "none";
  }
}

function renderChart() {
  if (!elements.chartCanvas || !elements.chartSection) return;

  const isCodeOrReasoning = state.currentCategory === "code" || state.currentCategory === "logic";
  if (!isCodeOrReasoning || state.filteredRows.length === 0) {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  // Use the raw header names from CSV (not translated)
  const xAxisColumnName = state.currentCategory === "code" ? "多轮总分" : "极限分数";
  const yAxisType = elements.yAxisSelect ? elements.yAxisSelect.value : "cost";
  const yAxisColumnName = yAxisType === "cost" ? "测试成本(元)" : "平均耗时(秒)";

  // Get translated labels for chart axes
  const xAxisLabel = state.currentCategory === "code"
    ? t("chart.axis.multiTurnScore")
    : t("chart.axis.maxScore");
  const yAxisLabel = yAxisType === "cost"
    ? t("chart.axis.testCost")
    : t("chart.axis.avgTime");

  // Find column indices by searching for the key that translates to the desired header
  let xAxisIndex = -1;
  let yAxisIndex = -1;
  let modelIndex = -1;

  for (let i = 0; i < state.headers.length; i++) {
    const header = state.headers[i];
    if (header === xAxisColumnName) xAxisIndex = i;
    if (header === yAxisColumnName) yAxisIndex = i;
    if (header === "模型") modelIndex = i;
  }

  if (xAxisIndex === -1 || yAxisIndex === -1 || modelIndex === -1) {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  const chartData = state.filteredRows
    .map((row) => {
      const xValue = parseSortableNumber(row.cells[xAxisIndex]);
      const yValue = parseSortableNumber(row.cells[yAxisIndex]);
      const modelName = row.cells[modelIndex] || "Unknown";

      if (xValue === null || yValue === null) return null;

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
    return;
  }

  const ctx = elements.chartCanvas.getContext("2d");

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "模型性能",
          data: chartData,
          backgroundColor: (context) => {
            const point = context.raw;
            return point && point.isThink ? "rgba(239, 68, 68, 0.6)" : "rgba(99, 102, 241, 0.6)";
          },
          borderColor: (context) => {
            const point = context.raw;
            return point && point.isThink ? "rgba(220, 38, 38, 1)" : "rgba(99, 102, 241, 1)";
          },
          borderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 8,
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
          callbacks: {
            label: (context) => {
              const point = context.raw;
              return [
                `${t("chart.tooltip.model")}: ${point.label}`,
                `${xAxisLabel}: ${point.x}`,
                `${yAxisLabel}: ${point.y}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: xAxisLabel,
            font: {
              size: 14,
              weight: "600",
            },
          },
          ticks: {
            font: {
              size: 12,
            },
          },
        },
        y: {
          title: {
            display: true,
            text: yAxisLabel,
            font: {
              size: 14,
              weight: "600",
            },
          },
          ticks: {
            font: {
              size: 12,
            },
          },
        },
      },
    },
  });
}
