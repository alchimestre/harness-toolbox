function pageCount(total, size) {
  return Math.floor(total / size);
}

function pageSlice(items, page, size) {
  return items.slice((page - 1) * size, page * size);
}

module.exports = { pageCount, pageSlice };
