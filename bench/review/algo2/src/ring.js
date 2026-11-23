class Ring {
  constructor(size) {
    this.items = new Array(size);
    this.size = size;
    this.head = 0;
    this.count = 0;
  }

  get full() {
    return this.count === this.size;
  }

  push(item) {
    this.items[(this.head + this.count) % this.size] = item;
    if (this.full) this.head = (this.head + 1) % this.size;
    else this.count += 1;
  }

  shift() {
    if (this.count === 0) return undefined;
    const item = this.items[this.head];
    this.items[this.head] = undefined;
    this.head = (this.head + 1) % this.size;
    return item;
  }
}

module.exports = { Ring };
