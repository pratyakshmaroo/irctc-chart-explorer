import { ArrowRight, Table2 } from "lucide-react";

import {
  BerthTablePagination,
  BerthTableSummary,
} from "@/components/availability/berth-table-chrome.tsx";
import { EmptyState } from "@/components/feedback/empty-state.tsx";
import { Loading } from "@/components/feedback/loading.tsx";
import { BERTH_TYPE_LABELS } from "@/lib/types.ts";
import type { BerthRow, PageSize } from "@/lib/types.ts";

interface BerthTableProps {
  rows?: readonly BerthRow[];
  total?: number;
  page?: number;
  totalPages?: number;
  pageSize?: PageSize;
  loading?: boolean;
  from?: string;
  to?: string;
  classCode?: string;
  coachName?: string | null;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: PageSize) => void;
}

/** The berth's actual continuous free window, rendered on both layouts. */
function FreeWindow({ row }: { row: BerthRow }) {
  return (
    <div className="mt-3 rounded-xl border border-signal-good/20 bg-signal-good/5 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-signal-good">
        Available From → Available To
      </p>
      <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground">From</p>
          <p className="font-mono text-sm font-bold">{row.from}</p>
          <p className="truncate text-[11px] text-muted-foreground">{row.fromName}</p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-signal-good" aria-hidden />
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground">To</p>
          <p className="font-mono text-sm font-bold">{row.to}</p>
          <p className="truncate text-[11px] text-muted-foreground">{row.toName}</p>
        </div>
      </div>
    </div>
  );
}

/** Card layout for narrow screens. */
function BerthCards({ rows }: { rows: readonly BerthRow[] }) {
  return (
    <div className="space-y-2 md:hidden">
      {rows.map((row) => (
        <article
          key={row.id}
          className="rounded-2xl border border-border bg-card p-3.5 shadow-sm"
          aria-label={`Coach ${row.coachName}, berth ${row.berthNo}, available from ${row.from} to ${row.to}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-base font-extrabold">Coach {row.coachName}</p>
              <p className="text-xs text-muted-foreground">
                Berth {row.berthNo} · {BERTH_TYPE_LABELS[row.berthType] ?? row.berthType}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-signal-good/10 px-2 py-1 text-[10px] font-semibold text-signal-good">
              Confirmed
            </span>
          </div>
          <FreeWindow row={row} />
        </article>
      ))}
    </div>
  );
}

const HEAD_CELL =
  "sticky top-0 z-10 bg-muted/90 px-3 py-2.5 font-semibold sm:px-4";
const BODY_CELL = "whitespace-nowrap px-3 py-2.5 sm:px-4";

/** Table layout for wide screens. */
function BerthGrid({
  rows,
  from,
  to,
}: {
  rows: readonly BerthRow[];
  from?: string;
  to?: string;
}) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-border bg-card md:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] text-sm" aria-label="Available berth detail">
          <caption className="sr-only">
            Confirmed available berths from {from || "the selected origin"} to{" "}
            {to || "the selected destination"}
          </caption>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className={HEAD_CELL}>Coach</th>
              <th scope="col" className={HEAD_CELL}>Berth</th>
              <th scope="col" className={HEAD_CELL}>Type</th>
              <th scope="col" className={HEAD_CELL}>Available From → Available To</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className="bg-signal-good/[0.04] transition-colors">
                <td className={`${BODY_CELL} font-mono font-medium`}>{row.coachName}</td>
                <td className={`${BODY_CELL} font-semibold tabular-nums`}>{row.berthNo}</td>
                <td className={BODY_CELL}>{BERTH_TYPE_LABELS[row.berthType] ?? row.berthType}</td>
                <td className="px-3 py-2.5 sm:px-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">From</p>
                      <p className="whitespace-nowrap font-mono text-sm font-bold">
                        {row.from}{" "}
                        <span className="font-sans text-xs font-normal text-muted-foreground">
                          {row.fromName}
                        </span>
                      </p>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-signal-good" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">To</p>
                      <p className="whitespace-nowrap font-mono text-sm font-bold">
                        {row.to}{" "}
                        <span className="font-sans text-xs font-normal text-muted-foreground">
                          {row.toName}
                        </span>
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BerthTable({
  rows = [],
  total = 0,
  page = 1,
  totalPages = 1,
  pageSize = 10,
  loading,
  from,
  to,
  classCode,
  coachName,
  onPageChange,
  onPageSizeChange,
}: BerthTableProps) {
  if (loading) {
    return <Loading label="Loading available berths…" />;
  }
  if (total === 0) {
    return (
      <EmptyState
        icon={Table2}
        compact
        title="No available berths"
        description="Only berths confirmed free for the complete selected segment appear here."
      />
    );
  }

  const typeLegend = [...new Set(rows.map((row) => row.berthType))]
    .map((code) => `${code} ${BERTH_TYPE_LABELS[code] ?? code}`)
    .join(" · ");

  return (
    <div className="space-y-3">
      <BerthTableSummary
        total={total}
        pageSize={pageSize}
        loading={loading}
        onPageSizeChange={onPageSizeChange}
      />

      <div className="rounded-xl border border-rail/20 bg-rail/5 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Requested segment</p>
          <p className="font-mono text-sm font-bold text-rail">
            {from} <span className="px-1 text-muted-foreground">→</span> {to}
          </p>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Class {classCode || "—"}
          {coachName ? ` · Coach ${coachName}` : ""}
        </p>
      </div>

      <div className="rounded-xl border border-signal-good/25 bg-signal-good/5 px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-signal-good">
          How to read Available From → Available To
        </p>
        <p className="mt-1 text-xs leading-relaxed text-foreground">
          This is the berth’s actual continuous free window. It may extend beyond
          the requested {from && to ? `${from} → ${to}` : "selected segment"}.
        </p>
      </div>

      <BerthCards rows={rows} />
      <BerthGrid rows={rows} from={from} to={to} />

      {typeLegend ? (
        <div className="rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="font-semibold uppercase tracking-wide">Berth types</span>
          <span className="ml-2">{typeLegend}</span>
        </div>
      ) : null}

      <BerthTablePagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  );
}
