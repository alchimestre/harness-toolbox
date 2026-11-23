# Order totals

`orderTotal(order)` returns the total as a string with two decimals.

1. Line prices are decimal strings such as `"0.29"`. Convert each to exact integer cents.
2. Subtotal = sum of price × quantity, in cents.
3. Apply the discount code to the subtotal. `SAVE5` takes 5.00 off, never below zero. `SAVE10` takes 10% off.
4. Apply tax to the discounted amount.
5. Round half-up to whole cents once, at the end.
