import type { Berth, BookingSegment, CoachComposition, Journey, Station } from "./types.ts";

export const ROUTE5 = ["A", "B", "C", "D", "E"] as const;

let counter = 0;

export function seg(from: string, to: string, occupancy: boolean): BookingSegment {
  counter += 1;
  return { splitNo: counter, from, to, quota: "GN", occupancy };
}

export function berth(
  segments: BookingSegment[],
  partial: Partial<Berth> = {},
): Berth {
  counter += 1;
  return {
    berthNo: counter,
    berthCode: "L",
    cabinCoupe: null,
    cabinCoupeNameNo: null,
    from: ROUTE5[0]!,
    to: ROUTE5[ROUTE5.length - 1]!,
    segments,
    enabled: true,
    ...partial,
  };
}

export function composition(
  coachName: string,
  classCode: string,
  berths: Berth[],
): CoachComposition {
  return { coachName, cls: classCode, berths };
}

export function station(code: string): Station {
  return {
    code,
    name: `Station ${code}`,
    arrivalTime: null,
    departureTime: null,
    haltTime: null,
    distance: null,
    dayCount: 1,
    serialNumber: null,
    boardingDisabled: false,
    status: "ACTIVE",
  };
}

export function journey(codes: readonly string[]): Journey {
  return {
    trainNo: "00000",
    trainName: "TEST",
    from: codes[0] ?? null,
    to: codes[codes.length - 1] ?? null,
    boardingStation: codes[0] ?? null,
    journeyDate: "2026-09-24",
    stations: codes.map(station),
    coaches: [],
    remote: null,
    nextRemote: null,
    avlRemoteForBooking: null,
    chart: {
      trainStartDate: "2026-09-24",
      remoteLocationChartDate: null,
      chartOneDate: "2026-09-23 20:40:27",
      chartTwoDate: null,
      destinationStation: null,
    },
  };
}