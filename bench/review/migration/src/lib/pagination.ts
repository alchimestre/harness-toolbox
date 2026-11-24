export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export function parsePageRequest(query: Record<string, string | undefined>): PageRequest {
  const page = clampInteger(query.page, 1, Number.MAX_SAFE_INTEGER, 1);
  const pageSize = clampInteger(query.pageSize, 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  return { page, pageSize };
}

export function offsetFor(request: PageRequest): number {
  return (request.page - 1) * request.pageSize;
}

export function buildPage<T>(rows: T[], request: PageRequest): Page<T> {
  const hasMore = rows.length > request.pageSize;
  const items = hasMore ? rows.slice(0, request.pageSize) : rows;
  return { items, page: request.page, pageSize: request.pageSize, hasMore };
}

function clampInteger(raw: string | undefined, low: number, high: number, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(high, Math.max(low, parsed));
}
