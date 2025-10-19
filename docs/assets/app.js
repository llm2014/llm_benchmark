const CATEGORY_LABELS = {
  code: "代码",
  logic: "推理",
  vision: "视觉",
};

const CATEGORY_ORDER = ["code", "logic", "vision"];

const state = {
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
};

init().catch((error) => {
  console.error(error);
  showPlaceholder("加载数据失败，请稍后重试。");
});

async function init() {
  showPlaceholder("正在加载数据资源…");
  const manifest = await fetchManifest();
  if (!manifest.length) {
    showPlaceholder("未找到任何数据集");
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
    throw new Error(`无法加载清单：${response.status}`);
  }
  const payload = await response.json();
  return Array.isArray(payload.datasets) ? payload.datasets : [];
}

function buildCategoryOptions() {
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
      return a.localeCompare(b, "zh-CN");
    }
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  elements.categorySelect.innerHTML = categories
    .map(
      (category) =>
        `<option value="${category}">${CATEGORY_LABELS[category] ?? category}</option>`
    )
    .join("");
  state.currentCategory = elements.categorySelect.value || null;
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
  showPlaceholder("正在加载数据集列表…");

  const datasets = getDatasetsForCategory(category);
  if (!datasets.length) {
    elements.datasetSelect.innerHTML = "";
    showPlaceholder("该类别暂无可用数据。");
    return;
  }

  elements.datasetSelect.innerHTML = datasets
    .map((dataset) => {
      const label = buildDatasetLabel(dataset);
      const key = buildDatasetKey(dataset);
      return `<option value="${key}">${label}</option>`;
    })
    .join("");

  elements.datasetSelect.disabled = false;
  const firstKey = elements.datasetSelect.value;
  if (firstKey) {
    await loadDatasetByKey(firstKey);
  }
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
    parts.push(dataset.title);
  }
  return parts.join(" · ");
}

async function loadDatasetByKey(key) {
  state.currentDatasetKey = key;
  state.searchQuery = "";
  state.sort = { columnIndex: null, direction: null };
  elements.searchInput.value = "";

  const dataset = state.manifest.find((entry) => buildDatasetKey(entry) === key);
  if (!dataset) {
    showPlaceholder("无法找到所选数据集。");
    return;
  }

  showPlaceholder("正在加载表格…");

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
      throw new Error(`无法加载 CSV：${path}`);
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
  const query = state.searchQuery.toLowerCase();

  if (state.hasThinkColumn) {
    if (state.inferenceFilter === "think") {
      rows = rows.filter((row) => row.isThink);
    } else if (state.inferenceFilter === "non-think") {
      rows = rows.filter((row) => !row.isThink);
    }
  }

  if (query) {
    rows = rows.filter((row) =>
      row.cells.some((cell) => String(cell ?? "").toLowerCase().includes(query))
    );
  }

  if (state.sort.columnIndex !== null && state.sort.direction) {
    rows = sortRows(rows, state.sort.columnIndex, state.sort.direction);
  }

  state.filteredRows = rows;
  renderTable();
  updateMeta();
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

      if (numA === null && numB === null) return valueA.localeCompare(valueB, "zh-CN");
      if (numA === null) return 1;
      if (numB === null) return -1;
      if (numA === numB) return 0;
      return numA > numB ? multiplier : -multiplier;
    }

    return valueA.localeCompare(valueB, "zh-CN") * multiplier;
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
    showPlaceholder("请选择数据集开始浏览。");
    return;
  }

  if (!state.filteredRows.length) {
    showPlaceholder("当前筛选条件下没有匹配的记录。");
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  state.headers.forEach((header, index) => {
    const th = document.createElement("th");
    th.textContent = header;
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
        badge.textContent = "推理";
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
  const categoryLabel = CATEGORY_LABELS[dataset.category] ?? dataset.category;
  const datasetsForCategory = getDatasetsForCategory(dataset.category);
  const reportCount = datasetsForCategory.length;

  meta.innerHTML = `
    <span><strong>类别：</strong>${categoryLabel}</span>
    <span><strong>数据集：</strong>${dataset.reportDate} · ${dataset.title || "主要数据"}</span>
    <span><strong>记录数：</strong>${filtered}${filtered !== total ? ` / ${total}` : ""}</span>
    <span><strong>该类别数据集：</strong>${reportCount} 个</span>
  `;
  meta.classList.add("active");
}

function showPlaceholder(message) {
  const container = elements.tableContainer;
  container.innerHTML = `<div class="placeholder" role="status">${message}</div>`;
}
