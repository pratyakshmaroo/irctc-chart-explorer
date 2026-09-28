import { PaginationBar } from "@/components/availability/pagination-bar.tsx";
import { RowsPerPageSelect } from "@/components/availability/rows-per-page-select.tsx";
import type { PageSize } from "@/lib/types.ts";

/** "N available berths" plus the page-size control. */
export function BerthTableSummary({
  total,
  pageSize,
  loading,
  onPageSizeChange,
}: {
  total: number;
  pageSize: PageSize;
  loading?: boolean;
  onPageSizeChange?: (size: PageSize) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold tabular-nums text-foreground">{total}</span>{" "}
        available berth{total === 1 ? "" : "s"}
      </p>
      <RowsPerPageSelect
        value={pageSize}
        onChange={onPageSizeChange ?? (() => undefined)}
        disabled={loading}
      />
    </div>
  );
}

export function BerthTablePagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange?: (page: number) => void;
}) {
  return (
    <PaginationBar
      page={page}
      totalPages={totalPages}
      onPageChange={onPageChange ?? (() => undefined)}
    />
  );
}
