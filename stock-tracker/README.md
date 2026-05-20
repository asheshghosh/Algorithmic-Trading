# Category ETF tracker

This page tracks grouped daily closing prices for:

- Core U.S. market: `SPYM`, `VOO`, `IVV`, `VTI`
- Growth and tech: `QQQM`, `QQQ`, `VUG`, `VGT`, `SMH`
- Global and international: `VT`, `VXUS`
- Income and cash: `VYM`, `SPYD`, `SPAXX`

## Run it

```bash
node server.mjs
```

Then open [http://localhost:3000](http://localhost:3000).

## Notes

- The frontend auto-refreshes every 30 minutes while open.
- The server proxies Yahoo Finance chart data so the browser does not need to call the finance API directly.
