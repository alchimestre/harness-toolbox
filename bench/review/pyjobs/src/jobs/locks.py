from dataclasses import dataclass


@dataclass(frozen=True)
class _Lease:
    owner: str
    expires_at: float


class LeaseTable:
    def __init__(self) -> None:
        self._leases: dict[str, _Lease] = {}

    def acquire(self, name: str, owner: str, now: float, ttl_seconds: float) -> bool:
        if ttl_seconds <= 0:
            raise ValueError("ttl_seconds must be positive")
        if self.holder(name, now) not in (None, owner):
            return False
        self._leases[name] = _Lease(owner=owner, expires_at=now + ttl_seconds)
        return True

    def release(self, name: str, owner: str) -> bool:
        lease = self._leases.get(name)
        if lease is None or lease.owner != owner:
            return False
        del self._leases[name]
        return True

    def holder(self, name: str, now: float) -> str | None:
        lease = self._leases.get(name)
        if lease is None or lease.expires_at <= now:
            return None
        return lease.owner
