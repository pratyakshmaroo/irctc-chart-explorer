import type { ReactNode } from "react";
import { Armchair } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state.tsx";
import { Loading } from "@/components/feedback/loading.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import type { CoachSummary } from "@/lib/types.ts";
import { cn } from "@/lib/utils.ts";

interface CoachListProps {
  coaches?: readonly CoachSummary[];
  loading?: boolean;
  progressLabel?: string | null;
  className?: string;
  classCode?: string | null;
  totalAvailable?: number;
  selectedCoachKey?: string | null;
  onCoachChange?: (coachKey: string | null) => void;
}

/**
 * One tappable coach tile. The "All coaches" overview tile uses the same shape as
 * the per-coach tiles so the grid stays visually uniform.
 */
function CoachCard({
  pressed,
  disabled,
  ariaLabel,
  title,
  badge,
  count,
  hint,
  onSelect,
}: {
  pressed: boolean;
  disabled: boolean;
  ariaLabel: string;
  title: ReactNode;
  badge: ReactNode;
  count: number;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex min-h-32 flex-col justify-between gap-4 rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70",
        pressed
          ? "border-rail/70 bg-rail/5 ring-1 ring-rail/20"
          : "border-border hover:border-rail/40 hover:bg-rail/[0.03]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-extrabold tracking-tight">{title}</span>
        {badge}
      </div>
      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-extrabold tabular-nums text-signal-good">{count}</span>
          <span className="text-xs text-muted-foreground">available</span>
        </div>
        <p className="mt-1 text-[11px] font-medium text-signal-good">{hint}</p>
      </div>
    </button>
  );
}

export function CoachList({
  coaches = [],
  loading,
  progressLabel,
  className,
  classCode,
  totalAvailable,
  selectedCoachKey = null,
  onCoachChange,
}: CoachListProps) {
  if (loading) {
    return <Loading label={progressLabel ?? "Loading available coaches…"} />;
  }

  const availableCoaches = coaches.filter((coach) => coach.available > 0);
  if (availableCoaches.length === 0) {
    return (
      <EmptyState
        icon={Armchair}
        compact
        title="No coaches with free berths"
        description="Only coaches with a confirmed free berth for the complete selected segment appear here."
      />
    );
  }

  const allCount = availableCoaches.reduce((sum, coach) => sum + coach.available, 0);
  const count = totalAvailable ?? allCount;
  const interactive = onCoachChange !== undefined;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">{count}</span>{" "}
          available berth{count === 1 ? "" : "s"}
          {selectedCoachKey ? " in the selected coach" : " across coaches"}
        </p>
        {classCode ? <Badge variant="outline">Class {classCode}</Badge> : null}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Choose a coach to drill into its confirmed berths. The berth table below
        follows this filter until you return to all coaches.
      </p>

      {selectedCoachKey ? (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => onCoachChange?.(null)}>
            Show all coaches
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <CoachCard
          pressed={selectedCoachKey === null}
          disabled={!interactive}
          ariaLabel={`Show all coaches, ${allCount} berths available`}
          title="All coaches"
          badge={<Badge variant="secondary">Overview</Badge>}
          count={allCount}
          hint={selectedCoachKey ? "Return to overview" : "Showing all coaches"}
          onSelect={() => onCoachChange?.(null)}
        />

        {availableCoaches.map((coach) => {
          const selected = selectedCoachKey === coach.coachKey;
          return (
            <CoachCard
              key={coach.coachKey}
              pressed={selected}
              disabled={!interactive}
              ariaLabel={`${selected ? "Clear filter for" : "Filter by"} coach ${coach.coachName}, ${coach.available} berths available`}
              title={<span className="font-mono text-lg">{coach.coachName}</span>}
              badge={<Badge variant="secondary" className="font-mono">{coach.classCode}</Badge>}
              count={coach.available}
              hint={`Tap to ${selected ? "clear" : "view"} this coach`}
              onSelect={() => onCoachChange?.(selected ? null : coach.coachKey)}
            />
          );
        })}
      </div>
    </div>
  );
}
