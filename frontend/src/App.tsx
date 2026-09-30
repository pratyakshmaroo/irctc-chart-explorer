import { useEffect, useMemo, useRef, useState } from "react";
import { Armchair, Scale, Search } from "lucide-react";

import { AppFooter, AppHeader } from "@/components/app/app-shell.tsx";
import { AvailabilitySearch } from "@/components/availability/availability-search.tsx";
import { BerthTable } from "@/components/availability/berth-table.tsx";
import { CoachList } from "@/components/availability/coach-list.tsx";
import { ErrorState } from "@/components/feedback/error-state.tsx";
import { Loading } from "@/components/feedback/loading.tsx";
import {
  SearchScreen,
  type SearchFields,
  type SearchResult,
} from "@/components/search/search-screen.tsx";
import { Section } from "@/components/ui/section.tsx";
import { useAvailability } from "@/hooks/use-availability.ts";
import { useCross } from "@/hooks/use-cross.ts";
import {
  destinationAfter,
  selectBoardingStations,
  stationIndex,
  toBerthRows,
  toBoardings,
  toCoachSummaries,
  toRouteNodes,
} from "@/lib/adapters.ts";
import { createSession, getRoute, isAbortError } from "@/lib/api.ts";
import type { ApiStation, SessionResult } from "@/lib/api.ts";
import { formatJourneyDate } from "@/lib/dates.ts";
import { describeError } from "@/lib/errors.ts";
import type { StationOption } from "@/lib/types.ts";

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

function BoardingRow({
  boarding,
  isCurrent,
  onSelect,
}: {
  boarding: { fromStation: string; fromName: string; availableCount: number };
  isCurrent: boolean;
  onSelect: (code: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={isCurrent}
        onClick={() => onSelect(boarding.fromStation)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:border-rail/40 disabled:cursor-default disabled:opacity-70"
      >
        <span>
          <span className="font-mono text-sm font-bold">{boarding.fromStation}</span>
          <span className="text-xs text-muted-foreground"> · {boarding.fromName}</span>
          {isCurrent ? (
            <span className="text-xs text-muted-foreground"> · your boarding</span>
          ) : null}
        </span>
        <span className="text-sm tabular-nums">
          <span className="font-extrabold text-signal-good">{boarding.availableCount}</span>
          <span className="text-muted-foreground"> seats</span>
        </span>
      </button>
    </li>
  );
}

export function App() {
  const [searched, setSearched] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastSearch, setLastSearch] = useState<SearchResult>();

  const [route, setRoute] = useState<RouteData | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const searchRequestRef = useRef<AbortController | null>(null);

  // A chart session can expire; both queries report it the same way
  // and it is handled in one place.
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

  // The comparison always follows the selected destination — no picker.
  const segmentTo = segment?.to ?? "";
  const sessionKey = session?.key;
  const crossDestination = cross.destination;
  useEffect(() => {
    if (!sessionKey || !segmentTo) return;
    if (crossDestination !== segmentTo) cross.setDestination(segmentTo);
  }, [sessionKey, segmentTo, crossDestination, cross.setDestination]);

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
  const rankedBoardings = useMemo(
    () =>
      [...boardings].sort(
        (a, b) =>
          b.availableCount - a.availableCount || b.coachesCovered - a.coachesCovered,
      ),
    [boardings],
  );

  // The backend compares every station before the destination — split them
  // around your boarding: book EARLY to lock a seat before it reaches you,
  // or board LATE where seats free up en route.
  const fromIdx = segment?.from ? stationIndex(routeStations, segment.from) : -1;
  const earlierBoardings = useMemo(
    () =>
      fromIdx < 0
        ? rankedBoardings
        : rankedBoardings.filter(
            (b) => stationIndex(routeStations, b.fromStation) < fromIdx,
          ),
    [rankedBoardings, routeStations, fromIdx],
  );
  const laterBoardings = useMemo(
    () =>
      fromIdx < 0
        ? []
        : rankedBoardings.filter(
            (b) => stationIndex(routeStations, b.fromStation) > fromIdx,
          ),
    [rankedBoardings, routeStations, fromIdx],
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
        // Sensible defaults so seats load with zero extra taps: ride to the
        // final stop in the best class.
        const stations = res.journey.stations;
        const finalStop = stations[stations.length - 1]?.code ?? "";
        availability.patch({
          segment: {
            from: res.journey.boardingStation ?? "",
            to: finalStop,
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
    availability.patch({ segment: { from: value, to: destinationAfter(routeStations, value, segment?.to ?? "") } });
  }

  function handleToChange(value: string) {
    const fromIdx = stationIndex(routeStations, segment?.from ?? "");
    const toIdx = stationIndex(routeStations, value);
    if (fromIdx < 0 || toIdx <= fromIdx) return;
    availability.patch({ segment: { to: value } });
  }

  function handleCrossBoardingSelect(value: string) {
    const fromIdx = stationIndex(routeStations, value);
    const toIdx = stationIndex(routeStations, segment?.to ?? "");
    if (fromIdx < 0 || toIdx <= fromIdx || routeStations[fromIdx]?.boardingDisabled) return;
    availability.patch({ segment: { from: value } });
  }

  function handleCoachChange(value: string | null) {
    availability.patch({ coach: value });
  }

  const journey = session?.journey;
  const headerLine = journey
    ? `${journey.trainNo}${journey.trainName ? ` ${journey.trainName}` : ""} · ${formatJourneyDate(journey.journeyDate)} · board ${journey.boardingStation ?? "—"} · chart ${session?.chartPrepared ? "ready" : "not ready yet"}`
    : null;

  const visibleCoaches = coach
    ? coachSummaries.filter((entry) => entry.coachKey === coach)
    : coachSummaries;
  const selectedCoachName = coach
    ? coachSummaries.find((entry) => entry.coachKey === coach)?.coachName
    : null;
  const resultsReady = availabilityReady && !availability.error;

  const statsLine = !availabilityReady
    ? "Pick a destination and class to see seats."
    : availability.loading
      ? "Checking seats…"
      : availability.error
        ? "Seats unavailable."
        : result
          ? `${result.availableCount} of ${result.totalBerths} berths free · ${segment?.cls} · ${segment?.from}→${segment?.to}`
          : "No result.";

  const coachProgress = availability.progress;
  const coachProgressLabel =
    availability.loading && coachProgress && coachProgress.total > 0
      ? `Loading coaches ${Math.min(coachProgress.done + 1, coachProgress.total)} of ${coachProgress.total}…`
      : null;
  const crossProgress = cross.progress;
  const crossProgressLabel =
    cross.loading && crossProgress && crossProgress.total > 0
      ? `Loading coaches ${Math.min(crossProgress.done + 1, crossProgress.total)} of ${crossProgress.total}…`
      : "Comparing earlier boarding stations…";
  const skippedCoaches = result?.warnings ?? [];
  const crossWarnings = cross.result?.warnings ?? [];

  return (
    <div className="app-surface mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-8 px-4 py-6 sm:gap-10 sm:px-6 sm:py-10">
      <AppHeader />

      <div className="-mb-6 space-y-2 sm:-mb-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-rail sm:text-xs">
          Live chart · seat check
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Look up a train journey and see every free berth — plus the best station to board from.
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

      {searched && route && session ? (
        <>
          <Section
            step={2}
            title="Seats"
            description={headerLine ?? "Free berths for your trip."}
            icon={Armchair}
          >
            <AvailabilitySearch
              stations={routeStations}
              from={segment?.from ?? ""}
              onFromChange={handleFromChange}
              to={segment?.to ?? ""}
              onToChange={handleToChange}
              classes={session.classes}
              classCode={segment?.cls ?? ""}
              onClassChange={(cls) => availability.patch({ segment: { cls } })}
              disabled={false}
            />

            <p className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm">
              <span className="font-semibold tabular-nums">{statsLine}</span>
              {skippedCoaches.length > 0 ? (
                <span className="text-muted-foreground"> ({skippedCoaches.length} slow coach{skippedCoaches.length === 1 ? "" : "es"} skipped — retry to include)</span>
              ) : null}
            </p>

            {availability.error ? (
              <ErrorState
                title="Seats query failed"
                message={describeError(availability.error)}
                onRetry={availability.retry}
                className="py-8"
              />
            ) : null}

            {resultsReady ? (
              <>
                <CoachList
                  coaches={coachSummaries}
                  loading={availability.loading}
                  progressLabel={coachProgressLabel}
                  classCode={segment?.cls}
                  totalAvailable={result?.availableCount}
                  selectedCoachKey={coach}
                  onCoachChange={handleCoachChange}
                />
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
              </>
            ) : null}
          </Section>

          {segment?.to ? (
            <Section
              step={3}
              title="Other boarding stations"
              description="Book from before you to lock a seat, or board after you where seats free up. Tap one to switch."
              icon={Scale}
            >
              {cross.error ? (
                <ErrorState
                  title="Comparison unavailable"
                  message={describeError(cross.error)}
                  onRetry={cross.retry}
                  className="py-8"
                />
              ) : cross.loading ? (
                <Loading label={crossProgressLabel} />
              ) : earlierBoardings.length === 0 && laterBoardings.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                  No other boarding stations to compare for this destination.
                </p>
              ) : (
                <>
                  {earlierBoardings.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Board early — book from here so the seat is held before it reaches you
                      </p>
                      <ul className="space-y-2">
                        {earlierBoardings.map((boarding) => (
                          <BoardingRow
                            key={boarding.fromStation}
                            boarding={boarding}
                            isCurrent={boarding.fromStation === segment?.from}
                            onSelect={handleCrossBoardingSelect}
                          />
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {laterBoardings.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Board late — seats free up after your stop, catch them here
                      </p>
                      <ul className="space-y-2">
                        {laterBoardings.map((boarding) => (
                          <BoardingRow
                            key={boarding.fromStation}
                            boarding={boarding}
                            isCurrent={false}
                            onSelect={handleCrossBoardingSelect}
                          />
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {crossWarnings.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {crossWarnings.length} slow coach{crossWarnings.length === 1 ? "" : "es"} skipped in these counts.
                    </p>
                  ) : null}
                </>
              )}
            </Section>
          ) : null}
        </>
      ) : null}

      <AppFooter />
    </div>
  );
}
