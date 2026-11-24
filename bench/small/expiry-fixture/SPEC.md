# Session expiry

1. Every stored expiry is milliseconds since epoch and is computed with `expiresAt(ttlSeconds)` from `src/time.js`.
2. Only `src/time.js` reads the clock for an expiry. No other module computes one from `Date.now()`, `new Date()` or `nowSeconds()`.
3. `nowSeconds()` in `src/time.js` is for metrics records only. Metrics records keep `at` in seconds since epoch; they are not expiries.
4. `src/legacy/` feeds a frozen v1 export. Do not change it.
