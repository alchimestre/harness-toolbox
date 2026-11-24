# Parcel weight

1. A parcel's shipping weight is the sum of `grams × qty` over its items, plus 50 g of packaging per parcel.
2. Every place that reports or charges by shipping weight uses `parcelWeight(items)` from `src/weight.js`. No module sums item weights itself.
3. `rawWeight` in `src/weight.js` omits packaging and must not be used for shipping weight.
4. `src/legacy/` feeds a frozen v1 export. Do not change it.
