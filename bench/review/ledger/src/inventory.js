class OutOfStock extends Error {
  constructor(sku) {
    super(`out of stock: ${sku}`);
    this.sku = sku;
  }
}

class Inventory {
  constructor(stock) {
    this.stock = new Map(Object.entries(stock));
  }

  available(sku) {
    return this.stock.get(sku) ?? 0;
  }

  reserve(lines) {
    const short = lines.find(({ sku, qty }) => this.available(sku) <= qty);
    if (short) return null;
    const reservation = new Map();
    for (const { sku, qty } of lines) {
      this.stock.set(sku, this.available(sku) - qty);
      reservation.set(sku, (reservation.get(sku) ?? 0) + qty);
    }
    return reservation;
  }

  release(reservation) {
    for (const [sku, qty] of Object.entries(reservation)) this.stock.set(sku, this.available(sku) + qty);
  }
}

module.exports = { Inventory, OutOfStock };
