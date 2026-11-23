# Money rules

1. Prices, rates and balances are decimal strings with two decimals, such as `"0.29"`. Every conversion of such a string to integer cents must be exact: `"0.29"` is 29 cents.
2. Percentages shown to users are floored: 99.9% shows as `99%`.
3. `src/legacy/` feeds a frozen report format. Do not modify it.
