from collections import defaultdict
from collections.abc import Mapping

type LabelSet = tuple[tuple[str, str], ...]
type CounterKey = tuple[str, LabelSet]

_counters: defaultdict[CounterKey, float] = defaultdict(float)


def _label_set(labels: Mapping[str, str] | None) -> LabelSet:
    if not labels:
        return ()
    return tuple(sorted(labels.items()))


def increment(name: str, amount: float = 1.0, labels: Mapping[str, str] | None = None) -> None:
    if amount < 0:
        raise ValueError("counter increments must be non-negative")
    _counters[(name, _label_set(labels))] += amount


def value(name: str, labels: Mapping[str, str] | None = None) -> float:
    return _counters.get((name, _label_set(labels)), 0.0)


def snapshot() -> dict[CounterKey, float]:
    return dict(_counters)


def reset() -> None:
    _counters.clear()
