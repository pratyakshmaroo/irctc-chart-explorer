import type { PageSize } from "@/lib/types.ts";
import { IrctcApiError, fetchSchedule, normalizeStations } from "@/lib/chart/client.ts";
import {
  chartPrepared,
  classesOf,
  defaultClass,
  getJourney,
} from "@/lib/chart/irctc.ts";
import {
  compareBoardingStations,
  getAvailableBerths,
  loadClassCompositions,
} from "@/lib/chart/query.ts";
import { isValidPageSize, paginate } from "@/lib/chart/pagination.ts";
import type { CoachComposition, Journey } from "@/lib/chart/types.ts";

export type ApiErrorKind =
  | "usage"
  | "chart"
  | "rate-limit"
  | "blocked"
  | "network"
  | "upstream"
  | "http"
  | "malformed"
  | "session"
  | "internal";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | undefined;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof IrctcApiError) {
    return new ApiError(error.kind, error.message, error.status);
  }
  if (error instanceof Error && error.name === "AbortError") throw error;
  return new ApiError("internal", error instanceof Error ? error.message : "Unexpected error.");
}

/** Browser-side session store. Replaces the server Map in src/server.ts. */
const journeys = new Map<string, Journey>();
const compositions = new Map<string, Promise<CoachComposition[]>>();

function journeyKey(trainNo: string, journeyDate: string, boardingStation: string): string {
  return `${trainNo}|${journeyDate}|${boardingStation}`;
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

async function compositionsFor(
  journey: Journey,
  key: string,
  cls: string,
  signal?: AbortSignal,
): Promise<CoachComposition[]> {
  const cacheKey = `${key}|${cls}`;
  let pending = compositions.get(cacheKey);
  if (!pending) {
    pending = loadClassCompositions(journey, cls, 150, signal).catch((error) => {
      compositions.delete(cacheKey);
      throw error;
    });
    compositions.set(cacheKey, pending);
  }
  return pending;
}

function normalizeDate(raw: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) {
    const [, y, m, d] = iso;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return null;
    return `${y}-${m}-${d}`;
  }
  const dmy = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(raw);
  if (dmy) {
    const [, d, m, y] = dmy;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return null;
    return `${y}-${m}-${d}`;
  }
  return null;
}

/**
 * Wire types below declare only the fields the UI actually reads.
 */
export interface ApiStation {
  code: string;
  name: string;
  arrivalTime: string | null;
  departureTime: string | null;
  distance: string | null;
  dayCount: number | null;
  boardingDisabled: boolean;
}

interface ApiJourney {
  trainNo: string;
  trainName: string | null;
  boardingStation: string | null;
  journeyDate: string;
  stations: ApiStation[];
  chart: { destinationStation: string | null };
}

export interface RouteResult {
  ok: true;
  trainNo: string;
  trainName: string | null;
  stations: ApiStation[];
}

export interface SessionResult {
  ok: true;
  key: string;
  journey: ApiJourney;
  classes: string[];
  defaultClass: string | undefined;
  chartPrepared: boolean;
}

interface ApiAvailableBerth {
  coachName: string;
  classCode: string;
  berthNo: number;
  berthCode: string;
  availabilityWindow: { from: string; to: string };
}

interface ApiAvailabilityCoach {
  coachKey: string;
  coachName: string;
  classCode: string;
  availableCount: number;
  /** Every berth evaluated in this coach, available or not. */
  totalBerths: number;
}

export interface AvailabilityResult {
  ok: true;
  /** Available berths matching the request, including any coach filter. */
  availableCount: number;
  /** Berths evaluated for the request. Matches availableCount's filter, so the
   *  two form a real ratio. */
  totalBerths: number;
  coaches: ApiAvailabilityCoach[];
  rows: ApiAvailableBerth[];
  pagination: { page: number; size: number | "All"; total: number; totalPages: number };
}

interface ApiCrossRow {
  fromStation: string;
  availableCount: number;
  totalBerthsEvaluated: number;
  coachesCovered: number;
}

export interface CrossResult {
  ok: true;
  results: ApiCrossRow[];
}

function toApiStations(journey: Journey): ApiStation[] {
  return journey.stations.map((s) => ({
    code: s.code,
    name: s.name,
    arrivalTime: s.arrivalTime,
    departureTime: s.departureTime,
    distance: s.distance,
    dayCount: s.dayCount,
    boardingDisabled: s.boardingDisabled,
  }));
}

function toApiJourney(journey: Journey): ApiJourney {
  return {
    trainNo: journey.trainNo,
    trainName: journey.trainName,
    boardingStation: journey.boardingStation,
    journeyDate: journey.journeyDate,
    stations: toApiStations(journey),
    chart: { destinationStation: journey.chart.destinationStation },
  };
}

export async function getRoute(trainNo: string, signal?: AbortSignal): Promise<RouteResult> {
  try {
    checkAborted(signal);
    const clean = trainNo.trim();
    if (!/^\d{4,5}$/.test(clean)) {
      throw new ApiError("usage", "Enter a valid 4–5 digit train number.");
    }
    const sched = await fetchSchedule(clean, signal);
    if (sched.errorMessage) {
      throw new IrctcApiError(`schedule: ${sched.errorMessage}`, "chart");
    }
    const stations = normalizeStations(sched.stationList);
    return {
      ok: true,
      trainNo: clean,
      trainName: sched.trainName ?? null,
      stations: stations.map((s) => ({
        code: s.code,
        name: s.name,
        arrivalTime: s.arrivalTime,
        departureTime: s.departureTime,
        distance: s.distance,
        dayCount: s.dayCount,
        boardingDisabled: s.boardingDisabled,
      })),
    };
  } catch (error) {
    throw toApiError(error);
  }
}

export async function createSession(
  input: { trainNo: string; journeyDate: string; boardingStation: string },
  signal?: AbortSignal,
): Promise<SessionResult> {
  try {
    checkAborted(signal);
    const trainNo = input.trainNo.trim();
    const boardingStation = input.boardingStation.trim().toUpperCase();
    if (!/^\d{4,5}$/.test(trainNo)) {
      throw new ApiError("usage", "Enter a valid 4–5 digit train number.");
    }
    const journeyDate = normalizeDate(input.journeyDate.trim());
    if (!journeyDate) {
      throw new ApiError("usage", "Enter the journey date as DD-MM-YYYY or YYYY-MM-DD.");
    }
    if (!boardingStation) {
      throw new ApiError("usage", "Enter the boarding station code (e.g. MAS).");
    }
    const key = journeyKey(trainNo, journeyDate, boardingStation);
    const journey = await getJourney({ trainNo, journeyDate, boardingStation }, 400, signal);
    journeys.set(key, journey);
    return {
      ok: true,
      key,
      journey: toApiJourney(journey),
      classes: classesOf(journey),
      defaultClass: defaultClass(journey),
      chartPrepared: chartPrepared(journey),
    };
  } catch (error) {
    throw toApiError(error);
  }
}

function requireJourney(key: string): Journey {
  const journey = journeys.get(key);
  if (!journey) {
    throw new IrctcApiError("This session is not loaded. Search the train again.", "session");
  }
  return journey;
}

export async function getAvailability(
  input: { key: string; from: string; to: string; classCode: string; coach?: string | null; page: number; size: PageSize },
  signal?: AbortSignal,
): Promise<AvailabilityResult> {
  try {
    checkAborted(signal);
    const journey = requireJourney(input.key);
    if (!input.classCode) throw new ApiError("usage", "Select a class first.");
    if (!Number.isInteger(input.page) || input.page < 1) {
      throw new ApiError("usage", "Invalid page number.");
    }
    if (!isValidPageSize(input.size)) {
      throw new ApiError("usage", 'Invalid page size (use 10, 25, 50, 100 or All).');
    }
    const loaded = await compositionsFor(journey, input.key, input.classCode, signal);
    checkAborted(signal);
    const result = await getAvailableBerths({
      journey,
      fromStation: input.from,
      toStation: input.to,
      classCode: input.classCode,
      compositions: loaded,
    });
    const selected = input.coach
      ? result.coaches.filter((c) => c.coachKey === input.coach)
      : result.coaches;
    const available = selected.flatMap((c) => c.result);
    const p = paginate(available, input.page, input.size);
    return {
      ok: true,
      classCode: input.classCode,
      fromStation: input.from,
      toStation: input.to,
      availableCount: available.length,
      totalBerths: selected.reduce((sum, c) => sum + c.totalBerths, 0),
      coaches: result.coaches
        .filter((c) => c.availableCount > 0)
        .map((c) => ({
          coachKey: c.coachKey,
          coachName: c.coachName,
          classCode: c.classCode,
          availableCount: c.availableCount,
          totalBerths: c.totalBerths,
        })),
      rows: p.items.map((r) => ({
        coachName: r.coachName,
        classCode: r.classCode,
        berthNo: r.berthNo,
        berthCode: r.berthCode,
        availabilityWindow: r.availabilityWindow ?? { from: input.from, to: input.to },
      })),
      pagination: { page: p.page, size: p.size, total: p.total, totalPages: p.totalPages },
    } as AvailabilityResult;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getCross(
  input: { key: string; dest: string; classCode: string },
  signal?: AbortSignal,
): Promise<CrossResult> {
  try {
    checkAborted(signal);
    const journey = requireJourney(input.key);
    if (!input.classCode) throw new ApiError("usage", "Select a class first.");
    const destIdx = journey.stations.findIndex((s) => s.code === input.dest);
    if (destIdx < 0) {
      throw new ApiError("usage", "Destination must be a station on this train's route.");
    }
    if (destIdx === 0) {
      throw new ApiError("usage", "There are no stations before the destination to compare.");
    }
    const boardings = journey.stations
      .slice(0, destIdx)
      .filter((station) => !station.boardingDisabled)
      .map((station) => station.code);
    const loaded = await compositionsFor(journey, input.key, input.classCode, signal);
    checkAborted(signal);
    const results = await compareBoardingStations({
      journey,
      destination: input.dest,
      classCode: input.classCode,
      boardingStations: boardings,
      compositions: loaded,
    });
    return {
      ok: true,
      destination: input.dest,
      classCode: input.classCode,
      results: results.map((r) => ({
        fromStation: r.fromStation,
        availableCount: r.availableCount,
        totalBerthsEvaluated: r.totalBerthsEvaluated,
        coachesCovered: r.coachesCovered,
      })),
    } as CrossResult;
  } catch (error) {
    throw toApiError(error);
  }
}
