const cards = document.querySelector("#cards");
const categoryPanels = document.querySelector("#category-panels");
const statusPill = document.querySelector("#status-pill");
const updatedAt = document.querySelector("#updated-at");
const refreshButton = document.querySelector("#refresh-button");
const rangeButtons = [...document.querySelectorAll(".range-button")];
const apiBase = window.location.protocol === "file:" ? "http://127.0.0.1:3000" : "";

const palette = getComputedStyle(document.documentElement);
const colors = {
  grid: palette.getPropertyValue("--grid").trim(),
  muted: palette.getPropertyValue("--muted").trim(),
};
const panelPalettes = {
  "core-us": ["#0b7a75", "#1c4b82", "#f29e4c", "#6a4c93"],
  "growth-tech": ["#dd5a2e", "#3a86ff", "#b83280", "#111111", "#5c8001"],
  "global-international": ["#1b998b", "#7b2cbf"],
  "income-cash": ["#8d99ae", "#ef476f", "#118ab2"],
};

const state = {
  range: "3mo",
  payload: null,
  requestId: 0,
  lastUpdatedAt: null,
  hoverDates: {},
  renderedSeries: {},
  plotAreas: {},
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

const cashFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
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
  if (valueType === "cash") {
    return cashFormatter.format(value);
  }

  if (valueType === "index") {
    return numberFormatter.format(value);
  }

  return currencyFormatter.format(value);
}

function formatChangeValue(value, valueType) {
  if (valueType === "cash") {
    return cashFormatter.format(value);
  }

  if (valueType === "index") {
    return numberFormatter.format(value);
  }

  return numberFormatter.format(value);
}

function setRangeButtonsDisabled(disabled) {
  rangeButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

function setActiveRange(nextRange) {
  state.range = nextRange;
  rangeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.range === nextRange);
  });
}

async function loadData() {
  const requestId = ++state.requestId;
  statusPill.textContent = `Refreshing ${state.range.toUpperCase()} categories…`;
  refreshButton.disabled = true;
  setRangeButtonsDisabled(true);

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);
    const response = await fetch(`${apiBase}/api/stocks?range=${state.range}`, {
      signal: controller.signal,
    });
    window.clearTimeout(timeoutId);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload?.error || "Unable to fetch fund data.");
    }

    if (requestId !== state.requestId) {
      return;
    }

    state.payload = payload;
    state.lastUpdatedAt = new Date(payload.fetchedAt);

    renderCards(payload.assets);
    renderCategoryPanels(payload.categories, payload.assets);
    drawAllCharts();

    statusPill.textContent = `${state.range.toUpperCase()} categories loaded`;
    updatedAt.textContent = `Last checked ${fullDateFormatter.format(state.lastUpdatedAt)} at ${state.lastUpdatedAt.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}.`;
  } catch (error) {
    if (requestId !== state.requestId) {
      return;
    }

    statusPill.textContent = "Refresh failed";
    if (error instanceof DOMException && error.name === "AbortError") {
      updatedAt.textContent = window.location.protocol === "file:"
        ? "Timed out reaching localhost. Keep the local server running and open http://127.0.0.1:3000 for the smoothest experience."
        : "Timed out reaching the data endpoint.";
    } else {
      updatedAt.textContent = error instanceof Error ? error.message : "Unknown error";
    }
  } finally {
    if (requestId === state.requestId) {
      refreshButton.disabled = false;
      setRangeButtonsDisabled(false);
    }
  }
}

function renderCards(assets) {
  cards.innerHTML = assets
    .map((asset) => {
      const directionClass = asset.dailyChange >= 0 ? "up" : "down";
      const changePrefix = asset.dailyChange >= 0 ? "+" : "";

      return `
        <article class="card">
          <div class="card-header">
            <div>
              <h3 class="card-label">${asset.alias}</h3>
              <p class="card-symbol">${asset.name} · ${asset.symbol}</p>
            </div>
            <span class="pill">${asset.currency}</span>
          </div>
          <p class="price">${formatValue(asset.latestClose, asset.valueType)}</p>
          <p class="change ${directionClass}">
            ${changePrefix}${formatChangeValue(asset.dailyChange, asset.valueType)} (${changePrefix}${numberFormatter.format(asset.dailyChangePercent)}%)
          </p>
          <p class="card-note">${asset.note}</p>
        </article>
      `;
    })
    .join("");
}

function renderCategoryPanels(categories, assets) {
  categoryPanels.innerHTML = categories
    .map((category) => {
      const categoryAssets = assets.filter((asset) => asset.category === category.key);

      return `
        <section class="chart-panel category-panel" data-category="${category.key}">
          <div class="chart-toolbar chart-toolbar-single">
            <div class="toolbar-copy">
              <h2>${category.title}</h2>
              <p>${category.description}</p>
            </div>
          </div>

          <div class="chart-frame">
            <canvas id="chart-${category.key}" aria-label="${category.title} line chart"></canvas>
            <div id="tooltip-${category.key}" class="tooltip" hidden></div>
          </div>

          <div class="chart-legend" aria-hidden="true">
            ${categoryAssets
              .map(
                (asset, index) => `
                  <span class="legend-item">
                    <span class="legend-swatch" style="background:${getSeriesColor(category.key, index)}"></span>
                    ${asset.alias}
                  </span>
                `,
              )
              .join("")}
          </div>
        </section>
      `;
    })
    .join("");

  categories.forEach((category) => {
    const canvas = document.querySelector(`#chart-${category.key}`);
    const tooltip = document.querySelector(`#tooltip-${category.key}`);

    canvas.addEventListener("mousemove", (event) => {
      updateTooltip(category.key, canvas, tooltip, event.clientX, event.clientY);
    });

    canvas.addEventListener("mouseleave", () => {
      state.hoverDates[category.key] = null;
      tooltip.hidden = true;
      drawAllCharts();
    });
  });
}

function getSeriesColor(categoryKey, index) {
  const paletteForCategory = panelPalettes[categoryKey] || ["#1c4b82"];
  return paletteForCategory[index % paletteForCategory.length];
}

function drawAllCharts() {
  if (!state.payload) {
    return;
  }

  state.payload.categories.forEach((category) => {
    const assets = state.payload.assets.filter((asset) => asset.category === category.key);
    const canvas = document.querySelector(`#chart-${category.key}`);

    drawCategoryChart(category.key, canvas, assets);
  });
}

function drawCategoryChart(categoryKey, canvas, assets) {
  if (!canvas || !assets.length) {
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

  const padding = { top: 26, right: 28, bottom: 44, left: 62 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const allPoints = assets.flatMap((asset) =>
    asset.points.map((point) => ({
      ...point,
      timestamp: Date.parse(point.date),
    })),
  );

  const xMin = Math.min(...allPoints.map((point) => point.timestamp));
  const xMax = Math.max(...allPoints.map((point) => point.timestamp));
  const values = allPoints.map((point) => point.value);
  const yMin = Math.min(...values);
  const yMax = Math.max(...values);
  const yPadding = (yMax - yMin || 1) * 0.12;
  const scaledYMin = yMin - yPadding;
  const scaledYMax = yMax + yPadding;
  const valueType = assets.some((asset) => asset.valueType === "cash") ? "cash" : "currency";

  const xFor = (timestamp) =>
    padding.left + ((timestamp - xMin) / (xMax - xMin || 1)) * plotWidth;
  const yFor = (value) =>
    padding.top + plotHeight - ((value - scaledYMin) / (scaledYMax - scaledYMin || 1)) * plotHeight;

  state.plotAreas[categoryKey] = { padding, plotWidth, plotHeight, width, height, xMin, xMax };

  drawGrid(ctx, width, height, padding, plotWidth, plotHeight, scaledYMin, scaledYMax, xMin, xMax, xFor, yFor, valueType);

  state.renderedSeries[categoryKey] = assets.map((asset, index) => ({
    ...asset,
    color: getSeriesColor(categoryKey, index),
    points: asset.points.map((point) => {
      const timestamp = Date.parse(point.date);
      return {
        ...point,
        timestamp,
        x: xFor(timestamp),
        y: yFor(point.value),
      };
    }),
  }));

  state.renderedSeries[categoryKey].forEach((series) => drawLineSeries(ctx, series));

  if (state.hoverDates[categoryKey]) {
    drawHoverState(ctx, categoryKey, state.hoverDates[categoryKey]);
  }
}

function drawGrid(ctx, width, height, padding, plotWidth, plotHeight, yMin, yMax, xMin, xMax, xFor, yFor, valueType) {
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

    ctx.fillText(formatValue(value, valueType), 10, y + 4);
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

function drawHoverState(ctx, categoryKey, hoverTimestamp) {
  const nearestPoints = state.renderedSeries[categoryKey]
    .map((series) => {
      const point = findNearestPoint(series.points, hoverTimestamp);
      return point ? { ...point, alias: series.alias, color: series.color, valueType: series.valueType } : null;
    })
    .filter(Boolean);

  if (!nearestPoints.length) {
    return;
  }

  const guideX = nearestPoints[0].x;
  const { padding, height } = state.plotAreas[categoryKey];

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

function updateTooltip(categoryKey, canvas, tooltip, clientX, clientY) {
  if (!state.payload || !state.plotAreas[categoryKey]) {
    tooltip.hidden = true;
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const relativeX = clientX - rect.left;
  const { padding, plotWidth, xMin, xMax } = state.plotAreas[categoryKey];

  if (relativeX < padding.left || relativeX > padding.left + plotWidth) {
    state.hoverDates[categoryKey] = null;
    tooltip.hidden = true;
    drawAllCharts();
    return;
  }

  const ratio = (relativeX - padding.left) / plotWidth;
  state.hoverDates[categoryKey] = xMin + ratio * (xMax - xMin);
  drawAllCharts();

  const nearestPoints = state.renderedSeries[categoryKey].map((series) => ({
    series,
    point: findNearestPoint(series.points, state.hoverDates[categoryKey]),
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

window.addEventListener("resize", () => {
  drawAllCharts();
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
