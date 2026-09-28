import { TrainFront } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state.tsx";
import { Loading } from "@/components/feedback/loading.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { formatJourneyDate } from "@/lib/dates.ts";
import type { ChartStatus, JourneySummary } from "@/lib/types.ts";
import { cn } from "@/lib/utils.ts";

interface TrainInfoProps {
  journey?: JourneySummary | null;
  loading?: boolean;
}

/** One definition of each chart status: colour, wording and explanation. */
const CHART_STATUS = {
  prepared: {
    dot: "bg-signal-good",
    text: "text-signal-good",
    label: "Prepared",
    title: "Chart prepared",
    description: "The chart is loaded and ready for berth checks.",
  },
  pending: {
    dot: "bg-signal-warn",
    text: "text-signal-warn",
    label: "Not prepared",
    title: "Chart not prepared",
    description:
      "Availability may be incomplete while the chart is still being prepared. Retry later if results look incomplete.",
  },
  unknown: {
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    label: "Unknown",
    title: "Chart status unknown",
    description:
      "No readiness flag is available. Treat results as incomplete until the chart is confirmed prepared.",
  },
} as const satisfies Record<ChartStatus, Record<string, string>>;

function ChartStatusBadge({ status }: { status: ChartStatus }) {
  if (status === "prepared") {
    return (
      <Badge className="bg-signal-good text-signal-good-foreground">
        Chart prepared
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge className="bg-signal-warn text-signal-warn-foreground">
        Chart not prepared
      </Badge>
    );
  }
  return <Badge variant="outline">Chart status unknown</Badge>;
}

function ChartStatusNotice({ status }: { status: ChartStatus }) {
  const copy = CHART_STATUS[status];

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className={cn("size-2 rounded-full", copy.dot)} aria-hidden />
        <p className={cn("text-xs font-semibold", copy.text)}>{copy.title}</p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.description}</p>
    </div>
  );
}

function InfoCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card px-4 py-3 sm:px-5">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums">{children}</dd>
    </div>
  );
}

export function TrainInfo({ journey, loading }: TrainInfoProps) {
  if (loading) {
    return <Loading label="Loading train details…" />;
  }
  if (!journey) {
    return (
      <EmptyState
        icon={TrainFront}
        title="No train loaded"
        description="The journey and chart summary appear here after you search a train."
      />
    );
  }

  return (
    <div className="space-y-2">
      <ChartStatusNotice status={journey.chartStatus} />
      <dl className="overflow-hidden rounded-2xl border border-border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-rail/5 px-4 py-4 sm:px-5">
          <div className="space-y-0.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rail">
              Train
            </p>
            <p className="font-mono text-2xl font-extrabold tracking-wide">
              {journey.trainNo}
            </p>
            <p className="text-sm font-medium text-muted-foreground">
              {journey.trainName ?? "Name unavailable"}
            </p>
          </div>
          <ChartStatusBadge status={journey.chartStatus} />
        </div>
        <div className="grid grid-cols-2 bg-border">
          <InfoCell label="Journey date">
            {formatJourneyDate(journey.journeyDate)}
          </InfoCell>
          <InfoCell label="Boarding">
            <span className="font-mono font-medium">
              {journey.boardingStation ?? "—"}
            </span>
          </InfoCell>
          <InfoCell label="Charting station">
            <span className="font-mono font-medium">
              {journey.chartingStation ?? "—"}
            </span>
          </InfoCell>
          <InfoCell label="Chart status">
            <span
              className={cn(
                "inline-flex items-center gap-1.5",
                CHART_STATUS[journey.chartStatus].text,
              )}
            >
              <span
                className={cn("size-1.5 rounded-full", CHART_STATUS[journey.chartStatus].dot)}
                aria-hidden
              />
              {CHART_STATUS[journey.chartStatus].label}
            </span>
          </InfoCell>
        </div>
      </dl>
    </div>
  );
}
