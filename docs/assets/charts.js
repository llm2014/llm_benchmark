import { t } from "./i18n.js?v=20261119-radar-3";
import {
  CATEGORY_CHART_CONFIG,
  CNY_PER_USD,
  TRENDS_SUPPORTED,
  buildModelTierGroups,
  median,
  parseSortableNumber,
} from "./benchmark-domain.js?v=20261119-radar-3";

const MODEL_LOGO_POINT_SIZE = 17;
// Each metric owns its own canvas/figure; renderChart walks them in this order.
const CHART_METRICS = ["cost", "time", "token"];
const FIGURE_ORDER = ["cost", "time", "token", "radar"];

// Radar axes. Scores are better when high, the other three when low.
// Header variants cover logic and vision datasets of different months.
const RADAR_DIMENSIONS = [
  {
    key: "peak",
    labelKey: "chart.radar.dim.peak",
    headers: ["极限分数"],
    higherIsBetter: true,
  },
  {
    key: "median",
    labelKey: "chart.radar.dim.median",
    headers: ["中位分数"],
    higherIsBetter: true,
  },
  {
    key: "time",
    labelKey: "chart.radar.dim.time",
    headers: ["平均耗时(秒)", "平均耗时/s"],
    higherIsBetter: false,
  },
  {
    key: "token",
    labelKey: "chart.radar.dim.token",
    headers: ["Token", "平均Token"],
    higherIsBetter: false,
  },
  {
    key: "cost",
    labelKey: "chart.radar.dim.cost",
    headers: ["测试成本(元)", "成本"],
    higherIsBetter: false,
  },
];
// Origin of every axis = 80% of that dimension's worst value in the current
// dataset, so profiles stay visible instead of collapsing near the rim.
const RADAR_WORST_ORIGIN_RATIO = 0.8;
const RADAR_DEFAULT_MODELS = 3;
const RADAR_MAX_MODELS = 6;
const SERIES_PALETTE_LIGHT = [
  "#1f4e79", "#9e3b32", "#3a6b4f", "#8a6d1f",
  "#6b4f8a", "#2f6b6b", "#a2543a", "#5a5f6b",
];
const SERIES_PALETTE_DARK = [
  "#93b8dc", "#d9907f", "#8fbf9f", "#c9a94f",
  "#b39ddb", "#7fb3b3", "#cf8a6f", "#9aa0ab",
];

function formatUsd(usd) {
  const decimals = Math.abs(usd) >= 1 ? 2 : 3;
  return `$${usd.toFixed(decimals)}`;
}

function formatTokenTick(value) {
  const thousands = Number(value) / 1000;
  return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}K`;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function withAlpha(hex, alpha) {
  const match = /^#([\da-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const number = parseInt(match[1], 16);
  return `rgba(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
}

function escapeHtml(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value).replace(/[&<>"']/g, (char) => entities[char]);
}

function resolveRadarColumns(headers) {
  return RADAR_DIMENSIONS.map((dimension) => ({
    ...dimension,
    columnIndex: dimension.headers.reduce(
      (found, header) => (found !== -1 ? found : headers.indexOf(header)),
      -1
    ),
  }));
}

// Chart.js plugin: quadrant backgrounds, median lines, and region labels.
const quadrantPlugin = {
  id: "quadrants",
  beforeDatasetsDraw(chart, args, opts) {
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
    if (opts.secondBg) {
      ctx.fillStyle = opts.secondBg;
      ctx.fillRect(left, top, midX - left, midY - top);
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

// While a point is hovered, keep its tier group at full strength and dim the
// other icons/labels. The focus set is shared with the drawing plugins that
// run later in the same frame.
const hoverFocusPlugin = {
  id: "hoverFocus",
  beforeDatasetsDraw(chart, args, opts) {
    if (!opts || opts.display === false) {
      chart.$hoverFocus = null;
      return;
    }
    const active = chart.getActiveElements ? chart.getActiveElements() : [];
    if (!active.length) {
      chart.$hoverFocus = null;
      return;
    }
    const hoveredIndex = active[0].index;
    const group = chart.$modelTierGroups?.[hoveredIndex];
    chart.$hoverFocus = {
      indices: group
        ? new Set(group.members.map((member) => member.index))
        : new Set([hoveredIndex]),
      dimAlpha: opts.dimAlpha ?? 0.5,
    };
  },
};

// Draw high-resolution logo assets directly on Chart.js' high-DPI canvas.
const modelLogoPointsPlugin = {
  id: "modelLogoPoints",
  afterDatasetsDraw(chart, args, opts) {
    if (!opts || opts.display === false) return;
    const meta = chart.getDatasetMeta(0);
    const dataset = chart.data.datasets[0];
    if (!meta || !dataset) return;

    const { ctx } = chart;
    const size = opts.size || MODEL_LOGO_POINT_SIZE;
    const padding = 1;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    dataset.data.forEach((point, index) => {
      const element = meta.data[index];
      const image = point?.logoImage;
      if (!element || !image) return;

      const focus = chart.$hoverFocus;
      ctx.globalAlpha = focus && !focus.indices.has(index) ? focus.dimAlpha : 1;
      const radius = size / 2;
      ctx.beginPath();
      ctx.arc(element.x, element.y, radius - 0.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(element.x, element.y, radius - padding, 0, Math.PI * 2);
      ctx.clip();

      const maxSize = size - padding * 2;
      const scale = Math.min(maxSize / image.naturalWidth, maxSize / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      ctx.drawImage(image, element.x - width / 2, element.y - height / 2, width, height);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(element.x, element.y, radius - 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(111, 108, 101, 0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    ctx.restore();
  },
};

// When one effort tier of a multi-tier model is hovered, link all tiers of
// that model. Registered before modelLogoPointsPlugin so the logos and labels
// stay on top of the connector line. Group indices live on the chart instance
// ($modelTierGroups) to bypass Chart.js' scriptable-option resolver.
const modelTierLinksPlugin = {
  id: "modelTierLinks",
  afterDatasetsDraw(chart, args, opts) {
    if (!opts || opts.display === false) return;
    const groups = chart.$modelTierGroups;
    if (!groups) return;

    const active = chart.getActiveElements ? chart.getActiveElements() : [];
    const activeElements = active.length ? active : chart.tooltip?.getActiveElements?.() || [];
    if (!activeElements.length) return;
    const hovered = activeElements[0];
    const group = groups[hovered.index];
    if (!group || !group.members || group.members.length < 2) return;

    const meta = chart.getDatasetMeta(hovered.datasetIndex ?? 0);
    const { ctx, chartArea } = chart;
    if (!meta || !chartArea) return;

    const inside = (element) =>
      element.x >= chartArea.left - 2 &&
      element.x <= chartArea.right + 2 &&
      element.y >= chartArea.top - 2 &&
      element.y <= chartArea.bottom + 2;
    const points = group.members
      .map((member) => {
        const element = meta.data[member.index];
        if (!element || element.skip || !Number.isFinite(element.x) || !Number.isFinite(element.y)) {
          return null;
        }
        return inside(element) ? { x: element.x, y: element.y } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.x - b.x || a.y - b.y);
    if (points.length < 2) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(
      chartArea.left,
      chartArea.top,
      chartArea.right - chartArea.left,
      chartArea.bottom - chartArea.top
    );
    ctx.clip();

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash([]);
    ctx.strokeStyle = opts.lineOutline;
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = opts.lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  },
};

// Label scatter points while avoiding overlaps with labels already placed.
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
    const defaultOffset = 7;
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
      const focus = chart.$hoverFocus;
      ctx.globalAlpha = focus && !focus.indices.has(index) ? focus.dimAlpha : 1;
      const boxW = ctx.measureText(point.label).width + padX * 2;
      const offset = point.logoImage ? MODEL_LOGO_POINT_SIZE / 2 + 4 : defaultOffset;
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

// Label the last visible point on each trend line.
const trendEndLabelsPlugin = {
  id: "trendEndLabels",
  afterDatasetsDraw(chart, args, opts) {
    if (!opts || !opts.display) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    const fontSize = opts.fontSize || 11;
    const padX = 4;
    const boxH = fontSize + 6;
    const offset = 8;
    const placed = [...(chart.$trendVersionLabelBoxes || [])];
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const intersects = (a, b) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const inside = (box) =>
      box.x >= chartArea.left &&
      box.x + box.w <= chartArea.right &&
      box.y >= chartArea.top &&
      box.y + box.h <= chartArea.bottom;

    ctx.save();
    ctx.font = "600 " + fontSize + "px " + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      let lastIndex = dataset.data.length - 1;
      while (lastIndex >= 0 && dataset.data[lastIndex] === null) lastIndex -= 1;
      if (lastIndex < 0) return;

      const element = chart.getDatasetMeta(datasetIndex).data[lastIndex];
      if (!element || !dataset.label) return;

      const boxW = ctx.measureText(dataset.label).width + padX * 2;
      const centeredX = clamp(element.x - boxW / 2, chartArea.left, chartArea.right - boxW);
      const candidates = [
        { x: centeredX, y: element.y - boxH - offset },
        {
          x: clamp(element.x - boxW - offset, chartArea.left, chartArea.right - boxW),
          y: element.y - boxH - offset,
        },
        {
          x: clamp(element.x + offset, chartArea.left, chartArea.right - boxW),
          y: element.y - boxH - offset,
        },
        { x: centeredX, y: element.y + offset },
      ];

      const position =
        candidates.find((candidate) => {
          const box = { ...candidate, w: boxW, h: boxH };
          return inside(box) && !placed.some((other) => intersects(box, other));
        }) || candidates.find((candidate) => inside({ ...candidate, w: boxW, h: boxH }));
      if (!position) return;

      const box = { ...position, w: boxW, h: boxH };
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = opts.backgroundColor || "#fff";
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = dataset.borderColor;
      ctx.fillText(dataset.label, box.x + padX, box.y + boxH / 2);
      placed.push(box);
    });

    ctx.restore();
  },
};

// Mark the first plotted month for each configured model version in a series.
const trendVersionLabelsPlugin = {
  id: "trendVersionLabels",
  afterDatasetsDraw(chart, args, opts) {
    chart.$trendVersionLabelBoxes = [];
    if (!opts || !opts.display) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    const fontSize = opts.fontSize || 10;
    const padX = 4;
    const boxH = fontSize + 6;
    const offset = 8;
    const placed = [];
    const intersects = (a, b) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const inside = (box) =>
      box.x >= chartArea.left &&
      box.x + box.w <= chartArea.right &&
      box.y >= chartArea.top &&
      box.y + box.h <= chartArea.bottom;

    ctx.save();
    ctx.font = `500 ${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      if (!dataset.members || dataset.members.length < 2) return;
      const meta = chart.getDatasetMeta(datasetIndex);
      const records = dataset.records || [];
      records.forEach((record, pointIndex) => {
        if (!record?.isVersionStart) return;
        const element = meta.data[pointIndex];
        if (!element || element.skip) return;

        const label = record.modelName;
        const boxW = ctx.measureText(label).width + padX * 2;
        const candidates = [
          { x: element.x + offset, y: element.y - boxH - offset },
          { x: element.x + offset, y: element.y + offset },
          { x: element.x - boxW - offset, y: element.y - boxH - offset },
          { x: element.x - boxW - offset, y: element.y + offset },
        ];
        const position = candidates.find((candidate) => {
          const box = { ...candidate, w: boxW, h: boxH };
          return inside(box) && !placed.some((other) => intersects(box, other));
        });
        if (!position) return;

        const box = { ...position, w: boxW, h: boxH };
        ctx.globalAlpha = 0.94;
        ctx.fillStyle = opts.backgroundColor || "#fff";
        ctx.fillRect(box.x, box.y, box.w, box.h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = dataset.borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(box.x, box.y, box.w, box.h);
        ctx.fillStyle = opts.textColor || dataset.borderColor;
        ctx.fillText(label, box.x + padX, box.y + boxH / 2);
        placed.push(box);
      });
    });

    chart.$trendVersionLabelBoxes = placed;
    ctx.restore();
  },
};

/**
 * Owns both Chart.js instances and all chart-specific DOM rendering.
 * The mutable application state is injected to avoid a circular import.
 */
export function createCharts({
  state,
  elements,
  prefersDarkQuery,
  findModelColumnIndex,
  getModelLogoImage,
}) {
  const chartInstances = new Map();
  let trendsChartInstance = null;
  const radarState = {
    selected: new Set(),
    // Stable palette slots: adding/removing a model never recolors the others.
    colorSlots: new Map(),
    datasetKey: "",
    listSignature: "",
    chartSignature: "",
    model: null,
  };

  // onHover only fires inside the chart area; clear that figure's readout when
  // the pointer leaves its canvas entirely.
  FIGURE_ORDER.forEach((metric) => {
    const figure = elements.chartFigures?.[metric];
    if (!figure?.canvas || !figure?.readout) return;
    figure.canvas.addEventListener("mouseleave", () => {
      figure.readout.textContent = "";
    });
  });

  // Selection changes are applied incrementally: no list rebuild, no chart
  // teardown. A newly checked model fades/grows in; removing one is instant.
  const radarPickerList = elements.chartFigures?.radar?.pickerList;
  if (radarPickerList) {
    radarPickerList.addEventListener("change", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") return;
      const adding = input.checked;
      if (adding) {
        if (radarState.selected.size >= RADAR_MAX_MODELS) {
          input.checked = false;
          return;
        }
        radarState.selected.add(input.value);
      } else {
        radarState.selected.delete(input.value);
        radarState.colorSlots.delete(input.value);
      }
      applyRadarSelection({ animate: adding });
    });
  }

  function destroyChart(metric) {
    const instance = chartInstances.get(metric);
    if (instance) instance.destroy();
    chartInstances.delete(metric);
  }

  function clearFigure(figure) {
    if (!figure) return;
    ["readout", "axes", "sample", "tag", "title"].forEach((key) => {
      if (figure[key]) figure[key].textContent = "";
    });
  }

  function hideFigure(metric, figure) {
    destroyChart(metric);
    clearFigure(figure);
    if (figure?.figure) figure.figure.style.display = "none";
  }

  function getCssVariable(name, fallback = "") {
    if (typeof window === "undefined") return fallback;
    const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function isDarkThemeActive() {
    if (state.themeMode === "dark") return true;
    if (state.themeMode === "light") return false;
    return prefersDarkQuery ? prefersDarkQuery.matches : false;
  }

  function renderTrendsStatus() {
    if (!elements.trendsNote) return;
    const category = state.trends.category;
    if (state.trends.loading) {
      elements.trendsNote.textContent = t("trends.loading");
    } else if (!category || !TRENDS_SUPPORTED.has(category)) {
      elements.trendsNote.textContent = t("trends.unsupported");
    } else if (!state.trends.months.length || !state.trends.series.length) {
      elements.trendsNote.textContent = t("trends.empty");
    } else {
      elements.trendsNote.textContent = t("trends.note");
    }
  }

  function updateTrendsCaption() {
    if (!elements.trendsCaption) return;
    elements.trendsCaption.textContent = state.trends.months.length
      ? t(`trends.caption.${state.trends.mode}`)
      : "";
  }

  function getFirstVisibleTrendMonth(months, selectedSeries) {
    const firstVisibleIndex = months.findIndex((month, monthIndex) =>
      selectedSeries.some((series) => series.records[monthIndex])
    );
    return firstVisibleIndex === -1 ? 0 : firstVisibleIndex;
  }

  function renderTrendsChart() {
    if (!elements.trendsCanvas || state.view !== "trends") return;
    if (state.trends.loading || !state.trends.months.length) return;

    const months = state.trends.months;
    const seriesByName = new Map(state.trends.series.map((series) => [series.name, series]));
    const selectedSeries = [...state.trends.selected]
      .map((name) => seriesByName.get(name))
      .filter(Boolean);
    if (!selectedSeries.length) {
      if (trendsChartInstance) {
        trendsChartInstance.destroy();
        trendsChartInstance = null;
      }
      return;
    }

    const firstVisibleIndex = getFirstVisibleTrendMonth(months, selectedSeries);
    const visibleMonths = months.slice(firstVisibleIndex);
    const mode = state.trends.mode;
    const palette = isDarkThemeActive() ? SERIES_PALETTE_DARK : SERIES_PALETTE_LIGHT;
    const colorIndex = new Map(state.trends.series.map((series, index) => [series.name, index]));
    const labels = visibleMonths.map((month) => month.label);

    const datasets = selectedSeries.map((series) => {
      const color = palette[(colorIndex.get(series.name) ?? 0) % palette.length];
      const records = series.records.slice(firstVisibleIndex);
      return {
        label: series.name,
        members: series.members,
        records,
        data: records.map((record) => {
          if (!record) return null;
          return mode === "rank" ? record.rank : Math.round(record.percentile * 10) / 10;
        }),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointRadius: records.map((record) => (record?.isVersionStart ? 4.5 : 2.5)),
        pointHoverRadius: records.map((record) => (record?.isVersionStart ? 6 : 5)),
        pointBorderWidth: records.map((record) => (record?.isVersionStart ? 2 : 1)),
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
        layout: { padding: { top: 12, right: 8 } },
        plugins: {
          legend: { display: false },
          trendEndLabels: {
            display: true,
            fontSize: 11,
            backgroundColor: panelColor,
          },
          trendVersionLabels: {
            display: true,
            fontSize: 10,
            backgroundColor: panelColor,
          },
          tooltip: {
            backgroundColor: panelColor,
            titleColor: textColor,
            bodyColor: textColor,
            borderColor: gridColor,
            borderWidth: 1,
            callbacks: {
              label: (context) => {
                const record = context.dataset.records?.[context.dataIndex];
                if (!record) return context.dataset.label;
                const rankText = `#${record.rank}/${record.cohortSize}`;
                const scoreLabel =
                  record.scoreMetric === "极限分数"
                    ? t("trends.tooltip.score.max")
                    : t("trends.tooltip.score.median");
                const scoreText = `${scoreLabel}: ${record.score}`;
                const valueText =
                  mode === "rank"
                    ? `${context.dataset.label}: ${rankText}`
                    : `${context.dataset.label}: ${record.percentile.toFixed(1)}% (${rankText})`;
                return [
                  valueText,
                  `${t("trends.tooltip.version")}: ${record.modelName}`,
                  scoreText,
                ];
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
                  suggestedMin: 1,
                  grace: "8%",
                  grid: { color: gridColor },
                  ticks: {
                    color: textColor,
                    font: { size: 11 },
                    precision: 0,
                    callback: (value) => (Number.isInteger(value) && value >= 1 ? value : ""),
                  },
                  title: {
                    display: true,
                    text: t("trends.mode.rank"),
                    color: textColor,
                    font: { size: 12 },
                  },
                }
              : {
                  min: 0,
                  max: 105,
                  grid: { color: gridColor },
                  ticks: {
                    color: textColor,
                    font: { size: 11 },
                    callback: (value) => (value <= 100 ? `${value}%` : ""),
                  },
                  title: {
                    display: true,
                    text: t("trends.mode.percentile"),
                    color: textColor,
                    font: { size: 12 },
                  },
                },
        },
      },
      plugins: [trendVersionLabelsPlugin, trendEndLabelsPlugin],
    });
  }

  function renderModelPicker() {
    const picker = elements.modelPicker;
    if (!picker) return;
    picker.innerHTML = "";
    state.trends.series.forEach((series) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip" + (state.trends.selected.has(series.name) ? " selected" : "");
      chip.textContent = series.name;
      chip.title = series.members.join(" → ");
      chip.setAttribute("aria-pressed", String(state.trends.selected.has(series.name)));
      chip.addEventListener("click", () => {
        if (state.trends.selected.has(series.name)) {
          state.trends.selected.delete(series.name);
        } else {
          state.trends.selected.add(series.name);
        }
        chip.classList.toggle("selected");
        chip.setAttribute("aria-pressed", String(state.trends.selected.has(series.name)));
        renderTrendsChart();
        const chartWrap = elements.trendsCanvas ? elements.trendsCanvas.parentElement : null;
        if (chartWrap) {
          chartWrap.style.display = state.trends.selected.size ? "" : "none";
        }
      });
      picker.appendChild(chip);
    });
  }

  function renderTrends() {
    if (state.view !== "trends" || !elements.trendsSection) return;
    renderTrendsStatus();
    if (state.trends.loading) return;

    const hasData = state.trends.months.length > 0 && state.trends.series.length > 0;
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

  function updateChartVisibility() {
    if (!elements.chartSection) return;
    const show =
      state.view === "board" &&
      !!CATEGORY_CHART_CONFIG[state.currentCategory] &&
      state.filteredRows.length > 0;
    elements.chartSection.style.display = show ? "block" : "none";
  }

  function renderChart() {
    if (!elements.chartSection || !elements.chartFigures) return;

    const config = CATEGORY_CHART_CONFIG[state.currentCategory];
    const canRender =
      state.view === "board" && !!config && state.filteredRows.length > 0;
    const headers = new Set(state.headers || []);
    const hasAxes =
      canRender &&
      headers.has(config.score) &&
      findModelColumnIndex(state.headers) >= 0;
    // A metric is only drawn when its column exists in the loaded dataset
    // (e.g. vision data has no Token column, so only two figures appear).
    const activeMetrics =
      hasAxes
        ? CHART_METRICS.filter((metric) => config[metric] && headers.has(config[metric]))
        : [];

    if (elements.chartSectionHeading) {
      elements.chartSectionHeading.textContent = t("chart.section.title");
    }

    // Re-render invalidates every readout left over from the previous dataset.
    FIGURE_ORDER.forEach((metric) => {
      const readout = elements.chartFigures[metric]?.readout;
      if (readout) readout.textContent = "";
    });

    CHART_METRICS.forEach((metric) => {
      const figure = elements.chartFigures[metric];
      if (!figure) return;
      if (!activeMetrics.includes(metric)) {
        hideFigure(metric, figure);
        return;
      }
      if (figure.figure) figure.figure.style.display = "";
      renderMetricChart({ metric, config, figure });
    });

    // The radar figure resolves its own five columns and shows itself only
    // when every dimension exists in the loaded dataset.
    renderRadarChart();

    // Number only the figures that actually rendered, so hidden metrics never
    // leave gaps and the section count matches what the reader sees.
    const visibleMetrics = FIGURE_ORDER.filter((metric) => {
      const figure = elements.chartFigures[metric];
      return figure?.figure && figure.figure.style.display !== "none";
    });
    visibleMetrics.forEach((metric, index) => {
      const tag = elements.chartFigures[metric]?.tag;
      if (tag) tag.textContent = t("chart.figure.number", { n: index + 1 });
    });
    if (elements.chartSectionNote) {
      elements.chartSectionNote.textContent = visibleMetrics.length
        ? t("chart.section.count", { n: visibleMetrics.length })
        : "";
    }
  }

  function renderMetricChart({ metric: yAxisType, config, figure }) {
    if (!figure.canvas) return;
    const metricColumns = {
      cost: config.cost,
      time: config.time,
      token: config.token,
    };
    const yAxisColumnName = metricColumns[yAxisType] || config.cost;
    const swapped = !!config.swapAxes;
    const scoreLabel = t("chart.axis.medianScore");
    const metricLabel =
      yAxisType === "cost"
        ? t("chart.axis.cost")
        : yAxisType === "token"
          ? t("chart.axis.avgTokens")
          : t("chart.axis.avgTime");

    let scoreIndex = -1;
    let metricIndex = -1;
    for (let i = 0; i < state.headers.length; i += 1) {
      const header = state.headers[i];
      if (header === config.score) scoreIndex = i;
      if (header === yAxisColumnName) metricIndex = i;
    }
    const modelIndex = findModelColumnIndex(state.headers);

    if (scoreIndex === -1 || metricIndex === -1 || modelIndex === -1) {
      hideFigure(yAxisType, figure);
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
          if (swapped) xValue /= CNY_PER_USD;
          else yValue /= CNY_PER_USD;
        }
        return {
          x: xValue,
          y: yValue,
          label: modelName,
          isThink: row.isThink,
          logoImage: getModelLogoImage(modelName),
        };
      })
      .filter((item) => item !== null);

    // Recomputed per axis/filter so links always reflect the points actually visible.
    const tierGroups = buildModelTierGroups(chartData.map((point) => point.label)).byIndex;

    if (chartData.length === 0) {
      hideFigure(yAxisType, figure);
      return;
    }

    // Academic figure head: title, axis definitions and sample size.
    if (figure.title) {
      figure.title.textContent = t(`chart.figure.title.${yAxisType}`);
    }
    if (figure.axes) {
      figure.axes.textContent = t("chart.figure.axes", {
        x: chartXLabel,
        y: chartYLabel,
      });
    }
    if (figure.sample) {
      figure.sample.textContent = t("chart.figure.sample", { n: chartData.length });
    }

    const metricValues = chartData.map((point) => (swapped ? point.x : point.y));
    const minMetric = Math.min(...metricValues);
    const maxMetric = Math.max(...metricValues);
    const useLogScale =
      yAxisType !== "token" && minMetric > 0 && maxMetric / minMetric >= 15;
    const medianX = median(chartData.map((point) => point.x));
    const medianY = median(chartData.map((point) => point.y));
    const quadrantX = yAxisType === "cost" && !swapped ? 40 : medianX;
    const quadrantY = yAxisType === "cost" && swapped ? 40 : medianY;

    const ctx = figure.canvas.getContext("2d");
    const chartTextColor = getCssVariable("--color-text", "#212428");
    const chartGridColor = getCssVariable("--color-border", "#e3e1d9");
    const chartThinkBg = getCssVariable("--color-chart-think-bg", "rgba(158, 59, 50, 0.62)");
    const chartThinkBorder = getCssVariable("--color-chart-think-border", "rgba(158, 59, 50, 1)");
    const chartDefaultBg = getCssVariable("--color-chart-default-bg", "rgba(31, 78, 121, 0.58)");
    const chartDefaultBorder = getCssVariable("--color-chart-default-border", "rgba(31, 78, 121, 1)");

    // The hover readout reuses the former tooltip lines verbatim, but lives
    // outside the data area so nothing ever covers the points or their links.
    const formatPointLines = (point) => {
      const metricValue = swapped ? point.x : point.y;
      const metricText =
        yAxisType === "cost"
          ? state.locale === "en-US"
            ? formatUsd(metricValue)
            : `¥${metricValue}`
          : yAxisType === "token"
            ? Number(metricValue).toLocaleString("en-US")
            : `${metricValue}`;
      return [
        `${t("chart.tooltip.model")}: ${point.label}`,
        `${chartXLabel}: ${swapped ? metricText : point.x}`,
        `${chartYLabel}: ${swapped ? point.y : metricText}`,
      ];
    };
    const setReadout = (lines) => {
      if (figure.readout) {
        figure.readout.textContent = lines ? lines.join(" · ") : "";
      }
    };

    destroyChart(yAxisType);
    const instance = new Chart(ctx, {
      type: "scatter",
      data: {
        datasets: [
          {
            label: t("chart.dataset.performance"),
            data: chartData,
            backgroundColor: (context) => {
              const point = context.raw;
              if (point?.logoImage) return "rgba(0, 0, 0, 0)";
              return point && point.isThink ? chartThinkBg : chartDefaultBg;
            },
            borderColor: (context) => {
              const point = context.raw;
              if (point?.logoImage) return "rgba(0, 0, 0, 0)";
              return point && point.isThink ? chartThinkBorder : chartDefaultBorder;
            },
            borderWidth: 1.5,
            pointRadius: (context) => (context.raw?.logoImage ? MODEL_LOGO_POINT_SIZE / 2 : 5),
            pointHoverRadius: (context) =>
              context.raw?.logoImage ? MODEL_LOGO_POINT_SIZE / 2 + 2 : 7,
            pointHitRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onHover: (event, activeElements, chart) => {
          const hovered = activeElements?.[0];
          const point = hovered ? chartData[hovered.index] : null;
          setReadout(point ? formatPointLines(point) : null);
        },
        plugins: {
          legend: { display: false },
          // No canvas tooltip: the readout above the chart carries the same text.
          tooltip: { enabled: false },
          hoverFocus: { display: true, dimAlpha: 0.6 },
          modelTierLinks: {
            display: true,
            lineColor: getCssVariable("--color-chart-tier-link", "rgba(194, 104, 14, 0.95)"),
            lineOutline: getCssVariable(
              "--color-chart-tier-link-outline",
              "rgba(255, 255, 255, 0.9)"
            ),
          },
          quadrants: {
            medianX: quadrantX,
            medianY: quadrantY,
            sweetBg: getCssVariable("--color-chart-quadrant-sweet", "rgba(58, 107, 79, 0.05)"),
            // Top-left is the "good" quadrant on every metric: strong score with
            // low cost / low latency / few tokens.
            secondBg: getCssVariable("--color-chart-quadrant-second", "rgba(34, 197, 94, 0.14)"),
            lineColor: getCssVariable("--color-chart-median-line", "rgba(111, 108, 101, 0.75)"),
            labelColor: getCssVariable("--color-chart-quadrant-label", "rgba(111, 108, 101, 0.9)"),
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
          modelLogoPoints: { display: true, size: MODEL_LOGO_POINT_SIZE },
        },
        scales: {
          x: {
            type: swapped && useLogScale ? "logarithmic" : "linear",
            beginAtZero: yAxisType === "token" && swapped,
            suggestedMin: yAxisType === "cost" && !swapped ? 40 : undefined,
            suggestedMax: yAxisType === "cost" && !swapped ? 40 : undefined,
            title: {
              display: true,
              text: chartXLabel,
              color: chartTextColor,
              font: { size: 13, weight: "600" },
            },
            grid: { color: chartGridColor },
            ticks: {
              color: chartTextColor,
              font: { size: 11 },
              stepSize: yAxisType === "token" && swapped ? 5000 : undefined,
              callback: yAxisType === "token" && swapped ? formatTokenTick : undefined,
            },
          },
          y: {
            type: !swapped && useLogScale ? "logarithmic" : "linear",
            beginAtZero: yAxisType === "token" && !swapped,
            suggestedMin: yAxisType === "cost" && swapped ? 40 : undefined,
            suggestedMax: yAxisType === "cost" && swapped ? 40 : undefined,
            title: {
              display: true,
              text: chartYLabel,
              color: chartTextColor,
              font: { size: 13, weight: "600" },
            },
            grid: { color: chartGridColor },
            ticks: {
              color: chartTextColor,
              font: { size: 11 },
              stepSize: yAxisType === "token" && !swapped ? 5000 : undefined,
              callback: yAxisType === "token" && !swapped ? formatTokenTick : undefined,
            },
          },
        },
      },
      plugins: [
        quadrantPlugin,
        hoverFocusPlugin,
        modelTierLinksPlugin,
        modelLogoPointsPlugin,
        pointLabelsPlugin,
      ],
    });
    instance.$modelTierGroups = tierGroups;
    chartInstances.set(yAxisType, instance);
  }

  function formatRadarRaw(dimensionKey, raw) {
    if (raw === null || raw === undefined || !Number.isFinite(raw)) return "—";
    if (dimensionKey === "token") return Number(raw).toLocaleString("en-US");
    if (dimensionKey === "cost") {
      return state.locale === "en-US" ? formatUsd(raw / CNY_PER_USD) : `¥${raw}`;
    }
    if (dimensionKey === "time") return `${raw} s`;
    return `${raw}`;
  }

  function radarPalette() {
    return isDarkThemeActive() ? SERIES_PALETTE_DARK : SERIES_PALETTE_LIGHT;
  }

  function styleRadarDataset(dataset, color) {
    dataset.borderColor = color;
    dataset.backgroundColor = withAlpha(color, 0.1);
    dataset.pointBackgroundColor = color;
    dataset.pointBorderColor = color;
  }

  function buildRadarDataset(model, color) {
    const dataset = {
      label: model.name,
      data: model.values,
      $raw: model.raw,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      fill: true,
    };
    styleRadarDataset(dataset, color);
    return dataset;
  }

  // Stable palette slots: adding/removing a model never recolors the others.
  function ensureRadarColorSlots(names, palette) {
    const used = new Set(
      [...radarState.colorSlots]
        .filter(([name]) => names.has(name))
        .map(([, slot]) => slot)
    );
    names.forEach((name) => {
      if (radarState.colorSlots.has(name)) return;
      let slot = 0;
      while (slot < palette.length - 1 && used.has(slot)) slot += 1;
      radarState.colorSlots.set(name, slot);
      used.add(slot);
    });
  }

  // Build the option list once per dataset. Re-renders reuse the same nodes,
  // so the scroll position and focus are preserved.
  function buildRadarPicker(figure, models) {
    if (figure.pickerLabel) {
      figure.pickerLabel.textContent = t("chart.radar.picker.label");
    }
    if (!figure.pickerList) return false;
    figure.pickerList.setAttribute("aria-label", t("chart.radar.picker.aria"));
    const signature = models.map((model) => model.name).join("\u0000");
    if (radarState.listSignature === signature && figure.pickerList.childElementCount) {
      return false;
    }
    radarState.listSignature = signature;
    figure.pickerList.innerHTML = models
      .map((model) => {
        const name = escapeHtml(model.name);
        return (
          `<label class="radar-option">` +
          `<input type="checkbox" value="${name}" />` +
          `<span class="radar-option-swatch"></span>` +
          `<span class="radar-option-name" title="${name}">${name}</span>` +
          `</label>`
        );
      })
      .join("");
    return true;
  }

  // Incremental selection sync: the list DOM and the Chart instance stay put.
  // Only a genuinely new dataset animates in from the centre; existing ones
  // keep their object identity and indices, so nothing else is replayed.
  function applyRadarSelection({ animate = false } = {}) {
    const figure = elements.chartFigures?.radar;
    const model = radarState.model;
    if (!figure || !model) return;

    const palette = radarPalette();
    ensureRadarColorSlots(radarState.selected, palette);
    const selectedModels = model.byMedian
      .filter((item) => radarState.selected.has(item.name))
      .slice(0, RADAR_MAX_MODELS);
    const colorByName = new Map(
      selectedModels.map((item) => [
        item.name,
        palette[radarState.colorSlots.get(item.name) % palette.length],
      ])
    );

    if (figure.pickerCount) {
      figure.pickerCount.textContent = t("chart.radar.picker.count", {
        n: selectedModels.length,
        max: RADAR_MAX_MODELS,
      });
    }
    const atLimit = selectedModels.length >= RADAR_MAX_MODELS;
    figure.pickerList?.querySelectorAll("input[type=checkbox]").forEach((input) => {
      const checked = colorByName.has(input.value);
      input.checked = checked;
      input.disabled = !checked && atLimit;
      const option = input.closest(".radar-option");
      if (!option) return;
      option.classList.toggle("is-disabled", !checked && atLimit);
      const swatch = option.querySelector(".radar-option-swatch");
      if (swatch) {
        swatch.style.background = checked ? colorByName.get(input.value) : "transparent";
      }
    });

    const chart = chartInstances.get("radar");
    if (!chart) return;
    const signature = [
      model.labels.join("|"),
      isDarkThemeActive() ? "dark" : "light",
      ...selectedModels.map((item) => `${item.name}:${radarState.colorSlots.get(item.name)}`),
    ].join("~");
    if (radarState.chartSignature === signature) return;
    radarState.chartSignature = signature;

    const datasets = chart.data.datasets;
    const desired = new Set(selectedModels.map((item) => item.name));
    let added = false;
    for (let i = datasets.length - 1; i >= 0; i -= 1) {
      if (!desired.has(datasets[i].label)) datasets.splice(i, 1);
    }
    selectedModels.forEach((item) => {
      const color = colorByName.get(item.name);
      const existing = datasets.find((dataset) => dataset.label === item.name);
      if (existing) {
        existing.data = item.values;
        existing.$raw = item.raw;
        styleRadarDataset(existing, color);
        return;
      }
      datasets.push(buildRadarDataset(item, color));
      added = true;
    });

    // Chart.js only interpolates changed element properties, so the appended
    // polygon animates while the untouched ones remain exactly where they are.
    if (animate && added) chart.update();
    else chart.update("none");
  }

  function renderRadarChart() {
    const figure = elements.chartFigures?.radar;
    if (!figure?.canvas) return;

    const headers = state.headers || [];
    const columns = resolveRadarColumns(headers);
    const modelIndex = findModelColumnIndex(headers);
    const ready =
      state.view === "board" &&
      modelIndex >= 0 &&
      state.rows.length > 0 &&
      columns.every((column) => column.columnIndex >= 0);
    if (!ready) {
      hideFigure("radar", figure);
      radarState.model = null;
      radarState.listSignature = "";
      radarState.chartSignature = "";
      return;
    }
    if (figure.figure) figure.figure.style.display = "";

    // Reference values come from the whole current dataset, not the filtered
    // rows, so switching a filter never reshapes every other model's profile.
    const models = state.rows.map((row) => ({
      name: String(row.cells[modelIndex] ?? "").trim() || "Unknown",
      raw: columns.map((column) => parseSortableNumber(row.cells[column.columnIndex])),
    }));

    const scales = columns.map((dimension, index) => {
      const values = models
        .map((model) => model.raw[index])
        .filter((value) => value !== null && Number.isFinite(value));
      if (!values.length) return { best: 0, worst: 0, origin: 0 };
      const min = Math.min(...values);
      const max = Math.max(...values);
      const best = dimension.higherIsBetter ? max : min;
      const worst = dimension.higherIsBetter ? min : max;
      return { best, worst, origin: worst * RADAR_WORST_ORIGIN_RATIO };
    });

    const normalized = models.map((model) => ({
      name: model.name,
      raw: model.raw,
      values: model.raw.map((value, index) => {
        if (value === null || !Number.isFinite(value)) return 0;
        const span = scales[index].best - scales[index].origin;
        if (Math.abs(span) < 1e-9) return 0.5;
        return clamp01((value - scales[index].origin) / span);
      }),
    }));

    // List order follows the leaderboard's median score (dimension index 1).
    const byMedian = [...normalized].sort(
      (a, b) => (b.raw[1] ?? -Infinity) - (a.raw[1] ?? -Infinity)
    );
    const datasetKey = state.currentDatasetKey || state.currentCategory || "";
    if (radarState.datasetKey !== datasetKey) {
      radarState.datasetKey = datasetKey;
      radarState.selected = new Set(
        byMedian.slice(0, RADAR_DEFAULT_MODELS).map((model) => model.name)
      );
      radarState.colorSlots.clear();
      radarState.listSignature = "";
    } else {
      const available = new Set(normalized.map((model) => model.name));
      radarState.selected = new Set(
        [...radarState.selected].filter((name) => available.has(name))
      );
      [...radarState.colorSlots.keys()].forEach((name) => {
        if (!available.has(name)) radarState.colorSlots.delete(name);
      });
    }

    const labels = RADAR_DIMENSIONS.map((dimension) => t(dimension.labelKey));
    radarState.model = { byMedian, columns, labels };

    if (figure.title) figure.title.textContent = t("chart.figure.title.radar");
    if (figure.axes) figure.axes.textContent = t("chart.radar.axes");
    if (figure.sample) {
      figure.sample.textContent = t("chart.figure.sample", { n: normalized.length });
    }
    const listChanged = buildRadarPicker(figure, byMedian);

    const chartTextColor = getCssVariable("--color-text", "#212428");
    const chartGridColor = getCssVariable("--color-border", "#e3e1d9");
    const labelFontFamily = getCssVariable("--font-family-serif", "serif");
    const setReadout = (text) => {
      if (figure.readout) figure.readout.textContent = text || "";
    };

    // One radar instance for the lifetime of the view. Full re-renders only
    // refresh labels/theme colors; selection toggles never reach this path.
    let instance = chartInstances.get("radar");
    const created = !instance;
    if (!instance) {
      radarState.chartSignature = "";
      instance = new Chart(figure.canvas.getContext("2d"), {
        type: "radar",
        data: { labels, datasets: [] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          // Only newly added elements have a start/end difference, so this
          // transition applies to the incoming polygon, not the existing ones.
          animation: { duration: 550, easing: "easeOutQuart" },
          onHover: (event, activeElements, chart) => {
            const hit = activeElements?.[0];
            if (!hit) {
              setReadout(null);
              return;
            }
            const dataset = chart.data.datasets[hit.datasetIndex];
            const model = radarState.model;
            if (!dataset || !model) return;
            const dimension = model.columns[hit.index];
            setReadout(
              `${dataset.label} · ${model.labels[hit.index]}: ${formatRadarRaw(
                dimension.key,
                dataset.$raw?.[hit.index]
              )}`
            );
          },
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
          },
          scales: {
            r: {
              min: 0,
              max: 1,
              beginAtZero: true,
              angleLines: { color: chartGridColor },
              grid: { color: chartGridColor, circular: false, lineWidth: 1 },
              ticks: { display: false, stepSize: 0.25 },
              pointLabels: {
                color: chartTextColor,
                padding: 14,
                font: { size: 13, family: labelFontFamily, weight: "600" },
              },
            },
          },
        },
      });
      chartInstances.set("radar", instance);
    } else {
      instance.data.labels = labels;
      instance.options.scales.r.angleLines.color = chartGridColor;
      instance.options.scales.r.grid.color = chartGridColor;
      instance.options.scales.r.pointLabels.color = chartTextColor;
      instance.options.scales.r.pointLabels.font.family = labelFontFamily;
    }

    // Animate only when models genuinely appear for the first time (initial
    // load or a dataset switch); filter/theme/locale changes stay static.
    applyRadarSelection({ animate: created || listChanged });
  }

  return {
    renderChart,
    renderRadarChart,
    renderTrends,
    renderTrendsChart,
    renderTrendsStatus,
    updateChartVisibility,
    updateTrendsCaption,
  };
}
