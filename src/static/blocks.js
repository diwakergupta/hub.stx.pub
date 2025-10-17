import { chartHelpers } from "./charts-helpers.js";

const COST_MAX = {
  read_length: 100_000_000,
  read_count: 15_000,
  write_length: 15_000_000,
  write_count: 15_000,
  runtime: 5_000_000_000,
};

const percentSeries = [
  { key: "read_length", label: "Read Length", color: "#f14668" },
  { key: "read_count", label: "Read Count", color: "#3273dc" },
  { key: "write_length", label: "Write Length", color: "#48c78e" },
  { key: "write_count", label: "Write Count", color: "#ffd257" },
  { key: "runtime", label: "Runtime", color: "#b86bff" },
];

const loadingBox = document.getElementById("loading-box");
const errorBox = document.getElementById("error-box");
const contentBox = document.getElementById("content-box");
const blocksCount = document.getElementById("blocks-count");
const rangeStart = document.getElementById("range-start");
const rangeEnd = document.getElementById("range-end");

const chartCanvases = {
  cost: document.getElementById("costChart"),
  tenure: document.getElementById("tenureChart"),
  timestamp: document.getElementById("timestampChart"),
  arrival: document.getElementById("arrivalChart"),
};

let charts = [];

function hide(element) {
  element?.classList.add("is-hidden");
}

function show(element) {
  element?.classList.remove("is-hidden");
}

function describeRange(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    blocksCount.textContent = "0";
    rangeStart.textContent = "";
    rangeEnd.textContent = "";
    return;
  }
  blocksCount.textContent = blocks.length.toLocaleString();
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  rangeStart.textContent = first?.burnHeaderHeight?.toLocaleString?.() ?? "";
  rangeEnd.textContent = last?.burnHeaderHeight?.toLocaleString?.() ?? "";
}

function resetExistingCharts() {
  if (charts.length === 0) return;
  charts.forEach((chart) => chart?.destroy?.());
  charts = [];
}

async function renderCharts(blocks) {
  const labels = blocks.map((block) => block.blockHeight);
  const tenureLines = blocks
    .filter((block) => block.tenureChanged)
    .map((block) => block.blockHeight);

  resetExistingCharts();

  const costDatasets = [
    ...percentSeries.map((series) => ({
      label: series.label,
      data: blocks.map((block) =>
        chartHelpers.toPercent(
          block.cost?.[series.key] ?? 0,
          COST_MAX[series.key],
        ),
      ),
      borderColor: series.color,
      tension: 0.1,
      pointRadius: 0,
      yAxisID: "percent",
    })),
    {
      label: "Block Size (bytes)",
      data: blocks.map((block) => block.blockSize ?? 0),
      borderColor: "#ff851b",
      borderDash: [6, 6],
      tension: 0.1,
      pointRadius: 0,
      yAxisID: "size",
    },
  ];

  charts.push(
    await chartHelpers.lineChart(
      chartCanvases.cost,
      labels,
      costDatasets,
      tenureLines,
      {
        scales: {
          percent: {
            type: "linear",
            position: "left",
            ticks: { callback: chartHelpers.formatPercent },
          },
          size: {
            type: "linear",
            position: "right",
            grid: { drawOnChartArea: false },
            ticks: { callback: chartHelpers.formatNumber },
          },
        },
      },
    ),
  );

  const tenureDatasets = [
    ...percentSeries.map((series) => ({
      label: series.label,
      data: blocks.map((block) =>
        chartHelpers.toPercent(
          block.tenureCost?.[series.key] ?? 0,
          COST_MAX[series.key],
        ),
      ),
      borderColor: series.color,
      tension: 0.1,
      pointRadius: 0,
      yAxisID: "percent",
    })),
    {
      label: "Tenure Fees (STX)",
      data: blocks.map((block) => (block.tenureTxFees ?? 0) / 1_000_000),
      borderColor: "#ff851b",
      borderDash: [6, 6],
      tension: 0.1,
      pointRadius: 0,
      yAxisID: "fees",
    },
  ];

  charts.push(
    await chartHelpers.lineChart(
      chartCanvases.tenure,
      labels,
      tenureDatasets,
      tenureLines,
      {
        scales: {
          percent: {
            type: "linear",
            position: "left",
            ticks: { callback: chartHelpers.formatPercent },
          },
          fees: {
            type: "linear",
            position: "right",
            grid: { drawOnChartArea: false },
            ticks: {
              callback: (value) => `${chartHelpers.formatNumber(value)} STX`,
            },
          },
        },
      },
    ),
  );

  const timestampDataset = [
    {
      label: "Block Timestamp",
      data: blocks.map((block) => ({
        x: block.blockHeight,
        y: (block.timestamp ?? 0) * 1000,
      })),
      borderColor: "#00c4a7",
      tension: 0.1,
      pointRadius: 0,
      parsing: false,
    },
  ];

  charts.push(
    await chartHelpers.lineChart(
      chartCanvases.timestamp,
      labels,
      timestampDataset,
      tenureLines,
      {
        parsing: false,
        scales: {
          y: {
            type: "time",
            time: { tooltipFormat: "PPpp" },
            ticks: {
              // callback: (value) => chartHelpers.formatDate(value),
            },
          },
        },
      },
    ),
  );

  const cdfData = chartHelpers.buildArrivalCdf(blocks);
  charts.push(
    await chartHelpers.lineChart(
      chartCanvases.arrival,
      cdfData.map((point) => point.seconds),
      [
        {
          label: "Block Arrival CDF",
          data: cdfData,
          parsing: false,
          borderColor: "#209cee",
          tension: 0.1,
          pointRadius: 0,
        },
      ],
      [],
      {
        parsing: false,
        scales: {
          x: {
            type: "logarithmic",
            title: {
              display: true,
              text: "Seconds Between Blocks",
            },
            ticks: {
              callback: (value) => `${chartHelpers.formatNumber(value)}s`,
            },
          },
          y: {
            title: {
              display: true,
              text: "Cumulative Percentage",
            },
            min: 0,
            max: 100,
            ticks: {
              callback: chartHelpers.formatPercent,
            },
          },
        },
      },
    ),
  );
}

async function loadBlocks() {
  show(loadingBox);
  // hide(errorBox);
  // hide(contentBox);

  try {
    const response = await fetch("/api/blocks");
    if (!response.ok) {
      throw new Error(`Failed to load block data: ${response.statusText}`);
    }

    const payload = await response.json();
    const blocks = Array.isArray(payload.blocks) ? payload.blocks : [];

    describeRange(blocks);
    if (blocks.length === 0) {
      errorBox.textContent = "No block data available.";
      show(errorBox);
      return;
    }
    await renderCharts(blocks);
    show(contentBox);
  } catch (error) {
    console.error("[static-blocks] error loading blocks", error);
    errorBox.textContent =
      error instanceof Error ? error.message : "Unknown error loading data";
    show(errorBox);
  } finally {
    hide(loadingBox);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadBlocks);
} else {
  loadBlocks();
}
