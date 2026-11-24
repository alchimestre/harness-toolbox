export function backoffFor(baseMs, attempt) {
  return baseMs * 2 ** (attempt - 1);
}
