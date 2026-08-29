import { t } from "./i18n.js?v=20260829-codev3-insights";
import {
  CATEGORY_CHART_CONFIG,
  CNY_PER_USD,
  TRENDS_SUPPORTED,
  median,
  parseSortableNumber,
} from "./benchmark-domain.js?v=20260829-codev3-insights";

const MODEL_LOGO_POINT_SIZE = 17;
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
    const placed = [];
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
  let chartInstance = null;
  let trendsChartInstance = null;

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
    } else if (!state.trends.months.length) {
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

  function getVisibleTrendMonths(months, selected) {
    const firstVisibleIndex = months.findIndex((month) =>
      selected.some((name) => month.ranks.has(name))
    );
    return firstVisibleIndex === -1 ? months : months.slice(firstVisibleIndex);
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

    const visibleMonths = getVisibleTrendMonths(months, selected);
    const mode = state.trends.mode;
    const palette = isDarkThemeActive() ? SERIES_PALETTE_DARK : SERIES_PALETTE_LIGHT;
    const colorIndex = new Map(state.trends.models.map((model, index) => [model.name, index]));
    const labels = visibleMonths.map((month) => month.label);

    const datasets = selected.map((name) => {
      const color = palette[(colorIndex.get(name) ?? 0) % palette.length];
      return {
        label: name,
        data: visibleMonths.map((month) => {
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
        layout: { padding: { top: 12, right: 8 } },
        plugins: {
          legend: { display: false },
          trendEndLabels: {
            display: true,
            fontSize: 11,
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
                const record = visibleMonths[context.dataIndex].ranks.get(context.dataset.label);
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
      plugins: [trendEndLabelsPlugin],
    });
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

    const yAxisType = elements.yAxisSelect ? elements.yAxisSelect.value : "cost";
    const yAxisColumnName = yAxisType === "cost" ? config.cost : config.time;
    const swapped = !!config.swapAxes;
    const scoreLabel = t("chart.axis.medianScore");
    const metricLabel = yAxisType === "cost" ? t("chart.axis.cost") : t("chart.axis.avgTime");

    let scoreIndex = -1;
    let metricIndex = -1;
    for (let i = 0; i < state.headers.length; i += 1) {
      const header = state.headers[i];
      if (header === config.score) scoreIndex = i;
      if (header === yAxisColumnName) metricIndex = i;
    }
    const modelIndex = findModelColumnIndex(state.headers);

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

    if (chartData.length === 0) {
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
      }
      if (elements.chartCaption) elements.chartCaption.textContent = "";
      return;
    }

    const metricValues = chartData.map((point) => (swapped ? point.x : point.y));
    const minMetric = Math.min(...metricValues);
    const maxMetric = Math.max(...metricValues);
    const useLogScale = minMetric > 0 && maxMetric / minMetric >= 15;
    const medianX = median(chartData.map((point) => point.x));
    const medianY = median(chartData.map((point) => point.y));
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

    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
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
        plugins: {
          legend: { display: false },
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
            secondBg:
              yAxisType === "cost"
                ? getCssVariable("--color-chart-quadrant-second", "rgba(34, 197, 94, 0.14)")
                : null,
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
            suggestedMin: yAxisType === "cost" && !swapped ? 40 : undefined,
            suggestedMax: yAxisType === "cost" && !swapped ? 40 : undefined,
            title: {
              display: true,
              text: chartXLabel,
              color: chartTextColor,
              font: { size: 13, weight: "600" },
            },
            grid: { color: chartGridColor },
            ticks: { color: chartTextColor, font: { size: 11 } },
          },
          y: {
            type: !swapped && useLogScale ? "logarithmic" : "linear",
            suggestedMin: yAxisType === "cost" && swapped ? 40 : undefined,
            suggestedMax: yAxisType === "cost" && swapped ? 40 : undefined,
            title: {
              display: true,
              text: chartYLabel,
              color: chartTextColor,
              font: { size: 13, weight: "600" },
            },
            grid: { color: chartGridColor },
            ticks: { color: chartTextColor, font: { size: 11 } },
          },
        },
      },
      plugins: [quadrantPlugin, modelLogoPointsPlugin, pointLabelsPlugin],
    });

    if (elements.chartCaption) {
      elements.chartCaption.textContent = t(`chart.caption.${yAxisType}`);
    }
  }

  return {
    renderChart,
    renderTrends,
    renderTrendsChart,
    renderTrendsStatus,
    updateChartVisibility,
    updateTrendsCaption,
  };
}
