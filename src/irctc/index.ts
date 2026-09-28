import {
  IrctcApiError,
  fetchCoachComposition,
  fetchSchedule,
  fetchTrainComposition,
  fetchVacantBerth,
  normalizeCoaches,
  normalizeStations,
} from "./client.ts";
import type {
  ClassVacancy,
  Coach,
  CoachComposition,
  CoachVacancyRow,
  Journey,
} from "../types.ts";

export interface JourneyQuery {
  trainNo: string;
  journeyDate: string;
  boardingStation: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function serverError(error: unknown, endpoint: string): void {
  if (error != null && error !== false && error !== "") {
    throw new IrctcApiError(`${endpoint}: ${String(error)}`, "chart");
  }
}

export async function getJourney(query: JourneyQuery, politeMs = 400): Promise<Journey> {
  const comp = await fetchTrainComposition(
    query.trainNo,
    query.journeyDate,
    query.boardingStation,
  );
  serverError(comp.error, "trainComposition");

  if (politeMs > 0) await sleep(politeMs);

  const sched = await fetchSchedule(query.trainNo);
  if (sched.errorMessage) {
    throw new IrctcApiError(`schedule: ${sched.errorMessage}`, "chart");
  }

  return {
    trainNo: comp.trainNo,
    trainName: comp.trainName,
    from: comp.from,
    to: comp.to,
    boardingStation: query.boardingStation,
    journeyDate: query.journeyDate,
    stations: normalizeStations(sched.stationList),
    coaches: normalizeCoaches(comp.cdd),
    remote: comp.remote,
    nextRemote: comp.nextRemote,
    avlRemoteForBooking: comp.avlRemoteForBooking,
    chart: {
      trainStartDate: comp.trainStartDate,
      remoteLocationChartDate: comp.remoteLocationChartDate,
      chartOneDate: comp.chartOneDate,
      chartTwoDate: comp.chartTwoDate,
      destinationStation: comp.destinationStation,
    },
  };
}

export function chartPrepared(journey: Journey): boolean {
  return journey.chart.chartOneDate !== null || journey.chart.chartTwoDate !== null;
}

export function classesOf(journey: Journey): string[] {
  return [...new Set(journey.coaches.map((c) => c.classCode))];
}

export function coachesOfClass(journey: Journey, cls: string): Coach[] {
  return journey.coaches.filter((c) => c.classCode === cls);
}

export function defaultClass(journey: Journey): string | undefined {
  const totals = new Map<string, number>();
  for (const c of journey.coaches) {
    totals.set(c.classCode, (totals.get(c.classCode) ?? 0) + (c.vacantBerths ?? 0));
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [cls, count] of totals) {
    if (count > bestCount) {
      best = cls;
      bestCount = count;
    }
  }
  return best ?? classesOf(journey)[0];
}

export async function getClassVacancy(
  journey: Journey,
  cls: string,
  chartType = 1,
  politeMs = 400,
): Promise<ClassVacancy> {
  const jDate = journey.chart.trainStartDate;
  const remoteStation = journey.remote;
  const trainSourceStation = journey.from;
  if (!jDate || !remoteStation || !trainSourceStation) {
    throw new IrctcApiError(
      "chart data not ready (trainStartDate/remote/from unavailable)",
      "chart",
    );
  }
  const raw = await fetchVacantBerth({
    trainNo: journey.trainNo,
    boardingStation: journey.boardingStation ?? "",
    remoteStation,
    trainSourceStation,
    jDate,
    cls,
    chartType,
  });
  serverError(raw.error, "vacantBerth");
  if (!Array.isArray(raw.vbd)) {
    throw new IrctcApiError("vacantBerth response has no vbd", "malformed");
  }
  if (politeMs > 0) await sleep(politeMs);
  const rows: CoachVacancyRow[] = raw.vbd.map((r) => ({
    coachName: r.coachName,
    cabinCoupe: r.cabinCoupe,
    cabinCoupeNo: r.cabinCoupeNo,
    berthCode: r.berthCode,
    berthNumber: r.berthNumber,
    from: r.from,
    to: r.to,
    splitNo: r.splitNo,
  }));
  return { cls, chartType, rows };
}

export async function getCoachComposition(
  journey: Journey,
  coach: string,
  cls: string,
  politeMs = 400,
): Promise<CoachComposition> {
  const jDate = journey.chart.trainStartDate;
  const remoteStation = journey.remote;
  const trainSourceStation = journey.from;
  if (!jDate || !remoteStation || !trainSourceStation) {
    throw new IrctcApiError(
      "chart data not ready (trainStartDate/remote/from unavailable)",
      "chart",
    );
  }
  // Space out the calls rather than only reporting that we meant to: this runs
  // once per coach on the availability path, so back-to-back requests here are
  // exactly what the polite delay exists to prevent.
  if (politeMs > 0) await sleep(politeMs);
  const raw = await fetchCoachComposition({
    trainNo: journey.trainNo,
    boardingStation: journey.boardingStation ?? "",
    remoteStation,
    trainSourceStation,
    jDate,
    coach,
    cls,
  });
  serverError(raw.error, "coachComposition");
  if (!Array.isArray(raw.bdd)) {
    throw new IrctcApiError("coachComposition response has no bdd", "malformed");
  }
  return {
    coachName: raw.coachName,
    cls,
    berths: raw.bdd.map((b) => ({
      berthNo: b.berthNo,
      berthCode: b.berthCode,
      cabinCoupe: b.cabinCoupe,
      cabinCoupeNameNo: b.cabinCoupeNameNo,
      from: b.from,
      to: b.to,
      segments: (b.bsd ?? []).map((seg) => ({
        splitNo: seg.splitNo,
        from: seg.from,
        to: seg.to,
        quota: seg.quota,
        occupancy: seg.occupancy,
      })),
      enabled: b.enable,
    })),
  };
}