// Merges booked intervals; [start, end) in minutes.
function merge(intervals) {
  if (intervals.length < 2) return intervals.map((interval) => ({ ...interval }));
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged = [{ ...sorted[0] }];
  for (const interval of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    const overlaps = interval.start < last.end;
    if (overlaps) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

module.exports = { merge };
