import { test } from "node:test";
import assert from "node:assert/strict";

import { buildRouteIndex, resolveUnique, validateOrder } from "./route.ts";
import { coachKey, evaluateBerth, maxFreeWindow, normalizeBerth, overlappingSegments } from "./availability.ts";
import { paginate } from "./pagination.ts";
import { getAvailableBerths } from "./query.ts";
import { ROUTE5, berth, composition, journey, seg } from "./testdata.ts";
import { IrctcApiError } from "./irctc/client.ts";

const route = buildRouteIndex([...ROUTE5]);

function idx(code: string): number {
  return resolveUnique(route, code, code);
}

function check(b: ReturnType<typeof berth>, from = "A", to = "E") {
  return evaluateBerth({
    berth: b,
    route,
    fromIdx: idx(from),
    toIdx: idx(to),
    requestedFrom: from,
    requestedTo: to,
    coachName: "A1",
    classCode: "2A",
  });
}

test("berth available over its full route when all legs are free", () => {
  const result = check(berth([seg("A", "E", false)]));
  assert.equal(result.available, true);
  assert.equal(result.reason, undefined);
  assert.deepEqual(result.availabilityWindow, { from: "A", to: "E" });
});

test("berth occupied for the whole route is not available", () => {
  const result = check(berth([seg("A", "E", true)]));
  assert.equal(result.available, false);
  assert.equal(result.reason, "requested interval crosses an occupied segment");
  assert.equal(check(berth([seg("A", "E", true)]), "B", "D").available, false);
});

test("vacancy that begins exactly at the requested From is available", () => {
  const b = berth([seg("A", "B", true), seg("B", "E", false)]);
  const result = check(b, "B", "D");
  assert.equal(result.available, true);
  assert.deepEqual(result.availabilityWindow, { from: "B", to: "E" });
});

test("vacancy that ends exactly at the requested To is available", () => {
  const b = berth([seg("A", "C", false), seg("C", "E", true)]);
  const result = check(b, "A", "C");
  assert.equal(result.available, true);
  assert.deepEqual(result.availabilityWindow, { from: "A", to: "C" });
});

test("vacancy covering only part of the requested journey is not available", () => {
  const b = berth([seg("A", "B", true), seg("B", "C", false), seg("C", "E", true)]);
  assert.equal(check(b, "A", "D").available, false);
  assert.equal(check(b, "B", "D").available, false);
  assert.equal(check(b, "B", "C").available, true);

  const onPair = check(b, "B", "D");
  assert.deepEqual(onPair.occupiedSegments.map((s) => [s.from, s.to, s.occupancy]), [["C", "E", true]]);
  assert.deepEqual(onPair.freeSegments.map((s) => [s.from, s.to]), [["B", "C"]]);
});

test("multiple consecutive segments are handled correctly", () => {
  const occupied = berth([seg("A", "B", true), seg("B", "C", true), seg("C", "E", false)]);
  assert.equal(check(occupied, "A", "D").available, false);
  assert.equal(check(occupied, "C", "E").available, true);

  const consecutiveFree = berth([seg("A", "C", false), seg("C", "D", false), seg("D", "E", false)]);
  const full = check(consecutiveFree, "A", "E");
  assert.equal(full.available, true);
  assert.deepEqual(full.availabilityWindow, { from: "A", to: "E" });
});

test("requested journey crossing an occupied segment is not available", () => {
  const b = berth([seg("A", "B", false), seg("B", "C", true), seg("C", "E", false)]);
  assert.equal(check(b, "A", "D").available, false);
  assert.equal(check(b, "A", "B").available, true);
  assert.deepEqual(check(b, "A", "B").availabilityWindow, { from: "A", to: "B" });
});

test("a berth marked out of service is reported unavailable", () => {
  const b = berth([], { enabled: false });
  const result = check(b, "B", "C");
  assert.equal(result.available, false);
  assert.equal(result.reason, "berth out of service");
});

test("segments referencing stations outside the route are unresolved, not guessed", () => {
  const b = berth([seg("A", "Z", false)]);
  const occ = normalizeBerth(b, route);
  assert.equal(occ.unresolvedSegments.length, 1);
  const result = check(b, "A", "B");
  assert.equal(result.available, false);
  assert.equal(result.reason, "booking segment references a station not on this route");
});

test("maxFreeWindow expands through consecutive free legs and stops at occupied", () => {
  const b = berth([seg("A", "B", true), seg("B", "E", false)]);
  const occ = normalizeBerth(b, route);
  const w = maxFreeWindow(occ, route, idx("B"), idx("D"));
  assert.deepEqual([route.codes[w.fromIdx], route.codes[w.toIdx]], ["B", "E"]);
});

test("overlappingSegments respects request boundaries", () => {
  const b = berth([seg("A", "B", true), seg("C", "D", true)]);
  const occ = normalizeBerth(b, route);
  const overlaps = overlappingSegments(occ.occupied, route, idx("B"), idx("D"));
  assert.deepEqual(overlaps.map((s) => s.from), ["C"]);
});

test("missing or incomplete segment data fails closed", () => {
  const missing = check(berth([]));
  assert.equal(missing.available, false);
  assert.equal(missing.reason, "berth segment data is missing");

  const incomplete = check(berth([seg("A", "B", false), seg("B", "C", false)]), "A", "E");
  assert.equal(incomplete.available, false);
  assert.equal(incomplete.reason, "berth segment data is incomplete");
});

test("class availability reports honest totals and keeps empty coaches", async () => {
  const j = journey(ROUTE5);
  const freeBerth = berth([seg("A", "E", false)]);
  const occupied = composition("A2", "2A", [berth([seg("A", "E", true)])]);
  const missing = composition("A5", "2A", [berth([])]);
  const disabled = composition("A4", "2A", [berth([seg("A", "E", false)], { enabled: false })]);
  const mixed = composition("A3", "2A", [freeBerth, berth([seg("A", "E", true)])]);

  const result = await getAvailableBerths({
    journey: j,
    fromStation: "A",
    toStation: "E",
    classCode: "2A",
    compositions: [occupied, missing, disabled, mixed],
  });

  // Every composition is represented, including the ones with nothing available,
  // so that per-coach and class totals stay truthful.
  assert.deepEqual(result.coaches.map((coach) => coach.coachName), ["A2", "A5", "A4", "A3"]);
  assert.equal(result.availableCount, 1);
  // 1+1+1+2 berths evaluated in total, not 1 available row counted twice.
  assert.equal(result.totalBerths, 5);
  assert.equal(result.coaches[3]!.availableCount, 1);
  assert.equal(result.coaches[3]!.totalBerths, 2);
  assert.equal(result.coaches[0]!.availableCount, 0);
  assert.equal(result.coaches[0]!.totalBerths, 1);
  assert.equal(result.coaches[0]!.result.length, 0);

  const only = result.coaches[3]!;
  assert.equal(only.result.length, 1);
  assert.equal(only.result.every((row) => row.available), true);
  assert.equal(only.result[0]!.availabilityWindow?.from, "A");
  assert.equal(only.result[0]!.availabilityWindow?.to, "E");
  assert.equal(only.result[0]!.classCode, "2A");
  assert.equal(only.result[0]!.coachName, "A3");
  assert.equal(only.result[0]!.berthNo, freeBerth.berthNo);
});

test("availability is filtered before pagination", async () => {
  const free = Array.from({ length: 32 }, () => berth([seg("A", "E", false)]));
  const occupied = Array.from({ length: 48 }, () => berth([seg("A", "E", true)]));
  const result = await getAvailableBerths({
    journey: journey(ROUTE5),
    fromStation: "A",
    toStation: "E",
    classCode: "2A",
    compositions: [composition("A1", "2A", [...free, ...occupied])],
  });
  const rows = result.coaches.flatMap((coach) => coach.result);
  const page = paginate(rows, 4, 10);

  // 80 berths were evaluated and 32 are available, so the two counts differ and
  // pagination applies to the available rows only.
  assert.equal(result.totalBerths, 80);
  assert.equal(result.availableCount, 32);
  assert.equal(result.coaches[0]!.totalBerths, 80);
  assert.equal(page.total, 32);
  assert.equal(page.totalPages, 4);
  assert.equal(page.items.length, 2);
  assert.equal(page.items.every((row) => row.available), true);
});

test("same coach number in different classes has distinct identity", async () => {
  assert.notEqual(coachKey("1A", "HA1"), coachKey("2A", "HA1"));

  const ha1_1a = composition("HA1", "1A", [berth([seg("A", "E", false)]), berth([seg("A", "E", false)])]);
  const ha1_2a = composition("HA1", "2A", [berth([seg("A", "E", true)])]);
  const j = journey(ROUTE5);
  const result = await getAvailableBerths({
    journey: j,
    fromStation: "A",
    toStation: "E",
    classCode: "1A",
    compositions: [ha1_1a, ha1_2a],
  });

  assert.equal(result.classCode, "1A");
  assert.equal(result.coaches.length, 1);
  assert.equal(result.coaches[0]!.coachKey, "1A:HA1");
  assert.equal(result.coaches[0]!.availableCount, 2);
  assert.equal(result.availableCount, 2);
});

test("from/to ordering and membership are validated", async () => {
  assert.throws(() => validateOrder(idx("E"), idx("A"), "E", "A"), IrctcApiError);
  assert.throws(() => validateOrder(idx("C"), idx("C"), "C", "C"), IrctcApiError);
  assert.throws(() => resolveUnique(route, "Z", "from"), IrctcApiError);

  const j = journey(ROUTE5);
  await assert.rejects(
    getAvailableBerths({ journey: j, fromStation: "E", toStation: "A", classCode: "2A", compositions: [] }),
    (error: unknown) => error instanceof IrctcApiError && error.kind === "usage",
  );
});