export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number] | "All";

export interface Paginated<T> {
  items: T[];
  page: number;
  size: PageSize;
  total: number;
  totalPages: number;
}

export function isValidPageSize(size: unknown): size is PageSize {
  return size === "All" || (typeof size === "number" && (PAGE_SIZES as readonly number[]).includes(size));
}

export function paginate<T>(rows: readonly T[], page = 1, size: PageSize = 25): Paginated<T> {
  if (!isValidPageSize(size)) {
    throw new Error(`invalid page size ${String(size)} (expected 10, 25, 50, 100 or "All")`);
  }
  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`invalid page ${page} (expected an integer >= 1)`);
  }
  const total = rows.length;
  if (size === "All") {
    return { items: [...rows], page: 1, size, total, totalPages: 1 };
  }
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * size;
  const items = rows.slice(start, start + size);
  return { items, page: safePage, size, total, totalPages };
}