function stockGrams(shelf) {
  return shelf.reduce((sum, item) => sum + item.grams * item.qty, 0);
}

module.exports = { stockGrams };
