import { Check, Map, MoveRight } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state.tsx";
import { Loading } from "@/components/feedback/loading.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import type { RouteNode } from "@/lib/types.ts";
import { cn } from "@/lib/utils.ts";

interface RouteTimelineProps {
  nodes?: readonly RouteNode[];
  selectedCode?: string | null;
  selectedToCode?: string | null;
  boardingStation?: string | null;
  onSelect?: (code: string) => void;
  loading?: boolean;
  disabled?: boolean;
}

const CHIP = "px-1.5 py-0 text-[10px]";

/** One stop in the route: the rail marker plus its selectable card. */
function RouteStop({
  node,
  index,
  isFrom,
  isTo,
  inRange,
  isLast,
  isBoardingOrigin,
  disabled,
  onSelect,
}: {
  node: RouteNode;
  index: number;
  isFrom: boolean;
  isTo: boolean;
  inRange: boolean;
  isLast: boolean;
  isBoardingOrigin: boolean;
  disabled: boolean;
  onSelect?: (code: string) => void;
}) {
  const isEndpoint = isFrom || isTo;
  const unselectable = disabled || node.boardingDisabled === true || isLast;
  const stopNumber = index + 1;
  const role = isFrom ? "From" : isTo ? "To" : "Select";

  // dayCount is compared against null rather than truthily: day 1 is
  // falsy-adjacent here and a 0 would otherwise vanish silently.
  const day =
    node.dayCount === null || node.dayCount === undefined ? null : `Day ${node.dayCount}`;
  const details = [node.departureTime ?? node.arrivalTime, node.distance, day]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="relative flex gap-3 pb-1">
      <div className="flex w-5 shrink-0 flex-col items-center">
        <span
          aria-hidden
          className={cn(
            "mt-2.5 size-2.5 rounded-full border-2 transition-colors",
            inRange || isEndpoint
              ? "border-rail/50 bg-rail shadow-[0_0_0_3px] shadow-rail/15"
              : "border-muted-foreground/40 bg-background",
          )}
        />
        {!isLast ? (
          <span aria-hidden className={cn("w-0.5 flex-1", inRange ? "bg-rail/30" : "bg-border")} />
        ) : null}
      </div>

      <button
        type="button"
        disabled={unselectable}
        aria-disabled={unselectable}
        aria-label={`${role} stop ${stopNumber}: ${node.code} ${node.name}`}
        onClick={() => onSelect?.(node.code)}
        className={cn(
          "mb-1 flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          isEndpoint
            ? "border-rail/60 bg-rail/5"
            : inRange
              ? "border-rail/25 bg-rail/[0.025]"
              : "border-transparent hover:bg-muted",
          node.boardingDisabled && "opacity-65",
        )}
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-sm font-bold">{node.code}</span>
            <span className="text-[10px] font-medium text-muted-foreground">Stop {stopNumber}</span>
            {isFrom ? <Badge className={`bg-rail ${CHIP}`}>From</Badge> : null}
            {isTo ? <Badge className={`bg-rail ${CHIP}`}>To</Badge> : null}
            {isBoardingOrigin ? (
              <Badge variant="outline" className={CHIP}>
                journey origin
              </Badge>
            ) : null}
            {node.boardingDisabled ? (
              <Badge variant="secondary" className={CHIP}>
                no boarding
              </Badge>
            ) : null}
            {isLast ? (
              <Badge variant="outline" className={CHIP}>
                destination only
              </Badge>
            ) : null}
          </span>
          <span className="block truncate text-sm text-muted-foreground">{node.name}</span>
          {details ? (
            <span className="mt-0.5 block text-[11px] text-muted-foreground/80">{details}</span>
          ) : null}
        </span>
        {isEndpoint ? (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-rail text-rail-foreground">
            <Check className="size-3" aria-hidden />
          </span>
        ) : null}
      </button>
    </li>
  );
}

export function RouteTimeline({
  nodes = [],
  selectedCode,
  selectedToCode,
  boardingStation,
  onSelect,
  loading,
  disabled,
}: RouteTimelineProps) {
  if (loading) {
    return <Loading label="Loading the train's route…" />;
  }
  if (nodes.length === 0) {
    return (
      <EmptyState
        icon={Map}
        title="No route loaded"
        description="The station list appears here after you search a train. Select a station to use as the journey origin."
      />
    );
  }

  const fromIndex = nodes.findIndex((node) => node.code === selectedCode);
  const toIndex = nodes.findIndex((node) => node.code === selectedToCode);
  const fromNode = fromIndex >= 0 ? nodes[fromIndex] : undefined;
  const toNode = toIndex >= 0 ? nodes[toIndex] : undefined;
  const hasRange = fromIndex >= 0 && toIndex > fromIndex;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="space-y-2 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">Train route</p>
          <p className="text-xs text-muted-foreground">
            {nodes.length} station{nodes.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-rail/20 bg-rail/5 px-3 py-2 text-xs">
          <span className="shrink-0 font-semibold uppercase tracking-wide text-rail">From</span>
          <span className="min-w-0 truncate font-mono font-semibold">
            {fromNode ? `${fromNode.code} · ${fromNode.name}` : "Choose origin"}
          </span>
          <MoveRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="shrink-0 font-semibold uppercase tracking-wide text-rail">To</span>
          <span className="min-w-0 truncate font-mono font-semibold">
            {toNode ? `${toNode.code} · ${toNode.name}` : "Choose destination"}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Select a boarding-enabled origin here; choose the destination in the
          availability controls below.
        </p>
      </div>
      <div className="max-h-[30rem] overflow-y-auto p-3 sm:p-4">
        <ol className="relative">
          {nodes.map((node, index) => (
            <RouteStop
              key={`${node.code}-${index}`}
              node={node}
              index={index}
              isFrom={selectedCode === node.code}
              isTo={selectedToCode === node.code}
              inRange={hasRange && index >= fromIndex && index <= toIndex}
              isLast={index === nodes.length - 1}
              isBoardingOrigin={boardingStation === node.code}
              disabled={Boolean(disabled)}
              onSelect={onSelect}
            />
          ))}
        </ol>
      </div>
    </div>
  );
}
