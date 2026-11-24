const PACKAGING_GRAMS = 50;

function rawWeight(items) {
  return items.reduce((sum, item) => sum + item.grams * item.qty, 0);
}

function parcelWeight(items) {
  return rawWeight(items);
}

module.exports = { rawWeight, parcelWeight, PACKAGING_GRAMS };
