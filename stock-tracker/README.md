# Daily stock tracker

This page tracks daily closing prices for:

- `LRCX`, `MU`, `AAPL`, `MSFT`, `NVDA`, `AMZN`, `GOOGL`, and `META`
- The `S&P 500` trend via the `SPY` ETF as a liquid market proxy
- The `CBOE Volatility Index (VIX)` in a dedicated panel

## Run it

```bash
node server.mjs
```

Then open [http://localhost:3000](http://localhost:3000).

## Notes

- The frontend auto-refreshes every 30 minutes while open.
- The server proxies Nasdaq's historical quote data so the browser does not need to call the finance API directly.
