/**
 * Single place where API payloads become the shapes components render.
 * Components never touch a wire type directly.
 */
import type { ApiStation, AvailabilityResult, CrossResult } from "@/lib/api.ts";
import type {
  BerthRow,
  BoardingComparison,
  CoachSummary,
  RouteNode,
  StationOption,
} from "@/lib/types.ts";

/** The one mapping from the API's station shape to the app's route shape. */
export function toRouteNodes(stations: readonly ApiStation[]): RouteNode[] {
  return stations.map((station) => ({
    code: station.code,
    name: station.name,
    boardingDisabled: station.boardingDisabled,
    arrivalTime: station.arrivalTime,
    departureTime: station.departureTime,
    distance: station.distance,
    dayCount: station.dayCount,
  }));
}

export function stationIndex(
  stations: readonly StationOption[],
  code: string,
): number {
  if (!code) return -1;
  return stations.findIndex((station) => station.code === code);
}

export function stationName(
  stations: readonly StationOption[],
  code: string,
): string {
  return stations.find((station) => station.code === code)?.name ?? code;
}

/**
 * Stops a passenger can board at: boarding-enabled, and never the terminus —
 * the last station is a destination only.
 */
export function selectBoardingStations(
  stations: readonly StationOption[],
): StationOption[] {
  return stations.filter(
    (station, index) =>
      station.boardingDisabled !== true && index < stations.length - 1,
  );
}

/** Every stop strictly after `fromCode`; empty when the origin is not on the route. */
export function selectDestinations(
  stations: readonly StationOption[],
  fromCode: string,
): StationOption[] {
  const fromIdx = stationIndex(stations, fromCode);
  return fromIdx >= 0 ? stations.slice(fromIdx + 1) : [];
}

/** Keeps `currentTo` if it is still ahead of `from`, otherwise the next stop. */
export function destinationAfter(
  stations: readonly StationOption[],
  from: string,
  currentTo: string,
): string {
  const fromIdx = stationIndex(stations, from);
  if (fromIdx < 0 || fromIdx >= stations.length - 1) return "";
  const toIdx = currentTo ? stationIndex(stations, currentTo) : -1;
  return toIdx > fromIdx ? currentTo : stations[fromIdx + 1]!.code;
}

export function toCoachSummaries(
  result: AvailabilityResult | null | undefined,
): CoachSummary[] {
  return (result?.coaches ?? []).map((coach) => ({
    coachKey: coach.coachKey,
    coachName: coach.coachName,
    classCode: coach.classCode,
    available: coach.availableCount,
    total: coach.totalBerths,
  }));
}

export function toBerthRows(
  result: AvailabilityResult | null | undefined,
  stations: readonly StationOption[],
): BerthRow[] {
  return (result?.rows ?? []).map((row) => ({
    // Stable across refetches and unique per berth within a result set.
    id: `${row.classCode}-${row.coachName}-${row.berthNo}-${row.berthCode}-${row.availabilityWindow.from}-${row.availabilityWindow.to}`,
    coachName: row.coachName,
    classCode: row.classCode,
    berthNo: row.berthNo,
    berthType: row.berthCode,
    from: row.availabilityWindow.from,
    to: row.availabilityWindow.to,
    fromName: stationName(stations, row.availabilityWindow.from),
    toName: stationName(stations, row.availabilityWindow.to),
  }));
}

export function toBoardings(
  result: CrossResult | null | undefined,
  stations: readonly StationOption[],
): BoardingComparison[] {
  return (result?.results ?? []).map((row) => ({
    fromStation: row.fromStation,
    fromName: stationName(stations, row.fromStation),
    availableCount: row.availableCount,
    totalBerths: row.totalBerthsEvaluated,
    coachesCovered: row.coachesCovered,
  }));
}
