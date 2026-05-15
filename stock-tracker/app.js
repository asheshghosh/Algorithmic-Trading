const marketCanvas = document.querySelector("#chart");
const marketTooltip = document.querySelector("#tooltip");
const vixCanvas = document.querySelector("#vix-chart");
const vixTooltip = document.querySelector("#vix-tooltip");
const cards = document.querySelector("#cards");
const legend = document.querySelector("#legend");
const vixLegend = document.querySelector("#vix-legend");
const statusPill = document.querySelector("#status-pill");
const updatedAt = document.querySelector("#updated-at");
const refreshButton = document.querySelector("#refresh-button");
const rangeButtons = [...document.querySelectorAll(".range-button")];

const palette = getComputedStyle(document.documentElement);
const seriesPalette = [
  "#0b7a75",
  "#dd5a2e",
  "#1c4b82",
  "#b83280",
  "#6a4c93",
  "#1b998b",
  "#f29e4c",
  "#3a86ff",
  "#5c8001",
  "#111111",
];
const colors = {
  grid: palette.getPropertyValue("--grid").trim(),
  muted: palette.getPropertyValue("--muted").trim(),
};

const state = {
  range: "3mo",
  payload: null,
  plotAreas: {
    market: null,
    vix: null,
  },
  renderedSeries: {
    market: [],
    vix: [],
  },
  hoverDates: {
    market: null,
    vix: null,
  },
  lastUpdatedAt: null,
  requestId: 0,
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatValue(value, valueType) {
  return valueType === "index" ? numberFormatter.format(value) : currencyFormatter.format(value);
}

async function loadData() {
  const requestId = ++state.requestId;
  statusPill.textContent = `Refreshing ${state.range.toUpperCase()} prices…`;
  refreshButton.disabled = true;
  setRangeButtonsDisabled(true);

  try {
    const response = await fetch(`/api/stocks?range=${state.range}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.error || "Unable to fetch stock data.");
    }

    if (requestId !== state.requestId) {
      return;
    }

    state.payload = payload;
    state.lastUpdatedAt = new Date(payload.fetchedAt);

    renderCards(payload.stocks);
    renderLegends(payload.stocks);
    drawCharts();

    statusPill.textContent = `${state.range.toUpperCase()} range loaded`;
    updatedAt.textContent = `Last checked ${fullDateFormatter.format(state.lastUpdatedAt)} at ${state.lastUpdatedAt.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}.`;
  } catch (error) {
    if (requestId !== state.requestId) {
      return;
    }

    statusPill.textContent = "Refresh failed";
    updatedAt.textContent = error instanceof Error ? error.message : "Unknown error";
  } finally {
    if (requestId === state.requestId) {
      refreshButton.disabled = false;
      setRangeButtonsDisabled(false);
    }
  }
}

function renderCards(stocks) {
  cards.innerHTML = stocks
    .map((stock) => {
      const directionClass = stock.dailyChange >= 0 ? "up" : "down";
      const changePrefix = stock.dailyChange >= 0 ? "+" : "";

      return `
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-label">${stock.alias}</h3>
              <p class="card-symbol">${stock.name} · ${stock.symbol}</p>
            </div>
            <span class="pill">${stock.currency}</span>
          </div>
          <p class="price">${formatValue(stock.latestClose, stock.valueType)}</p>
          <p class="change ${directionClass}">
            ${changePrefix}${numberFormatter.format(stock.dailyChange)} (${changePrefix}${numberFormatter.format(stock.dailyChangePercent)}%)
          </p>
          <p class="card-note">${stock.note}</p>
        </article>
      `;
    })
    .join("");
}

function renderLegends(stocks) {
  const marketStocks = stocks.filter((stock) => stock.alias !== "VIX");
  const vixStocks = stocks.filter((stock) => stock.alias === "VIX");

  legend.innerHTML = marketStocks
    .map(
      (stock, index) => `
        <span class="legend-item">
          <span class="legend-swatch" style="background:${seriesPalette[index % seriesPalette.length]}"></span>
          ${stock.alias}
        </span>
      `,
    )
    .join("");

  vixLegend.innerHTML = vixStocks
    .map(
      (stock) => `
        <span class="legend-item">
          <span class="legend-swatch" style="background:${seriesPalette[seriesPalette.length - 1]}"></span>
          ${stock.alias}
        </span>
      `,
    )
    .join("");
}

function setRangeButtonsDisabled(disabled) {
  rangeButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

function drawCharts() {
  if (!state.payload) {
    return;
  }

  const marketStocks = state.payload.stocks.filter((stock) => stock.alias !== "VIX");
  const vixStocks = state.payload.stocks.filter((stock) => stock.alias === "VIX");

  drawChartPanel({
    key: "market",
    canvas: marketCanvas,
    stocks: marketStocks,
    formatter: (value) => currencyFormatter.format(value),
    colorsForSeries: (index) => seriesPalette[index % seriesPalette.length],
  });

  drawChartPanel({
    key: "vix",
    canvas: vixCanvas,
    stocks: vixStocks,
    formatter: (value) => numberFormatter.format(value),
    colorsForSeries: () => seriesPalette[seriesPalette.length - 1],
  });
}

function drawChartPanel({ key, canvas, stocks, formatter, colorsForSeries }) {
  if (!stocks.length) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = rect.width;
  const height = rect.height;

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const padding = { top: 26, right: 28, bottom: 44, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const allPoints = stocks.flatMap((stock) =>
    stock.points.map((point) => ({
      ...point,
      timestamp: Date.parse(point.date),
    })),
  );

  const xMin = Math.min(...allPoints.map((point) => point.timestamp));
  const xMax = Math.max(...allPoints.map((point) => point.timestamp));
  const values = allPoints.map((point) => point.value);
  const yMin = Math.min(...values);
  const yMax = Math.max(...values);
  const yPadding = (yMax - yMin || 1) * 0.1;
  const scaledYMin = yMin - yPadding;
  const scaledYMax = yMax + yPadding;

  const xFor = (timestamp) =>
    padding.left + ((timestamp - xMin) / (xMax - xMin || 1)) * plotWidth;
  const yFor = (value) =>
    padding.top + plotHeight - ((value - scaledYMin) / (scaledYMax - scaledYMin || 1)) * plotHeight;

  state.plotAreas[key] = { padding, plotWidth, plotHeight, width, height, xMin, xMax };

  drawGrid(ctx, width, height, padding, plotWidth, plotHeight, scaledYMin, scaledYMax, xMin, xMax, xFor, yFor, formatter);

  state.renderedSeries[key] = stocks.map((stock, index) => ({
    ...stock,
    color: colorsForSeries(index),
    points: stock.points.map((point) => {
      const timestamp = Date.parse(point.date);
      return {
        ...point,
        timestamp,
        x: xFor(timestamp),
        y: yFor(point.value),
      };
    }),
  }));

  state.renderedSeries[key].forEach((series) => drawLineSeries(ctx, series));

  if (state.hoverDates[key]) {
    drawHoverState(ctx, key, state.hoverDates[key]);
  }
}

function drawGrid(ctx, width, height, padding, plotWidth, plotHeight, yMin, yMax, xMin, xMax, xFor, yFor, formatter) {
  ctx.save();
  ctx.strokeStyle = colors.grid;
  ctx.fillStyle = colors.muted;
  ctx.lineWidth = 1;
  ctx.font = '12px "Space Grotesk", sans-serif';

  const ySteps = 5;
  for (let index = 0; index <= ySteps; index += 1) {
    const value = yMin + ((yMax - yMin) / ySteps) * index;
    const y = yFor(value);

    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    ctx.fillText(formatter(value), 10, y + 4);
  }

  const xSteps = Math.min(6, Math.max(3, Math.floor(plotWidth / 130)));
  for (let index = 0; index <= xSteps; index += 1) {
    const timestamp = xMin + ((xMax - xMin) / xSteps) * index;
    const x = xFor(timestamp);

    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, height - padding.bottom);
    ctx.stroke();

    ctx.fillText(shortDateFormatter.format(new Date(timestamp)), x - 22, height - 14);
  }

  ctx.restore();
}

function drawLineSeries(ctx, series) {
  if (!series.points.length) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = series.color;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  series.points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
      return;
    }

    ctx.lineTo(point.x, point.y);
  });

  ctx.stroke();

  const finalPoint = series.points.at(-1);
  ctx.fillStyle = "#fff8ee";
  ctx.strokeStyle = series.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(finalPoint.x, finalPoint.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawHoverState(ctx, key, hoverTimestamp) {
  const nearestPoints = state.renderedSeries[key]
    .map((series) => {
      const point = findNearestPoint(series.points, hoverTimestamp);
      return point ? { ...point, alias: series.alias, color: series.color, valueType: series.valueType } : null;
    })
    .filter(Boolean);

  if (!nearestPoints.length) {
    return;
  }

  const guideX = nearestPoints[0].x;
  const { padding, height } = state.plotAreas[key];

  ctx.save();
  ctx.strokeStyle = "rgba(31, 27, 23, 0.35)";
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.moveTo(guideX, padding.top);
  ctx.lineTo(guideX, height - padding.bottom);
  ctx.stroke();
  ctx.setLineDash([]);

  nearestPoints.forEach((point) => {
    ctx.fillStyle = point.color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function findNearestPoint(points, hoverTimestamp) {
  let nearest = null;

  for (const point of points) {
    if (!nearest || Math.abs(point.timestamp - hoverTimestamp) < Math.abs(nearest.timestamp - hoverTimestamp)) {
      nearest = point;
    }
  }

  return nearest;
}

function updateTooltip(chartKey, canvas, tooltip, clientX, clientY) {
  if (!state.payload || !state.plotAreas[chartKey]) {
    tooltip.hidden = true;
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const relativeX = clientX - rect.left;
  const { padding, plotWidth, xMin, xMax } = state.plotAreas[chartKey];

  if (relativeX < padding.left || relativeX > padding.left + plotWidth) {
    state.hoverDates[chartKey] = null;
    tooltip.hidden = true;
    drawCharts();
    return;
  }

  const ratio = (relativeX - padding.left) / plotWidth;
  state.hoverDates[chartKey] = xMin + ratio * (xMax - xMin);
  drawCharts();

  const nearestPoints = state.renderedSeries[chartKey].map((series) => ({
    series,
    point: findNearestPoint(series.points, state.hoverDates[chartKey]),
  }));

  const displayDate = nearestPoints[0]?.point?.date;

  tooltip.innerHTML = `
    <strong>${fullDateFormatter.format(new Date(displayDate))}</strong>
    ${nearestPoints
      .map(
        ({ series, point }) => `
          <span class="tooltip-row" style="color:${series.color}">
            ${series.alias}: ${formatValue(point.value, series.valueType)}
          </span>
        `,
      )
      .join("")}
  `;

  tooltip.hidden = false;
  tooltip.style.left = `${clientX - rect.left}px`;
  tooltip.style.top = `${clientY - rect.top}px`;
}

function setActiveRange(nextRange) {
  state.range = nextRange;
  rangeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.range === nextRange);
  });
}

function bindChartInteractions(chartKey, canvas, tooltip) {
  canvas.addEventListener("mousemove", (event) => {
    updateTooltip(chartKey, canvas, tooltip, event.clientX, event.clientY);
  });

  canvas.addEventListener("mouseleave", () => {
    state.hoverDates[chartKey] = null;
    tooltip.hidden = true;
    drawCharts();
  });
}

rangeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.range === state.range) {
      return;
    }

    setActiveRange(button.dataset.range);
    loadData();
  });
});

refreshButton.addEventListener("click", () => {
  loadData();
});

bindChartInteractions("market", marketCanvas, marketTooltip);
bindChartInteractions("vix", vixCanvas, vixTooltip);

window.addEventListener("resize", () => {
  drawCharts();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.lastUpdatedAt) {
    const elapsed = Date.now() - state.lastUpdatedAt.getTime();
    if (elapsed > 5 * 60 * 1000) {
      loadData();
    }
  }
});

setActiveRange(state.range);
loadData();
setInterval(loadData, 30 * 60 * 1000);
