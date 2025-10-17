const formatterNumber = new Intl.NumberFormat("en-US");
const formatterPercent = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const formatterDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const zoomOptions = {
  limits: {
    x: { min: "original", max: "original" },
  },
  zoom: {
    drag: {
      enabled: true,
    },
    wheel: {
      enabled: true,
    },
    mode: "x",
  },
};

function formatNumber(value) {
  return formatterNumber.format(value ?? 0);
}

function formatPercent(value) {
  return formatterPercent.format((value ?? 0) / 100);
}

function formatDate(value) {
  return formatterDate.format(new Date(value ?? 0));
}

function toPercent(value, max) {
  if (!max) return 0;
  return ((value ?? 0) / max) * 100;
}

function buildArrivalCdf(blocks) {
  if (!Array.isArray(blocks) || blocks.length < 2) return [];
  const diffs = [];
  for (let i = 1; i < blocks.length; i += 1) {
    const prev = blocks[i - 1]?.timestamp ?? 0;
    const current = blocks[i]?.timestamp ?? 0;
    const diff = current - prev;
    if (Number.isFinite(diff) && diff >= 0) {
      diffs.push(diff);
    }
  }
  diffs.sort((a, b) => a - b);
  if (diffs.length === 0) return [];
  return diffs.map((seconds, index) => ({
    seconds,
    y: ((index + 1) / diffs.length) * 100,
  }));
}

async function lineChart(ctx, labels, datasets, tenureLines, options = {}) {
  const lineAnnotations =
    Array.isArray(tenureLines) && tenureLines.length > 0
      ? tenureLines.map((height, index) => ({
          type: "line",
          xMin: height,
          xMax: height,
          borderColor: "#4a5568",
          borderDash: [4, 4],
          borderWidth: 1,
          label: {
            display: false,
            content: `Tenure ${height}`,
          },
        }))
      : [];

  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.dataset.label ?? "";
              if (context.parsed?.y == null) return label;
              return `${label}: ${formatNumber(context.parsed.y)}`;
            },
          },
        },
        annotation: {
          annotations: lineAnnotations.reduce((acc, value, index) => {
            acc[`tenure-${index}`] = value;
            return acc;
          }, {}),
        },
        zoom: zoomOptions,
        animation: false,
      },
      scales: options.scales ?? {},
      parsing: options.parsing ?? true,
    },
  });
  chart.update();
  return chart;
}

export const chartHelpers = {
  formatNumber,
  formatPercent,
  formatDate,
  toPercent,
  buildArrivalCdf,
  lineChart,
};
