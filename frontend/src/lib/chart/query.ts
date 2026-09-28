import { getCoachComposition } from "./irctc.ts";
import { buildRouteIndex, resolveUnique, validateOrder } from "./route.ts";
import { coachKey, evaluateBerth } from "./availability.ts";
import type {
  AvailableBerthRow,
  ClassAvailability,
  CoachAvailability,
  CoachComposition,
  CrossBoardingResult,
  Journey,
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

export async function loadClassCompositions(
  journey: Journey,
  classCode: string,
  politeMs = 150,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<CoachComposition[]> {
  const coaches = journey.coaches.filter((c) => c.classCode === classCode);
  const out: CoachComposition[] = new Array(coaches.length);
  let next = 0;
  let done = 0;
  const workers = Math.min(4, coaches.length);
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= coaches.length) return;
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const coach = coaches[i]!;
      out[i] = await getCoachComposition(journey, coach.name, classCode, politeMs, signal);
      done++;
      onProgress?.(done, coaches.length);
    }
  }
  await Promise.all(Array.from({ length: Math.max(workers, 1) }, () => worker()));
  return out;
}

export async function getAvailableBerths(query: AvailableBerthQuery): Promise<ClassAvailability> {
  const route = journeyRoute(query.journey);
  const fromIdx = resolveUnique(route, query.fromStation, "from");
  const toIdx = resolveUnique(route, query.toStation, "to");
  validateOrder(fromIdx, toIdx, query.fromStation, query.toStation);

  const loaded = query.compositions ?? (await loadClassCompositions(query.journey, query.classCode));
  const compositions = loaded.filter((c) => c.cls === query.classCode);
  const coaches: CoachAvailability[] = [];
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

  return {
    classCode: query.classCode,
    fromStation: query.fromStation,
    toStation: query.toStation,
    coaches,
    availableCount,
    totalBerths,
  };
}

export async function compareBoardingStations(query: CrossBoardingQuery): Promise<CrossBoardingResult[]> {
  const route = journeyRoute(query.journey);
  const destIdx = resolveUnique(route, query.destination, "destination");
  const compositions = query.compositions ?? (await loadClassCompositions(query.journey, query.classCode));
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