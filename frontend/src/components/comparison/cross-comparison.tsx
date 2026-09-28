import { ArrowDown, ChevronRight, Flag } from "lucide-react";

import { ComparisonEmpty, DestinationPicker } from "@/components/comparison/destination-picker.tsx";
import { ErrorState } from "@/components/feedback/error-state.tsx";
import { Loading } from "@/components/feedback/loading.tsx";
import type { BoardingComparison, StationOption } from "@/lib/types.ts";
import { cn } from "@/lib/utils.ts";

interface CrossComparisonProps {
  destinations?: readonly StationOption[];
  destination: string;
  onDestinationChange: (value: string) => void;
  boardings?: readonly BoardingComparison[];
  loading?: boolean;
  loadingLabel?: string | null;
  disabled?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onBoardingSelect?: (stationCode: string) => void;
}

/** Best count first; ties broken by how many coaches carry a confirmed berth. */
function rankBoardings(boardings: readonly BoardingComparison[]): BoardingComparison[] {
  return boardings
    .map((boarding, index) => ({ boarding, index }))
    .sort((a, b) => {
      const byCount = b.boarding.availableCount - a.boarding.availableCount;
      if (byCount !== 0) return byCount;
      const byCoaches = b.boarding.coachesCovered - a.boarding.coachesCovered;
      if (byCoaches !== 0) return byCoaches;
      return a.index - b.index;
    })
    .map(({ boarding }) => boarding);
}

/** The destination banner plus its "best confirmed option" callout. */
function DestinationBanner({
  destination,
  destinationName,
  best,
}: {
  destination: string;
  destinationName: string | undefined;
  best: BoardingComparison | null;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-rail">
      <div className="flex items-center justify-between gap-3 bg-rail px-4 py-3">
        <span className="flex min-w-0 items-center gap-2">
          <Flag className="size-4 shrink-0 text-rail-foreground" aria-hidden />
          <span className="truncate font-mono text-lg font-extrabold tracking-wide text-rail-foreground">
            {destination}
          </span>
          {destinationName ? (
            <span className="truncate text-xs text-rail-foreground/80">{destinationName}</span>
          ) : null}
        </span>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-rail-foreground/80">
          Destination
        </span>
      </div>
      <p className="px-4 py-2 text-xs leading-relaxed text-muted-foreground">
        Ranked by confirmed berths, then by the number of coaches covered. Tap a
        result to inspect that journey in the availability section.
      </p>
      {best ? (
        <div className="mx-4 mb-3 rounded-xl border border-signal-good/25 bg-signal-good/5 px-3 py-2.5 text-xs">
          <p className="font-semibold uppercase tracking-wide text-signal-good">
            Best confirmed option
          </p>
          <p className="mt-1 text-foreground">
            Board at{" "}
            <span className="font-mono font-bold">
              {best.fromStation} · {best.fromName}
            </span>{" "}
            for {best.availableCount} confirmed berth{best.availableCount === 1 ? "" : "s"}.
          </p>
        </div>
      ) : null}
    </div>
  );
}

interface BoardingRowProps {
  boarding: BoardingComparison;
  ratio: number;
  isBest: boolean;
  rank: number;
  onSelect?: (stationCode: string) => void;
}

function BoardingRow({ boarding, ratio, isBest, rank, onSelect }: BoardingRowProps) {
  const hasAvailability = boarding.availableCount > 0;

  return (
    <li>
      <button
        type="button"
        disabled={!onSelect}
        onClick={() => onSelect?.(boarding.fromStation)}
        aria-label={`${isBest ? "Best option. " : ""}Inspect availability from ${boarding.fromStation}, ${boarding.availableCount} berths available`}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70 sm:px-4",
          isBest
            ? "border-signal-good/50 bg-signal-good/[0.05]"
            : "border-border bg-card hover:border-rail/40 hover:bg-rail/[0.03]",
        )}
      >
        <div className="flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded-lg bg-muted/60">
          <span className="font-mono text-sm font-bold leading-none">{boarding.fromStation}</span>
          <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            board
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{boarding.fromName}</p>
            {isBest ? (
              <span className="rounded-full bg-signal-good/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-signal-good">
                Best confirmed
              </span>
            ) : null}
          </div>
          <div
            className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={ratio}
            aria-label={`${boarding.availableCount} available from ${boarding.fromStation}`}
          >
            <div
              className={cn("h-full rounded-full", hasAvailability ? "bg-signal-good" : "bg-muted-foreground/30")}
              style={{ width: `${hasAvailability ? ratio : 0}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {boarding.coachesCovered} coach{boarding.coachesCovered === 1 ? "" : "es"} with
            confirmed berths
            {rank === 0 && !isBest ? " · no confirmed berths" : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              "text-xl font-extrabold tabular-nums",
              hasAvailability ? "text-signal-good" : "text-muted-foreground",
            )}
          >
            {boarding.availableCount}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            available
          </p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}

export function CrossComparison({
  destinations = [],
  destination,
  onDestinationChange,
  boardings = [],
  loading,
  loadingLabel,
  disabled,
  error = null,
  onRetry,
  onBoardingSelect,
}: CrossComparisonProps) {
  const ranked = rankBoardings(boardings);
  const best = ranked.find((boarding) => boarding.availableCount > 0) ?? null;
  const maxAvailable = Math.max(1, ...ranked.map((boarding) => boarding.availableCount));

  return (
    <div className="space-y-4">
      <DestinationPicker
        destinations={destinations}
        destination={destination}
        disabled={disabled}
        onDestinationChange={onDestinationChange}
      />

      {error ? (
        <ErrorState title="Comparison unavailable" message={error} onRetry={onRetry} className="py-8" />
      ) : loading ? (
        <Loading label={loadingLabel ?? "Comparing earlier boarding stations…"} />
      ) : ranked.length === 0 ? (
        <ComparisonEmpty destination={destination} />
      ) : (
        <div className="space-y-3">
          <DestinationBanner
            destination={destination}
            destinationName={destinations.find((station) => station.code === destination)?.name}
            best={best}
          />

          <div className="flex justify-center">
            <div className="flex h-8 w-px bg-rail/30" aria-hidden>
              <span className="mx-auto mt-auto flex size-4 -translate-y-1/2 items-center justify-center rounded-full bg-rail">
                <ArrowDown className="size-2.5 text-rail-foreground" aria-hidden />
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Earlier boarding stations, best first</h3>
              <span className="text-[11px] text-muted-foreground">
                {ranked.length} result{ranked.length === 1 ? "" : "s"}
              </span>
            </div>
            <ol className="space-y-2">
              {ranked.map((boarding, rank) => (
                <BoardingRow
                  key={boarding.fromStation}
                  boarding={boarding}
                  ratio={Math.round((boarding.availableCount / maxAvailable) * 100)}
                  isBest={boarding.fromStation === best?.fromStation}
                  rank={rank}
                  onSelect={onBoardingSelect}
                />
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
