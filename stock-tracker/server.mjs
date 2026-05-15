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

const trackedStocks = [
  {
    alias: "LRCX",
    symbol: "LRCX",
    name: "LAM Research",
    assetClass: "stocks",
    note: "Lam Research, tracked directly under its listed ticker LRCX.",
  },
  {
    alias: "MU",
    symbol: "MU",
    name: "Micron Technology",
    assetClass: "stocks",
    note: "Displayed and fetched as MU.",
  },
  {
    alias: "AAPL",
    symbol: "AAPL",
    name: "Apple",
    assetClass: "stocks",
    note: "Apple daily closing prices.",
  },
  {
    alias: "MSFT",
    symbol: "MSFT",
    name: "Microsoft",
    assetClass: "stocks",
    note: "Microsoft daily closing prices.",
  },
  {
    alias: "NVDA",
    symbol: "NVDA",
    name: "NVIDIA",
    assetClass: "stocks",
    note: "NVIDIA daily closing prices.",
  },
  {
    alias: "AMZN",
    symbol: "AMZN",
    name: "Amazon",
    assetClass: "stocks",
    note: "Amazon daily closing prices.",
  },
  {
    alias: "GOOGL",
    symbol: "GOOGL",
    name: "Alphabet",
    assetClass: "stocks",
    note: "Alphabet Class A daily closing prices.",
  },
  {
    alias: "META",
    symbol: "META",
    name: "Meta",
    assetClass: "stocks",
    note: "Meta daily closing prices.",
  },
  {
    alias: "S&P 500",
    symbol: "SPY",
    name: "S&P 500",
    assetClass: "etf",
    note: "S&P 500 trend shown through the SPY ETF as a liquid market proxy.",
  },
  {
    alias: "VIX",
    symbol: "^VIX",
    name: "CBOE Volatility Index",
    source: "yahoo",
    valueType: "index",
    note: "CBOE Volatility Index shown in its own panel for readability.",
  },
];

const staticFiles = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "application/javascript; charset=utf-8" },
  "/styles.css": { file: "styles.css", type: "text/css; charset=utf-8" },
};

const allowedRanges = new Set(["3mo", "6mo", "1y", "2y", "5y", "max", "ytd"]);
const cache = new Map();

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function resolveDateWindow(range) {
  const today = new Date();
  const toDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const fromDate = new Date(toDate);
  let limit = 365;

  switch (range) {
    case "3mo":
      fromDate.setMonth(fromDate.getMonth() - 3);
      limit = 100;
      break;
    case "6mo":
      fromDate.setMonth(fromDate.getMonth() - 6);
      limit = 200;
      break;
    case "1y":
      fromDate.setFullYear(fromDate.getFullYear() - 1);
      limit = 370;
      break;
    case "2y":
      fromDate.setFullYear(fromDate.getFullYear() - 2);
      limit = 740;
      break;
    case "5y":
      fromDate.setFullYear(fromDate.getFullYear() - 5);
      limit = 1900;
      break;
    case "ytd":
      fromDate.setMonth(0, 1);
      limit = 370;
      break;
    case "max":
      fromDate.setFullYear(fromDate.getFullYear() - 20);
      limit = 9999;
      break;
    default:
      fromDate.setFullYear(fromDate.getFullYear() - 1);
      limit = 370;
      break;
  }

  return {
    fromDate: formatDate(fromDate),
    toDate: formatDate(toDate),
    limit,
  };
}

function parseCurrencyValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/[$,]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function fetchChartData(stock, range) {
  const cacheKey = `${stock.symbol}:${range}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < cacheTtlMs) {
    return cached.data;
  }

  const source = stock.source || "nasdaq";
  let points;

  if (source === "yahoo") {
    points = await fetchYahooChartPoints(stock, range);
  } else {
    points = await fetchNasdaqChartPoints(stock, range);
  }

  if (!points.length) {
    throw new Error(`No price points available for ${stock.symbol}.`);
  }

  const latest = points.at(-1)?.value ?? null;
  const previous = points.at(-2)?.value ?? null;
  const change = Number.isFinite(latest) && Number.isFinite(previous)
    ? Number((latest - previous).toFixed(2))
    : null;
  const changePercent = Number.isFinite(latest) && Number.isFinite(previous) && previous !== 0
    ? Number((((latest - previous) / previous) * 100).toFixed(2))
    : null;

  const data = {
    alias: stock.alias,
    symbol: stock.symbol,
    name: stock.name,
    note: stock.note,
    currency: stock.valueType === "index" ? "INDEX" : "USD",
    valueType: stock.valueType || "currency",
    marketPrice: latest,
    latestClose: latest,
    dailyChange: change,
    dailyChangePercent: changePercent,
    points,
  };

  cache.set(cacheKey, { timestamp: Date.now(), data });
  return data;
}

async function fetchNasdaqChartPoints(stock, range) {
  const { fromDate, toDate, limit } = resolveDateWindow(range);
  const endpoint =
    `https://api.nasdaq.com/api/quote/${stock.symbol}/historical` +
    `?assetclass=${stock.assetClass || "stocks"}&fromdate=${fromDate}&limit=${limit}&todate=${toDate}`;

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
    throw new Error(`Nasdaq returned ${statusCode} for ${stock.symbol}.`);
  }

  const payload = JSON.parse(body);
  const rows = payload?.data?.tradesTable?.rows;

  if (!Array.isArray(rows) || !rows.length) {
    throw new Error(`No chart data returned for ${stock.symbol}.`);
  }

  return rows
    .map((row) => {
      const value = parseCurrencyValue(row.close);

      if (!Number.isFinite(value)) {
        return null;
      }

      const [month, day, year] = row.date.split("/");
      return {
        date: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
        value: Number(value.toFixed(2)),
      };
    })
    .filter(Boolean)
    .reverse();
}

async function fetchYahooChartPoints(stock, range) {
  const endpoint =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(stock.symbol)}` +
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
    throw new Error(`Yahoo returned ${statusCode} for ${stock.symbol}.`);
  }

  const payload = JSON.parse(body);
  const chart = payload?.chart?.result?.[0];
  const timestamps = chart?.timestamp || [];
  const closes = chart?.indicators?.quote?.[0]?.close || [];

  if (!timestamps.length || !closes.length) {
    throw new Error(`No chart data returned for ${stock.symbol}.`);
  }

  return timestamps
    .map((timestamp, index) => {
      const value = closes[index];

      if (!Number.isFinite(value)) {
        return null;
      }

      return {
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        value: Number(value.toFixed(2)),
      };
    })
    .filter(Boolean);
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

      const stocks = await Promise.all(trackedStocks.map((stock) => fetchChartData(stock, range)));

      json(res, 200, {
        range,
        fetchedAt: new Date().toISOString(),
        stocks,
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
