function progressPercent(done, total) {
  return Math.floor((done * 100) / total);
}

module.exports = { progressPercent };
