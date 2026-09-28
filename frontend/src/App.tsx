import { useMemo, useRef, useState } from "react";
import { Armchair, Route, Scale, Search, Table2, TrainFront, Waypoints } from "lucide-react";

import { AppFooter, AppHeader } from "@/components/app/app-shell.tsx";
import { SummaryStats } from "@/components/app/summary-stats.tsx";
import { AvailabilitySearch } from "@/components/availability/availability-search.tsx";
import { BerthTable } from "@/components/availability/berth-table.tsx";
import { CoachList } from "@/components/availability/coach-list.tsx";
import { CrossComparison } from "@/components/comparison/cross-comparison.tsx";
import { ErrorState } from "@/components/feedback/error-state.tsx";
import { RequestLog } from "@/components/feedback/request-log.tsx";
import { RouteTimeline } from "@/components/route/route-timeline.tsx";
import {
  SearchScreen,
  type SearchFields,
  type SearchResult,
} from "@/components/search/search-screen.tsx";
import { TrainInfo } from "@/components/train/train-info.tsx";
import { Section } from "@/components/ui/section.tsx";
import { useAvailability } from "@/hooks/use-availability.ts";
import { useCross } from "@/hooks/use-cross.ts";
import {
  destinationAfter,
  selectBoardingStations,
  selectDestinations,
  stationIndex,
  toBerthRows,
  toBoardings,
  toCoachSummaries,
  toRouteNodes,
} from "@/lib/adapters.ts";
import { createSession, getRoute, isAbortError } from "@/lib/api.ts";
import type { ApiStation, SessionResult } from "@/lib/api.ts";
import { describeError } from "@/lib/errors.ts";
import type { JourneySummary, SegmentSelection, StationOption } from "@/lib/types.ts";

interface RouteData {
  trainNo: string;
  trainName: string | null;
  stations: ApiStation[];
}

type SessionData = {
  key: string;
  journey: SessionResult["journey"];
  classes: string[];
  defaultClass: string | undefined;
  chartPrepared: boolean;
};

export function App() {
  const [searched, setSearched] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastSearch, setLastSearch] = useState<SearchResult>();

  const [route, setRoute] = useState<RouteData | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const searchRequestRef = useRef<AbortController | null>(null);

  // A chart session can expire server-side; both queries report it the same way
  // and it is handled in one place. Hoisted, so the hooks below can pass it
  // before the consts it touches are assigned — it is only ever called later.
  function handleSessionExpired() {
    setSession(null);
    setSearched(false);
    setSearchError("This chart session is no longer loaded. Search the train again.");
    availability.reset();
    cross.reset();
  }

  const availability = useAvailability({
    sessionKey: session?.key,
    onSessionExpired: handleSessionExpired,
  });
  const { segment, coach, result, ready: availabilityReady } = availability;
  const crossClass = segment?.cls || session?.defaultClass || "";
  const cross = useCross({
    sessionKey: session?.key,
    classCode: crossClass,
    onSessionExpired: handleSessionExpired,
  });

  /** One function object for the whole route list, shared by every consumer. */
  const routeStations = useMemo<StationOption[]>(
    () => toRouteNodes(route?.stations ?? []),
    [route?.stations],
  );
  const boardingOptions = useMemo(
    () => selectBoardingStations(routeStations),
    [routeStations],
  );
  const coachSummaries = useMemo(() => toCoachSummaries(result), [result]);
  const berthRows = useMemo(
    () => toBerthRows(result, routeStations),
    [result, routeStations],
  );
  const boardings = useMemo(() => toBoardings(cross.result, routeStations), [
    cross.result,
    routeStations,
  ]);
  const crossDestinations = useMemo(
    () => selectDestinations(routeStations, segment?.from ?? ""),
    [routeStations, segment?.from],
  );

  function teardownSearch() {
    setSession(null);
    setSearched(false);
    availability.reset();
    cross.reset();
  }

  /**
   * Editing the search must not leave a chart open for the old journey. A
   * different train or date invalidates the route too; changing only the
   * boarding station keeps it, so the picker stays usable.
   */
  function handleFieldsChange(fields: SearchFields) {
    setSearchError(null);
    if (!lastSearch) return;

    const sameJourney =
      lastSearch.trainNo === fields.trainNo &&
      lastSearch.journeyDate === fields.journeyDate;
    if (!sameJourney) setRoute(null);
    if (sameJourney && lastSearch.boardingStation === fields.boardingStation) return;

    teardownSearch();
  }

  async function handleSearch(next: SearchResult) {
    searchRequestRef.current?.abort();
    const controller = new AbortController();
    searchRequestRef.current = controller;

    // Re-searching the same train and date keeps the route on screen instead of
    // flashing the empty state while the session re-opens.
    const sameRoute =
      route !== null &&
      route.trainNo === next.trainNo &&
      lastSearch?.journeyDate === next.journeyDate;

    setSearchError(null);
    setLastSearch(next);
    setSearched(false);
    setSession(null);
    availability.reset();
    cross.reset();
    if (!sameRoute || !next.boardingStation) setRoute(null);
    setSearchLoading(true);

    try {
      if (next.boardingStation) {
        const res = await createSession(
          { trainNo: next.trainNo, journeyDate: next.journeyDate, boardingStation: next.boardingStation },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setSession({
          key: res.key,
          journey: res.journey,
          classes: res.classes,
          defaultClass: res.defaultClass,
          chartPrepared: res.chartPrepared,
        });
        setRoute({
          trainNo: res.journey.trainNo,
          trainName: res.journey.trainName,
          stations: res.journey.stations,
        });
        availability.patch({
          segment: {
            from: res.journey.boardingStation ?? "",
            to: "",
            cls: res.defaultClass ?? res.classes[0] ?? "",
          },
        });
        setSearched(true);
        return;
      }

      const res = await getRoute(next.trainNo, controller.signal);
      if (controller.signal.aborted) return;
      setRoute({ trainNo: res.trainNo, trainName: res.trainName, stations: res.stations });
      setSearched(true);
    } catch (cause) {
      if (!controller.signal.aborted && !isAbortError(cause)) {
        setSearchError(describeError(cause));
      }
    } finally {
      if (searchRequestRef.current === controller) {
        searchRequestRef.current = null;
        setSearchLoading(false);
      }
    }
  }

  function handleFromChange(value: string) {
    const fromIdx = stationIndex(routeStations, value);
    const station = routeStations[fromIdx];
    if (!station || station.boardingDisabled || fromIdx >= routeStations.length - 1) return;
    applySegmentChange({ from: value, to: destinationAfter(routeStations, value, segment?.to ?? "") });
  }

  function handleToChange(value: string) {
    const fromIdx = stationIndex(routeStations, segment?.from ?? "");
    const toIdx = stationIndex(routeStations, value);
    if (fromIdx < 0 || toIdx <= fromIdx) return;
    applySegmentChange({ to: value });
  }

  function handleCrossBoardingSelect(value: string) {
    const fromIdx = stationIndex(routeStations, value);
    const toIdx = stationIndex(routeStations, cross.destination);
    if (fromIdx < 0 || toIdx <= fromIdx || routeStations[fromIdx]?.boardingDisabled) return;
    applySegmentChange({ from: value, to: cross.destination });
  }

  /**
   * A new segment makes the previous comparison meaningless, so the cross
   * destination follows the segment. A coach filter only narrows the berth
   * table, so the comparison is cleared instead.
   */
  function applySegmentChange(patch: Partial<SegmentSelection>) {
    availability.patch({ segment: patch });
    cross.setDestination(patch.to ?? segment?.to ?? "");
  }

  function handleCoachChange(value: string | null) {
    availability.patch({ coach: value });
    cross.setDestination("");
  }

  const trainSummary: JourneySummary | null = session
    ? {
        trainNo: session.journey.trainNo,
        trainName: session.journey.trainName,
        journeyDate: session.journey.journeyDate,
        boardingStation: session.journey.boardingStation,
        chartStatus: session.chartPrepared ? "prepared" : "pending",
        chartingStation: session.journey.chart.destinationStation,
      }
    : route
      ? {
          trainNo: route.trainNo,
          trainName: route.trainName,
          journeyDate: lastSearch?.journeyDate ?? "",
          boardingStation: null,
          chartStatus: "unknown",
          chartingStation: null,
        }
      : null;

  const visibleCoaches = coach
    ? coachSummaries.filter((entry) => entry.coachKey === coach)
    : coachSummaries;
  const selectedCoachName = coach
    ? coachSummaries.find((entry) => entry.coachKey === coach)?.coachName
    : null;
  // The berth count respects the coach filter, so say so rather than letting the
  // two adjacent stats silently describe different populations.
  const berthHint = coach && result ? `in coach ${coach.split(":")[1] ?? coach}` : undefined;
  const resultsReady = availabilityReady && !availability.error;
  const coachProgress = availability.progress;
  const coachProgressLabel =
    availability.loading && coachProgress && coachProgress.total > 0
      ? `Loading coaches ${Math.min(coachProgress.done + 1, coachProgress.total)} of ${coachProgress.total}…`
      : null;
  const crossProgress = cross.progress;
  const crossProgressLabel =
    cross.loading && crossProgress && crossProgress.total > 0
      ? `Loading coaches ${Math.min(crossProgress.done + 1, crossProgress.total)} of ${crossProgress.total}…`
      : null;
  const skippedCoaches = result?.warnings ?? [];

  /** "—" while the section is not queryable or has failed, "…" while in flight. */
  function countStat(value: string | number | null | undefined): string | number {
    if (!availabilityReady) return "—";
    if (availability.loading) return "…";
    if (availability.error) return "—";
    return value ?? 0;
  }

  return (
    <div className="app-surface mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-8 px-4 py-6 sm:gap-10 sm:px-6 sm:py-10">
      <AppHeader />

      <div className="-mb-6 space-y-2 sm:-mb-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-rail sm:text-xs">
          Live chart · seat check
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Look up a train journey and inspect its prepared chart, free berths
          and the best boarding point for your seat.
        </p>
      </div>

      <Section step={1} icon={Search} title="Search train">
        <SearchScreen
          boardingOptions={boardingOptions}
          routeLoaded={route !== null}
          boardingLoading={searchLoading && route === null}
          loading={searchLoading}
          searched={searched}
          error={searchError}
          onSearch={handleSearch}
          onFieldsChange={handleFieldsChange}
        />
      </Section>

      {searched && route ? (
        <>
          <Section
            step={2}
            title="Train"
            description="Journey and chart summary for the searched train."
            icon={TrainFront}
          >
            <TrainInfo journey={trainSummary} loading={searchLoading && !trainSummary} />
          </Section>

          <Section
            step={3}
            title="Route"
            description="See the route, journey origin, and selected From → To range."
            icon={Route}
          >
            <RouteTimeline
              nodes={routeStations}
              selectedCode={segment?.from}
              selectedToCode={segment?.to}
              boardingStation={session?.journey.boardingStation}
              onSelect={handleFromChange}
              loading={searchLoading && route === null}
              disabled={searchLoading}
            />
          </Section>

          <Section
            step={4}
            title="Availability"
            description="Choose a forward segment and class, then inspect confirmed berths."
            icon={Waypoints}
            className="rounded-3xl border border-rail/20 bg-rail/[0.025] p-4 sm:p-6"
          >
            <AvailabilitySearch
              stations={routeStations}
              from={segment?.from ?? ""}
              onFromChange={handleFromChange}
              to={segment?.to ?? ""}
              onToChange={handleToChange}
              classes={session?.classes ?? []}
              classCode={segment?.cls ?? ""}
              onClassChange={(cls) => applySegmentChange({ cls })}
              disabled={session === null}
            />

            <SummaryStats
              from={segment?.from ?? ""}
              to={segment?.to ?? ""}
              classCode={segment?.cls ?? ""}
              berthCount={countStat(
                result && availabilityReady
                  ? `${result.availableCount} of ${result.totalBerths}`
                  : null,
              )}
              berthHint={berthHint}
              coachCount={countStat(coach ? visibleCoaches.length : coachSummaries.length)}
            />

            {availability.error ? (
              <ErrorState
                title="Availability query failed"
                message={describeError(availability.error)}
                onRetry={availability.retry}
                className="py-8"
              />
            ) : null}
            {!availabilityReady && !availability.error ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                {session
                  ? "Choose a destination segment and class to see confirmed availability."
                  : "Open a chart with a boarding station to enable availability."}
              </p>
            ) : null}

            <RequestLog />
          </Section>

          {resultsReady ? (
            <>
              <Section
                step={5}
                title="Coaches"
                description="Tap a coach to filter the berth table to that coach."
                icon={Armchair}
              >
                <CoachList
                  coaches={coachSummaries}
                  loading={availability.loading}
                  progressLabel={coachProgressLabel}
                  classCode={segment?.cls}
                  totalAvailable={result?.availableCount}
                  selectedCoachKey={coach}
                  onCoachChange={handleCoachChange}
                />
                {skippedCoaches.length > 0 ? (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                    Skipped {skippedCoaches.length} coach{skippedCoaches.length === 1 ? "" : "es"} that
                    IRCTC was too slow to return ({skippedCoaches.join(", ")}). Counts cover the
                    loaded coaches only — retry to include them.
                  </p>
                ) : null}
              </Section>

              <Section
                step={6}
                title="Berth detail"
                description="Only confirmed available berths are shown, with their actual free window."
                icon={Table2}
              >
                <BerthTable
                  rows={berthRows}
                  total={result?.pagination.total ?? 0}
                  page={result?.pagination.page ?? availability.page}
                  totalPages={result?.pagination.totalPages ?? 1}
                  pageSize={availability.pageSize}
                  loading={availability.loading}
                  from={segment?.from}
                  to={segment?.to}
                  classCode={segment?.cls}
                  coachName={selectedCoachName}
                  onPageChange={(page) => availability.patch({ page })}
                  onPageSizeChange={(pageSize) => availability.patch({ pageSize })}
                />
              </Section>
            </>
          ) : null}

          {segment?.to ? (
            <Section
              step={7}
              title="Cross-boarding comparison"
              description="Compare earlier valid boarding stations for the selected destination."
              icon={Scale}
            >
              <CrossComparison
                destinations={crossDestinations}
                destination={cross.destination}
                onDestinationChange={cross.setDestination}
                boardings={boardings}
                loading={cross.loading}
                loadingLabel={crossProgressLabel}
                disabled={session === null || !crossClass}
                error={cross.error ? describeError(cross.error) : null}
                onRetry={cross.retry}
                onBoardingSelect={handleCrossBoardingSelect}
              />
            </Section>
          ) : null}
        </>
      ) : null}

      <AppFooter />
    </div>
  );
}
