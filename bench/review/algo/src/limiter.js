const MS_PER_SECOND = 1000;

class TokenBucket {
  constructor(capacity, refillPerSecond, now = Date.now) {
    this.capacity = capacity;
    this.refillPerMs = refillPerSecond / MS_PER_SECOND;
    this.tokens = capacity;
    this.now = now;
    this.last = now();
  }

  refill() {
    const current = this.now();
    const elapsedSeconds = (current - this.last) / MS_PER_SECOND;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerMs);
    this.last = current;
  }

  take() {
    this.refill();
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

module.exports = { TokenBucket };
