import type { AvailableBerthRow, Berth, BookingSegment } from "./types.ts";
import type { RouteIndex } from "./route.ts";

export function coachKey(classCode: string, coachName: string): string {
  return `${classCode}:${coachName}`;
}

export interface BerthOccupancy {
  readonly legsFree: readonly boolean[];
  readonly legsCovered: readonly boolean[];
  readonly occupied: readonly BookingSegment[];
  readonly free: readonly BookingSegment[];
  readonly unresolvedSegments: readonly BookingSegment[];
  readonly raw: Berth;
}

function segmentIndexes(segment: BookingSegment, route: RouteIndex): { fromIdx: number; toIdx: number } | null {
  const fromIndexes = route.codeToIndices.get(segment.from);
  const toIndexes = route.codeToIndices.get(segment.to);
  if (
    !fromIndexes ||
    !toIndexes ||
    fromIndexes.length !== 1 ||
    toIndexes.length !== 1
  ) return null;
  const fromIdx = fromIndexes[0]!;
  const toIdx = toIndexes[0]!;
  if (fromIdx >= toIdx) return null;
  return { fromIdx, toIdx };
}

export function normalizeBerth(berth: Berth, route: RouteIndex): BerthOccupancy {
  const legsFree = new Array<boolean>(route.legCount).fill(true);
  const legsCovered = new Array<boolean>(route.legCount).fill(false);
  const occupied: BookingSegment[] = [];
  const free: BookingSegment[] = [];
  const unresolvedSegments: BookingSegment[] = [];

  for (const segment of berth.segments) {
    const indexes = segmentIndexes(segment, route);
    if (!indexes) {
      unresolvedSegments.push(segment);
      continue;
    }
    for (let leg = indexes.fromIdx; leg < indexes.toIdx; leg++) {
      legsCovered[leg] = true;
    }
    if (segment.occupancy === false) {
      free.push(segment);
      continue;
    }
    occupied.push(segment);
    for (let leg = indexes.fromIdx; leg < indexes.toIdx; leg++) {
      legsFree[leg] = false;
    }
  }

  return { legsFree, legsCovered, occupied, free, unresolvedSegments, raw: berth };
}

export function hasCompleteSegmentCoverage(
  occupancy: Pick<BerthOccupancy, "legsCovered">,
  fromIdx: number,
  toIdx: number,
): boolean {
  for (let leg = fromIdx; leg < toIdx; leg++) {
    if (!occupancy.legsCovered[leg]) return false;
  }
  return true;
}

export function maxFreeWindow(
  occupancy: Pick<BerthOccupancy, "legsFree" | "legsCovered">,
  route: RouteIndex,
  fromIdx: number,
  toIdx: number,
): { fromIdx: number; toIdx: number } {
  let left = fromIdx;
  let right = toIdx;
  while (
    left > 0 &&
    occupancy.legsFree[left - 1] &&
    occupancy.legsCovered[left - 1]
  ) left--;
  while (
    right < route.legCount &&
    occupancy.legsFree[right] &&
    occupancy.legsCovered[right]
  ) right++;
  return { fromIdx: left, toIdx: right };
}

export function overlappingSegments(segments: readonly BookingSegment[], route: RouteIndex, fromIdx: number, toIdx: number): BookingSegment[] {
  return segments.filter((segment) => {
    const indexes = segmentIndexes(segment, route);
    if (!indexes) return false;
    return indexes.fromIdx < toIdx && indexes.toIdx > fromIdx;
  });
}

export function evaluateBerth(input: {
  berth: Berth;
  route: RouteIndex;
  fromIdx: number;
  toIdx: number;
  requestedFrom: string;
  requestedTo: string;
  coachName: string;
  classCode: string;
}): AvailableBerthRow {
  const { berth, route, fromIdx, toIdx, requestedFrom, requestedTo, coachName, classCode } = input;
  const occupancy = normalizeBerth(berth, route);
  let reason: string | undefined;
  let available = true;

  if (berth.enabled === false) {
    available = false;
    reason = "berth out of service";
  }
  if (occupancy.unresolvedSegments.length > 0) {
    available = false;
    reason = "booking segment references a station not on this route";
  }
  if (available && !hasCompleteSegmentCoverage(occupancy, fromIdx, toIdx)) {
    available = false;
    reason = berth.segments.length === 0
      ? "berth segment data is missing"
      : "berth segment data is incomplete";
  }
  if (available) {
    for (let leg = fromIdx; leg < toIdx; leg++) {
      if (!occupancy.legsFree[leg]) {
        available = false;
        break;
      }
    }
    if (!available) reason = "requested interval crosses an occupied segment";
  }

  const occupiedSegments = overlappingSegments(occupancy.occupied, route, fromIdx, toIdx);
  const freeSegments = overlappingSegments(occupancy.free, route, fromIdx, toIdx);
  const window = available
    ? (() => {
        const w = maxFreeWindow(occupancy, route, fromIdx, toIdx);
        return { from: route.codes[w.fromIdx]!, to: route.codes[w.toIdx]! };
      })()
    : null;

  return {
    coachName,
    classCode,
    berthNo: berth.berthNo,
    berthCode: berth.berthCode,
    enabled: berth.enabled,
    available,
    ...(reason ? { reason } : {}),
    requestedFrom,
    requestedTo,
    availabilityWindow: window,
    occupiedSegments,
    freeSegments,
  };
}