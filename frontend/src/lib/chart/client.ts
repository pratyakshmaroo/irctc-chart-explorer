import type { Coach, Station } from "./types.ts";

export type IrctcErrorKind =
  | "network"
  | "blocked"
  | "rate-limit"
  | "http"
  | "malformed"
  | "chart"
  | "usage"
  | "upstream"
  | "session";

const BASE = "https://www.irctc.co.in";
const CHART_API = `${BASE}/online-charts/api`;

export class IrctcApiError extends Error {
  readonly name = "IrctcApiError";
  readonly kind: IrctcErrorKind;
  readonly status: number | undefined;
  constructor(message: string, kind: IrctcErrorKind, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jsonHeaders = { "Content-Type": "application/json", Accept: "application/json" };

const RETRYABLE_STATUS = new Set([408, 425, 500, 502, 503, 504]);

function backoffMs(attempt: number): number {
  return Math.min(700 * 2 ** (attempt - 1), 5_000) + Math.floor(Math.random() * 250);
}

interface RawHttpOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

async function requestText(
  url: string,
  options: RawHttpOptions,
  retries = 4,
): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (attempt > 0) await sleep(backoffMs(attempt));
    try {
      const res = await fetch(url, {
        method: options.method ?? "GET",
        headers: options.headers,
        body: options.body,
        redirect: "follow",
        signal: options.signal ?? AbortSignal.timeout(25_000),
      });
      if (res.status === 401 || res.status === 403) {
        throw new IrctcApiError(
          `request blocked by IRCTC/Akamai (HTTP ${res.status})`,
          "blocked",
          res.status,
        );
      }
      if (res.status === 429) {
        throw new IrctcApiError("rate limited (HTTP 429)", "rate-limit", res.status);
      }
      if (!res.ok) {
        throw new IrctcApiError(
          `HTTP ${res.status} ${res.statusText}`,
          RETRYABLE_STATUS.has(res.status) ? "upstream" : "http",
          res.status,
        );
      }
      return await res.text();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      if (error instanceof IrctcApiError) {
        if (error.kind === "blocked" || error.kind === "rate-limit") throw error;
        if (error.kind === "http") throw error;
        lastError = error;
      } else {
        lastError = new IrctcApiError(
          `network failure: ${(error as Error).message}`,
          "network",
        );
      }
    }
  }
  throw lastError ?? new IrctcApiError("request failed", "network");
}

async function requestJson<T>(url: string, options: RawHttpOptions = {}, retries = 4): Promise<T> {
  const text = await requestText(url, options, retries);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new IrctcApiError(`malformed JSON from ${url}`, "malformed");
  }
}

export interface RawStation {
  stationCode: string;
  stationName: string;
  arrivalTime: string | null;
  departureTime: string | null;
  routeNumber: string | null;
  haltTime: string | null;
  distance: string | null;
  dayCount: string | null;
  stnSerialNumber: string | null;
  boardingDisabled: string | null;
  status: string | null;
}

export interface RawSchedule {
  trainNumber: string;
  trainName: string;
  stationFrom: string | null;
  stationTo: string | null;
  stationList?: RawStation[];
  errorMessage?: string;
}

export interface RawCoach {
  coachName: string;
  classCode: string;
  positionFromEngine: number | null;
  vacantBerths: number | null;
}

export interface RawComposition {
  cdd?: RawCoach[];
  trainNo: string;
  trainName: string | null;
  from: string | null;
  to: string | null;
  trainStartDate: string | null;
  remoteLocationChartDate: string | null;
  remote: string | null;
  nextRemote: string | null;
  avlRemoteForBooking: string | null;
  destinationStation: string | null;
  chartOneDate: string | null;
  chartTwoDate: string | null;
  error: unknown;
  chartStatusResponseDto?: unknown;
}

export interface RawVacantRow {
  coachName: string;
  cabinCoupe: string | null;
  cabinCoupeNo: string | null;
  berthCode: string;
  berthNumber: number;
  from: string;
  to: string;
  splitNo: number | null;
}

export interface RawVacantBerth {
  vbd?: RawVacantRow[];
  error: unknown;
}

export interface RawBddRow {
  cabinCoupe: string | null;
  cabinCoupeNameNo: string | null;
  berthCode: string;
  berthNo: number;
  from: string;
  to: string;
  bsd?: RawBddSegment[];
  quotaCntStn: unknown;
  enable: boolean | null;
}

export interface RawBddSegment {
  splitNo: number | null;
  from: string;
  to: string;
  quota: string | null;
  occupancy: boolean | null;
}

export interface RawCoachComposition {
  bdd?: RawBddRow[];
  coachName: string;
  error: unknown;
}

export function fetchSchedule(trainNo: string, signal?: AbortSignal): Promise<RawSchedule> {
  return requestJson<RawSchedule>(
    `${BASE}/eticketing/protected/mapps1/trnscheduleenquiry/${trainNo}`,
    {
      headers: {
        greq: String(new Date().getTime()),
        bmirak: "webbm",
      },
      ...(signal ? { signal } : {}),
    },
  );
}

export function fetchTrainComposition(
  trainNo: string,
  jDate: string,
  boardingStation: string,
  signal?: AbortSignal,
): Promise<RawComposition> {
  return requestJson<RawComposition>(
    `${CHART_API}/trainComposition`,
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ trainNo, jDate, boardingStation }),
      ...(signal ? { signal } : {}),
    },
  );
}

export function fetchVacantBerth(params: {
  trainNo: string;
  boardingStation: string;
  remoteStation: string | null;
  trainSourceStation: string | null;
  jDate: string | null;
  cls: string;
  chartType: number;
}, signal?: AbortSignal): Promise<RawVacantBerth> {
  return requestJson<RawVacantBerth>(
    `${CHART_API}/vacantBerth`,
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(params),
      ...(signal ? { signal } : {}),
    },
  );
}

export function fetchCoachComposition(params: {
  trainNo: string;
  boardingStation: string;
  remoteStation: string | null;
  trainSourceStation: string | null;
  jDate: string | null;
  coach: string;
  cls: string;
}, signal?: AbortSignal): Promise<RawCoachComposition> {
  return requestJson<RawCoachComposition>(
    `${CHART_API}/coachComposition`,
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(params),
      ...(signal ? { signal } : {}),
    },
  );
}

export function normalizeStations(raw: RawStation[] | undefined): Station[] {
  if (!Array.isArray(raw)) {
    throw new IrctcApiError("schedule response has no stationList", "malformed");
  }
  return raw.map((s) => ({
    code: s.stationCode,
    name: s.stationName,
    arrivalTime: s.arrivalTime,
    departureTime: s.departureTime,
    haltTime: s.haltTime,
    distance: s.distance,
    dayCount: s.dayCount === null ? null : Number.parseInt(s.dayCount, 10),
    serialNumber: s.stnSerialNumber === null ? null : Number.parseInt(s.stnSerialNumber, 10),
    boardingDisabled: s.boardingDisabled === "true",
    status: s.status,
  }));
}

export function normalizeCoaches(raw: RawCoach[] | undefined): Coach[] {
  if (!Array.isArray(raw)) {
    throw new IrctcApiError("trainComposition response has no cdd", "malformed");
  }
  return raw.map((c) => ({
    name: c.coachName,
    classCode: c.classCode,
    positionFromEngine: c.positionFromEngine,
    vacantBerths: c.vacantBerths,
  }));
}