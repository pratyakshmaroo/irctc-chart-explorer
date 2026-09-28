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

/** In-page request log so passengers can see (and paste) what the app asked
 *  IRCTC, without opening DevTools. Kept to the last 50 entries. */
export type RequestStatus = "pending" | "ok" | "error";

export interface RequestLogEntry {
  id: number;
  label: string;
  status: RequestStatus;
  ms: number | null;
  detail: string | null;
}

let logId = 0;
let logEntries: RequestLogEntry[] = [];
const logListeners = new Set<() => void>();

function emitLog(): void {
  for (const fn of logListeners) {
    try {
      fn();
    } catch {
      // Listener errors must never break networking.
    }
  }
}

export function subscribeRequestLog(fn: () => void): () => void {
  logListeners.add(fn);
  return () => {
    logListeners.delete(fn);
  };
}

export function getRequestLog(): readonly RequestLogEntry[] {
  return logEntries;
}

export function logStart(label: string): number {
  const id = ++logId;
  logEntries = [
    ...logEntries.slice(-49),
    { id, label, status: "pending", ms: null, detail: null },
  ];
  emitLog();
  return id;
}

export function logFinish(id: number, ok: boolean, ms: number, detail?: string): void {
  logEntries = logEntries.map((entry) =>
    entry.id === id
      ? { ...entry, status: ok ? "ok" : "error", ms, detail: detail ?? null }
      : entry,
  );
  emitLog();
}

/** Wraps one IRCTC call with timing + outcome for the in-page log. */
export async function loggedRequest<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const id = logStart(label);
  const started = Date.now();
  try {
    const value = await fn();
    logFinish(id, true, Date.now() - started);
    return value;
  } catch (error) {
    logFinish(
      id,
      false,
      Date.now() - started,
      error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160),
    );
    throw error;
  }
}

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

/** Per-call resilience tuning. Coach fan-out uses fast values so one slow
 *  coach cannot hold the whole page hostage. */
export interface HttpTuning {
  retries?: number;
  timeoutMs?: number;
}

async function requestText(
  url: string,
  options: RawHttpOptions,
  tuning: HttpTuning = {},
): Promise<string> {
  const retries = tuning.retries ?? 2;
  const timeoutMs = tuning.timeoutMs ?? 15_000;
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
        signal: options.signal ?? AbortSignal.timeout(timeoutMs),
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

async function requestJson<T>(url: string, options: RawHttpOptions = {}, tuning: HttpTuning = {}): Promise<T> {
  const text = await requestText(url, options, tuning);
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

export function fetchSchedule(trainNo: string, signal?: AbortSignal, tuning?: HttpTuning): Promise<RawSchedule> {
  return requestJson<RawSchedule>(
    `${BASE}/eticketing/protected/mapps1/trnscheduleenquiry/${trainNo}`,
    {
      headers: {
        greq: String(new Date().getTime()),
        bmirak: "webbm",
      },
      ...(signal ? { signal } : {}),
    },
    tuning,
  );
}

export function fetchTrainComposition(
  trainNo: string,
  jDate: string,
  boardingStation: string,
  signal?: AbortSignal,
  tuning?: HttpTuning,
): Promise<RawComposition> {
  return requestJson<RawComposition>(
    `${CHART_API}/trainComposition`,
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ trainNo, jDate, boardingStation }),
      ...(signal ? { signal } : {}),
    },
    tuning,
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
}, signal?: AbortSignal, tuning?: HttpTuning): Promise<RawVacantBerth> {
  return requestJson<RawVacantBerth>(
    `${CHART_API}/vacantBerth`,
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(params),
      ...(signal ? { signal } : {}),
    },
    tuning,
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
}, signal?: AbortSignal, tuning?: HttpTuning): Promise<RawCoachComposition> {
  return requestJson<RawCoachComposition>(
    `${CHART_API}/coachComposition`,
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(params),
      ...(signal ? { signal } : {}),
    },
    tuning,
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