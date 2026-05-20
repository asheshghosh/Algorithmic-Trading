import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const host = "127.0.0.1";
const port = Number(process.env.PORT || 3000);
const cacheTtlMs = 15 * 60 * 1000;
const execFileAsync = promisify(execFile);

const categoryMeta = [
  {
    key: "core-us",
    title: "Core U.S. Market",
    description: "Broad U.S. equity exposure and S&P 500-style core funds.",
  },
  {
    key: "growth-tech",
    title: "Growth & Tech",
    description: "Nasdaq, growth, and semiconductor-heavy sector exposure.",
  },
  {
    key: "global-international",
    title: "Global & International",
    description: "World equity exposure outside a U.S.-only lens.",
  },
  {
    key: "income-cash",
    title: "Income & Cash",
    description: "Dividend-focused funds plus cash-like reserve exposure.",
  },
  {
    key: "volatility",
    title: "Volatility",
    description: "A separate market volatility panel for the CBOE Volatility Index.",
  },
];

const trackedAssets = [
  { alias: "SPYM", symbol: "SPYM", name: "SPDR Portfolio S&P 1500 Composite Stock Market ETF", category: "core-us" },
  { alias: "VOO", symbol: "VOO", name: "Vanguard S&P 500 ETF", category: "core-us" },
  { alias: "IVV", symbol: "IVV", name: "iShares Core S&P 500 ETF", category: "core-us" },
  { alias: "VTI", symbol: "VTI", name: "Vanguard Total Stock Market ETF", category: "core-us" },
  { alias: "QQQM", symbol: "QQQM", name: "Invesco NASDAQ 100 ETF", category: "growth-tech" },
  { alias: "QQQ", symbol: "QQQ", name: "Invesco QQQ Trust", category: "growth-tech" },
  { alias: "VUG", symbol: "VUG", name: "Vanguard Growth ETF", category: "growth-tech" },
  { alias: "VGT", symbol: "VGT", name: "Vanguard Information Technology ETF", category: "growth-tech" },
  { alias: "SMH", symbol: "SMH", name: "VanEck Semiconductor ETF", category: "growth-tech" },
  { alias: "VT", symbol: "VT", name: "Vanguard Total World Stock ETF", category: "global-international" },
  { alias: "VXUS", symbol: "VXUS", name: "Vanguard Total International Stock ETF", category: "global-international" },
  { alias: "VYM", symbol: "VYM", name: "Vanguard High Dividend Yield ETF", category: "income-cash" },
  { alias: "SPYD", symbol: "SPYD", name: "SPDR Portfolio S&P 500 High Dividend ETF", category: "income-cash" },
  { alias: "SPAXX", symbol: "SPAXX", name: "Fidelity Government Money Market Fund", category: "income-cash" },
  { alias: "VIX", symbol: "^VIX", name: "CBOE Volatility Index", category: "volatility" },
];

const staticFiles = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "application/javascript; charset=utf-8" },
  "/styles.css": { file: "styles.css", type: "text/css; charset=utf-8" },
};

const allowedRanges = new Set(["3mo", "6mo", "1y", "2y", "5y", "max", "ytd"]);
const cache = new Map();

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload));
}

async function fetchChartData(asset, range) {
  const cacheKey = `${asset.symbol}:${range}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < cacheTtlMs) {
    return cached.data;
  }

  const endpoint =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.symbol)}` +
    `?interval=1d&range=${range}&includeAdjustedClose=true`;

  const { stdout } = await execFileAsync("curl", [
    "-sS",
    "-L",
    "--compressed",
    "-H",
    "User-Agent: Mozilla/5.0",
    "-H",
    "Accept: application/json",
    "-w",
    "\n__STATUS__:%{http_code}",
    endpoint,
  ]);

  const marker = "\n__STATUS__:";
  const markerIndex = stdout.lastIndexOf(marker);
  const body = markerIndex >= 0 ? stdout.slice(0, markerIndex) : stdout;
  const statusCode = markerIndex >= 0 ? Number(stdout.slice(markerIndex + marker.length).trim()) : 0;

  if (statusCode !== 200) {
    throw new Error(`Yahoo returned ${statusCode} for ${asset.symbol}.`);
  }

  const payload = JSON.parse(body);
  const chart = payload?.chart?.result?.[0];
  const timestamps = chart?.timestamp || [];
  const adjustedCloses = chart?.indicators?.adjclose?.[0]?.adjclose || [];
  const closes = chart?.indicators?.quote?.[0]?.close || [];
  const instrumentType = chart?.meta?.instrumentType || "";

  const points = timestamps
    .map((timestamp, index) => {
      const adjustedValue = adjustedCloses[index];
      const closeValue = closes[index];
      const value = Number.isFinite(adjustedValue) ? adjustedValue : closeValue;

      if (!Number.isFinite(value)) {
        return null;
      }

      return {
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        value: Number(value.toFixed(4)),
      };
    })
    .filter(Boolean);

  if (!points.length) {
    throw new Error(`No price points available for ${asset.symbol}.`);
  }

  const latest = points.at(-1)?.value ?? null;
  const previous = points.at(-2)?.value ?? null;
  const change = Number.isFinite(latest) && Number.isFinite(previous)
    ? Number((latest - previous).toFixed(4))
    : null;
  const changePercent = Number.isFinite(latest) && Number.isFinite(previous) && previous !== 0
    ? Number((((latest - previous) / previous) * 100).toFixed(2))
    : null;

  const valueType = instrumentType === "MONEYMARKET"
    ? "cash"
    : instrumentType === "INDEX"
      ? "index"
      : "currency";
  const note = valueType === "cash"
    ? `${asset.alias} behaves like a cash reserve fund with very low volatility.`
    : asset.alias === "VIX"
      ? "VIX reflects expected S&P 500 volatility and is shown separately from the fund categories."
      : `${asset.alias} tracks the ${categoryMeta.find((category) => category.key === asset.category)?.title.toLowerCase() || "selected"} basket.`;

  const data = {
    alias: asset.alias,
    symbol: asset.symbol,
    name: asset.name,
    category: asset.category,
    currency: valueType === "index" ? "INDEX" : "USD",
    valueType,
    marketPrice: latest,
    latestClose: latest,
    dailyChange: change,
    dailyChangePercent: changePercent,
    note,
    points,
  };

  cache.set(cacheKey, { timestamp: Date.now(), data });
  return data;
}

async function serveStaticFile(res, pathname) {
  const asset = staticFiles[pathname];

  if (!asset) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const filePath = path.join(__dirname, asset.file);
  const content = await readFile(filePath);
  res.writeHead(200, { "Content-Type": asset.type });
  res.end(content);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/stocks") {
      const range = allowedRanges.has(url.searchParams.get("range"))
        ? url.searchParams.get("range")
        : "1y";

      const assets = await Promise.all(trackedAssets.map((asset) => fetchChartData(asset, range)));

      json(res, 200, {
        range,
        fetchedAt: new Date().toISOString(),
        categories: categoryMeta,
        assets,
      });
      return;
    }

    await serveStaticFile(res, url.pathname);
  } catch (error) {
    json(res, 500, {
      error: error instanceof Error ? error.message : "Unknown server error",
    });
  }
});

server.listen(port, host, () => {
  console.log(`Stock tracker ready at http://${host}:${port}`);
});
