function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-lg font-extrabold tabular-nums text-foreground">
        {value}
      </p>
      {hint ? <p className="truncate text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

interface SummaryStatsProps {
  from: string;
  to: string;
  classCode: string;
  berthCount: string | number;
  /** Extra context for the berth count, e.g. that a coach filter is applied. */
  berthHint?: string;
  coachCount: string | number;
}

/** The five-up strip describing the current segment and its headline counts. */
export function SummaryStats({
  from,
  to,
  classCode,
  berthCount,
  berthHint,
  coachCount,
}: SummaryStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      <StatCard label="From" value={from || "—"} />
      <StatCard label="To" value={to || "—"} />
      <StatCard label="Class" value={classCode || "—"} />
      <StatCard label="Available berths" value={berthCount} hint={berthHint} />
      <StatCard label="Available coaches" value={coachCount} />
    </div>
  );
}
