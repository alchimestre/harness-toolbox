export const PRIORITY = Object.freeze({ high: 0, normal: 1, low: 2 });

export function comparePriority(left, right) {
  return (PRIORITY[left.priority] ?? PRIORITY.normal) - (PRIORITY[right.priority] ?? PRIORITY.normal);
}

export function sortByPriority(entries) {
  return [...entries].sort(comparePriority);
}

export function nextBatch(entries, size) {
  return sortByPriority(entries).slice(0, size);
}
