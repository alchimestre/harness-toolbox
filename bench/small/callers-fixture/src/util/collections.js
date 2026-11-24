function sumBy(list, pick) {
  return list.reduce((sum, value) => sum + pick(value), 0);
}

module.exports = { sumBy };
