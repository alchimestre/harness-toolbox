from dataclasses import dataclass

COST_PER_REQUEST = 1.0


@dataclass
class _Bucket:
    tokens: float
    updated_at: float


class TokenBucketLimiter:
    def __init__(self, capacity: float, refill_per_second: float) -> None:
        if capacity <= 0 or refill_per_second <= 0:
            raise ValueError("capacity and refill_per_second must be positive")
        self._capacity = capacity
        self._refill_per_second = refill_per_second
        self._buckets: dict[str, _Bucket] = {}

    def allow(self, key: str, now: float) -> bool:
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = _Bucket(tokens=self._capacity, updated_at=now)
            self._buckets[key] = bucket
        self._refill(bucket, now)
        if bucket.tokens < COST_PER_REQUEST:
            return False
        bucket.tokens -= COST_PER_REQUEST
        return True

    def _refill(self, bucket: _Bucket, now: float) -> None:
        elapsed = now - bucket.updated_at
        if elapsed <= 0:
            return
        refilled = bucket.tokens + elapsed * self._refill_per_second
        bucket.tokens = min(self._capacity, refilled)
        bucket.updated_at = now
