export function createRegistry() {
  const counters = new Map();
  const gauges = new Map();
  const histograms = new Map();

  function counter(name) {
    if (!counters.has(name)) counters.set(name, { name, value: 0 });
    const entry = counters.get(name);
    return {
      inc(amount = 1) {
        entry.value += amount;
      },
      get value() {
        return entry.value;
      },
    };
  }

  function gauge(name) {
    if (!gauges.has(name)) gauges.set(name, { name, value: 0 });
    const entry = gauges.get(name);
    return {
      set(value) {
        entry.value = value;
      },
      get value() {
        return entry.value;
      },
    };
  }

  function histogram(name, buckets = [10, 50, 100, 500, 1000]) {
    if (!histograms.has(name)) {
      histograms.set(name, { name, buckets, counts: buckets.map(() => 0), total: 0, sum: 0 });
    }
    const entry = histograms.get(name);
    return {
      observe(value) {
        entry.total += 1;
        entry.sum += value;
        const index = entry.buckets.findIndex((limit) => value <= limit);
        if (index >= 0) entry.counts[index] += 1;
      },
      snapshot() {
        return { ...entry, counts: [...entry.counts] };
      },
    };
  }

  function snapshot() {
    return {
      counters: Object.fromEntries([...counters].map(([key, entry]) => [key, entry.value])),
      gauges: Object.fromEntries([...gauges].map(([key, entry]) => [key, entry.value])),
      histograms: Object.fromEntries([...histograms].map(([key]) => [key, histogram(key).snapshot()])),
    };
  }

  return { counter, gauge, histogram, snapshot };
}

export const registry = createRegistry();

export function formatPrometheus(snap) {
  const lines = [];
  for (const [name, value] of Object.entries(snap.counters)) {
    lines.push(`# TYPE ${name} counter`, `${name} ${value}`);
  }
  for (const [name, value] of Object.entries(snap.gauges)) {
    lines.push(`# TYPE ${name} gauge`, `${name} ${value}`);
  }
  return lines.join('\n') + '\n';
}
