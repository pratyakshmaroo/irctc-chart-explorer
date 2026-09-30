import { getCoachComposition } from "./irctc.ts";
import { IrctcApiError } from "./client.ts";
import { buildRouteIndex, resolveUnique, validateOrder } from "./route.ts";
import { coachKey, evaluateBerth, freeRunsWithin, hasCompleteSegmentCoverage, normalizeBerth } from "./availability.ts";
import type {
  AvailableBerthRow,
  ClassAvailability,
  CoachAvailability,
  CoachComposition,
  CrossBoardingResult,
  Journey,
  PartialBerth,
} from "./types.ts";
import type { RouteIndex } from "./route.ts";

export function journeyRoute(journey: Journey): RouteIndex {
  return buildRouteIndex(journey.stations.map((s) => s.code));
}

export interface AvailableBerthQuery {
  journey: Journey;
  fromStation: string;
  toStation: string;
  classCode: string;
  compositions?: CoachComposition[];
}

export interface CrossBoardingQuery {
  journey: Journey;
  destination: string;
  classCode: string;
  boardingStations: string[];
  compositions?: CoachComposition[];
}

export interface ClassCompositions {
  compositions: CoachComposition[];
  failedCoaches: string[];
}

export async function loadClassCompositions(
  journey: Journey,
  classCode: string,
  politeMs = 150,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<ClassCompositions> {
  const coaches = journey.coaches.filter((c) => c.classCode === classCode);
  const out: (CoachComposition | null)[] = new Array(coaches.length).fill(null);
  const failedCoaches: string[] = [];
  let next = 0;
  let done = 0;
  const workers = Math.min(4, coaches.length);
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= coaches.length) return;
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const coach = coaches[i]!;
      try {
        out[i] = await getCoachComposition(journey, coach.name, classCode, politeMs, signal);
      } catch (error) {
        // One slow/blocked coach must not sink the whole class: record it and
        // keep the berths we did get. Aborts still propagate immediately.
        if (error instanceof Error && error.name === "AbortError") throw error;
        failedCoaches.push(coach.name);
        console.warn(`coach ${coach.name} skipped:`, error instanceof Error ? error.message : error);
      }
      done++;
      onProgress?.(done, coaches.length);
    }
  }
  await Promise.all(Array.from({ length: Math.max(workers, 1) }, () => worker()));
  const compositions = out.filter((c): c is CoachComposition => c !== null);
  if (compositions.length === 0 && coaches.length > 0) {
    throw new IrctcApiError(
      `could not load any ${classCode} coach (IRCTC slow or blocking requests right now)`,
      "network",
    );
  }
  return { compositions, failedCoaches };
}

export async function getAvailableBerths(query: AvailableBerthQuery): Promise<ClassAvailability> {
  const route = journeyRoute(query.journey);
  const fromIdx = resolveUnique(route, query.fromStation, "from");
  const toIdx = resolveUnique(route, query.toStation, "to");
  validateOrder(fromIdx, toIdx, query.fromStation, query.toStation);

  const loaded = query.compositions ?? (await loadClassCompositions(query.journey, query.classCode)).compositions;
  const compositions = loaded.filter((c) => c.cls === query.classCode);
  const coaches: CoachAvailability[] = [];
  const allPartials: PartialBerth[] = [];
  let availableCount = 0;
  let totalBerths = 0;

  for (const composition of compositions) {
    const rows: AvailableBerthRow[] = composition.berths.map((berth) =>
      evaluateBerth({
        berth,
        route,
        fromIdx,
        toIdx,
        requestedFrom: query.fromStation,
        requestedTo: query.toStation,
        coachName: composition.coachName,
        classCode: composition.cls,
      }),
    );
    const result = rows.filter((row) => row.available);
    // Berths that can't cover the whole trip but are free for parts of it
    // become fallback options — but only when the berth data fully covers the
    // trip (no gaps we can't see) and the berth is in service.
    for (let i = 0; i < composition.berths.length; i++) {
      if (rows[i]!.available) continue;
      const berth = composition.berths[i]!;
      if (berth.enabled === false) continue;
      const occupancy = normalizeBerth(berth, route);
      if (occupancy.unresolvedSegments.length > 0) continue;
      if (!hasCompleteSegmentCoverage(occupancy, fromIdx, toIdx)) continue;
      const windows = freeRunsWithin(occupancy, fromIdx, toIdx).map((run) => ({
        from: route.codes[run.fromIdx]!,
        to: route.codes[run.toIdx]!,
      }));
      if (windows.length === 0) continue;
      allPartials.push({
        coachName: composition.coachName,
        classCode: composition.cls,
        berthNo: berth.berthNo,
        berthCode: berth.berthCode,
        windows,
      });
    }
    // Every berth in the composition is evaluated, available or not. Counting
    // from `rows` keeps totalBerths an honest denominator instead of a second
    // tally of the same available rows.
    totalBerths += rows.length;
    availableCount += result.length;
    coaches.push({
      coachName: composition.coachName,
      classCode: composition.cls,
      coachKey: coachKey(composition.cls, composition.coachName),
      fromStation: query.fromStation,
      toStation: query.toStation,
      result,
      availableCount: result.length,
      totalBerths: rows.length,
    });
  }

  // Fewest fragments first — one long free stretch beats three short ones.
  allPartials.sort((a, b) => a.windows.length - b.windows.length);

  return {
    classCode: query.classCode,
    fromStation: query.fromStation,
    toStation: query.toStation,
    coaches,
    availableCount,
    totalBerths,
    partials: allPartials,
  };
}

export async function compareBoardingStations(query: CrossBoardingQuery): Promise<CrossBoardingResult[]> {
  const route = journeyRoute(query.journey);
  const destIdx = resolveUnique(route, query.destination, "destination");
  const { compositions } = query.compositions
    ? { compositions: query.compositions }
    : await loadClassCompositions(query.journey, query.classCode);
  const results: CrossBoardingResult[] = [];

  for (const boarding of query.boardingStations) {
    const boardingIdx = resolveUnique(route, boarding, "boarding");
    validateOrder(boardingIdx, destIdx, boarding, query.destination);

    const rows: AvailableBerthRow[] = [];
    for (const composition of compositions) {
      for (const berth of composition.berths) {
        rows.push(
          evaluateBerth({
            berth,
            route,
            fromIdx: boardingIdx,
            toIdx: destIdx,
            requestedFrom: boarding,
            requestedTo: query.destination,
            coachName: composition.coachName,
            classCode: composition.cls,
          }),
        );
      }
    }
    const available = rows.filter((r) => r.available);
    const coachesCovered = new Set(
      available.map((row) => coachKey(row.classCode, row.coachName)),
    ).size;
    results.push({
      fromStation: boarding,
      toStation: query.destination,
      availableCount: available.length,
      totalBerthsEvaluated: rows.length,
      coachesCovered,
      availableBerths: available,
    });
  }

  return results;
}