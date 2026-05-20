# Algorithmic Trading
Algorithmic trading (also known as algo trading or automated trading) is the use of computer programs to automatically execute trades in financial markets based on a predefined set of instructions or rules. These instructions can be based on variables such as timing, price, quantity, or complex mathematical models etc.

## What is this repository about? 
A collection of Python notebooks, utilities, and experiments for building, testing, and analyzing algorithmic trading strategies.
This repo is meant as a practical, hands-on playground: from fetching market data and exploring indicators, to backtesting strategies and visualizing performance. It's opinionated enough to be useful, but flexible enough that you can plug in your own ideas.

## Stock and ETF tracker
The repository also includes a live daily market tracker in [`stock-tracker`](stock-tracker/). It groups selected ETFs and funds into separate category plots, tracks the latest daily prices, and includes a standalone VIX panel for market volatility.

Tracked groups currently include:

- Core U.S. market: `SPYM`, `VOO`, `IVV`, `VTI`
- Growth and tech: `QQQM`, `QQQ`, `VUG`, `VGT`, `SMH`
- Global and international: `VT`, `VXUS`
- Income and cash: `VYM`, `SPYD`, `SPAXX`
- Volatility: `VIX`

To run the tracker locally:

```bash
cd stock-tracker
node server.mjs
```

Then open [http://localhost:3000](http://localhost:3000).
