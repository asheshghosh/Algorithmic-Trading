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


## VIX Index and Computation

The Cboe Volatility Index, commonly referred to as the **VIX Index**, is a market-based measure of expected near-term volatility in the U.S. equity market. More specifically, the VIX Index is designed to measure the market’s expectation of **30-day forward-looking volatility** of the S&P 500 Index, as implied by prices of S&P 500 Index options.

Unlike a stock index, which is calculated from prices of component stocks, the VIX is calculated from option prices. These option prices reflect the market’s expectation of future uncertainty or volatility. In this sense, the VIX is often described as an options-implied measure of expected volatility.

Conceptually, the VIX can be understood as the annualized expected standard deviation of S&P 500 returns over the next 30 days. For example, a VIX level of 20 indicates an option-implied annualized volatility of approximately 20%. This can be converted into an approximate 30-day one-standard-deviation move by scaling by the square root of time:

$$
\text{Expected 30-day move} \approx \frac{\text{VIX}}{100}\sqrt{\frac{30}{365}}
$$

Thus, a VIX of 20 corresponds to an approximate 30-day one-standard-deviation move of:

$$
0.20\sqrt{\frac{30}{365}} \approx 5.7\%
$$

Accordingly, the VIX is not a direct forecast of market direction. Instead, it is an options-implied measure of expected volatility. A higher VIX generally indicates that option prices embed greater expected uncertainty in the S&P 500 over the next 30 days, while a lower VIX generally indicates that option prices embed lower expected uncertainty.

---

## Theoretical Integral Formula for VIX

At a theoretical level, the VIX can be understood using a continuous-strike option-pricing formula. In this idealized version, the expected variance of the S&P 500 over a future time horizon is replicated using a continuum of out-of-the-money put and call options.

A common continuous-strike expression for the variance is:

$$
\sigma^2 =
\frac{2e^{rT}}{T}
\left(
\int_0^F \frac{P(K)}{K^2}\,dK
+
\int_F^\infty \frac{C(K)}{K^2}\,dK
\right)
$$

where:

- $\sigma^2$ is the option-implied variance over the relevant time horizon;
- $T$ is the time to expiration, expressed in years;
- $r$ is the risk-free interest rate;
- $F$ is the forward level of the S&P 500 Index;
- $K$ is the option strike price;
- $P(K)$ is the price of a put option with strike $K$;
- $C(K)$ is the price of a call option with strike $K$.

In this formula, put options with strikes below the forward level $F$ are used, and call options with strikes above the forward level $F$ are used. The factor $1/K^2$ weights the contribution of each option strike to the implied variance. This inverse-square weighting gives the formula its characteristic sensitivity to a broad strip of out-of-the-money options rather than to a single at-the-money option.

The VIX is then obtained by converting the implied variance into volatility and expressing the result as an annualized percentage:

$$
\text{VIX} = 100 \times \sqrt{\sigma^2}
$$

This integral formula is useful because it shows the core mathematical idea behind the VIX: the VIX is derived from the prices of a broad portfolio of options that collectively encode the market’s risk-neutral expectation of future variance.

---

## Practical Cboe Computation

In practice, the actual VIX cannot be computed using a true continuum of option strikes because real markets only list options at discrete strike prices. Therefore, the official Cboe methodology replaces the continuous integral with a discrete sum over available S&P 500 Index option strikes.

For a given option maturity, the Cboe-style variance contribution is calculated using the following generalized formula:

$$ \sigma^2 = \frac{2}{T} \sum_i \frac{\Delta K_i}{K_i^2} e^{RT} Q(K_i) -
\frac{1}{T}
\left[
\frac{F}{K_0} - 1
\right]^2
$$

where:

- $T$ is the time to expiration in years;
- $K_i$ is the strike price of the $i$-th option;
- $\Delta K_i$ is the spacing between adjacent strike prices;
- $R$ is the risk-free interest rate to expiration;
- $Q(K_i)$ is the midpoint of the bid-ask spread for the option at strike $K_i$;
- $F$ is the option-implied forward level of the S&P 500; and
- $K_0$ is the first strike at or below the forward index level.

For strikes below $K_0$, out-of-the-money puts are used. For strikes above $K_0$, out-of-the-money calls are used. At $K_0$, both the put and call may be used.

The discrete Cboe formula can be understood as a market-data approximation of the continuous integral formula. In the theoretical formula, the option contribution is written as an integral:

$$
\int \frac{Q(K)}{K^2}\,dK
$$

In the practical formula, that integral is approximated by a finite sum over listed option strikes:

$$
\sum_i \frac{\Delta K_i}{K_i^2}Q(K_i)
$$

Thus, the relationship between the two formulas is:

$$
\text{Cboe discrete VIX formula}
\approx
\text{continuous integral variance formula}
$$

The main difference is that the integral formula assumes options exist at every possible strike from zero to infinity, while the Cboe formula uses only the actual strikes that exist in the market.

---

## Near-Term and Next-Term Interpolation

The VIX is designed to represent a constant **30-day** measure of expected volatility. However, listed S&P 500 options generally do not expire exactly 30 days from the calculation date. To address this, the Cboe methodology uses two sets of options:

1. a near-term option maturity; and
2. a next-term option maturity.

These two maturities bracket the 30-day target horizon. A variance estimate is calculated separately for each maturity. The two variance estimates are then interpolated to obtain a constant 30-day variance estimate.

After interpolation, the square root is taken to convert variance into volatility, and the result is multiplied by 100:

$$ \text{VIX} =
100
\times
\sqrt{
\text{30-day interpolated variance}
}
$$

This final value is the reported VIX Index level.

---

## Difference Between the Integral Formula and the Cboe Formula

The integral formula and the Cboe formula express the same underlying idea, but at different levels of abstraction.

| Theoretical Integral Formula | Practical Cboe Formula |
|---|---|
| Assumes a continuum of option strikes. | Uses the finite set of listed option strikes. |
| Uses integrals over put and call prices. | Uses discrete sums over option midquotes. |
| Splits puts and calls around the forward level $F$. | Uses $K_0$, the strike at or below the forward level. |
| Assumes an idealized market with strikes from $0$ to $\infty$. | Uses available SPX/SPXW option strikes. |
| Represents the clean variance-swap replication formula. | Implements the formula using actual market data. |
| Usually omits exchange-specific filtering rules. | Includes strike selection rules, midpoint prices, zero-bid filters, and interpolation rules. |
| Describes the theoretical source of the VIX. | Describes how the VIX is actually calculated in practice. |

In other words, the integral formula is the clean mathematical expression for implied variance, while the Cboe formula is the real-world discretized implementation of that expression.

The practical Cboe calculation must address issues that the theoretical formula does not, including:

- discrete strike spacing;
- bid-ask spreads;
- missing or illiquid strikes;
- zero-bid options;
- options that do not expire exactly 30 days from the calculation date; and
- interpolation between two expiration dates.

Accordingly, the Wikipedia-style integral formula is best understood as the theoretical foundation of the VIX, while the Cboe formula is best understood as the operational algorithm used to calculate the actual VIX Index from market data.

---

## Summary

The VIX is an annualized, option-implied measure of expected 30-day volatility in the S&P 500 Index. The theoretical foundation of the VIX comes from a continuous-strike formula that expresses expected variance as an integral over out-of-the-money put and call option prices. In practice, because listed options exist only at discrete strike prices and maturities, Cboe computes the VIX using a discrete summation over available SPX/SPXW option strikes and then interpolates between near-term and next-term maturities to obtain a constant 30-day volatility measure.

Thus, the VIX can be summarized as:

$$\text{VIX} = 100 \times \sqrt{ \text{market-implied 30-day variance of the S&P 500}}$$

Because the VIX is derived from option prices, it reflects risk-neutral market pricing of volatility rather than a guaranteed or purely statistical prediction of realized future volatility.

---

## References

Cboe, *White Paper: Cboe Volatility Index®*.

https://cdn.cboe.com/resources/indices/Volatility_Index_Methodology_Cboe_Volatility_Index.pdf

Wikipedia, *VIX*.

https://en.wikipedia.org/wiki/VIX

### Reference

Cboe, *White Paper: Cboe Volatility Index®*, available at:

https://cdn.cboe.com/resources/indices/Volatility_Index_Methodology_Cboe_Volatility_Index.pdf
