export interface Station {
  code: string;
  name: string;
  arrivalTime: string | null;
  departureTime: string | null;
  haltTime: string | null;
  distance: string | null;
  dayCount: number | null;
  serialNumber: number | null;
  boardingDisabled: boolean;
  status: string | null;
}

export interface Coach {
  name: string;
  classCode: string;
  positionFromEngine: number | null;
  vacantBerths: number | null;
}

export interface ChartInfo {
  trainStartDate: string | null;
  remoteLocationChartDate: string | null;
  chartOneDate: string | null;
  chartTwoDate: string | null;
  destinationStation: string | null;
}

export interface Journey {
  trainNo: string;
  trainName: string | null;
  from: string | null;
  to: string | null;
  boardingStation: string | null;
  journeyDate: string;
  stations: Station[];
  coaches: Coach[];
  remote: string | null;
  nextRemote: string | null;
  avlRemoteForBooking: string | null;
  chart: ChartInfo;
}

export interface CoachVacancyRow {
  coachName: string;
  cabinCoupe: string | null;
  cabinCoupeNo: string | null;
  berthCode: string;
  berthNumber: number;
  from: string;
  to: string;
  splitNo: number | null;
}

export interface ClassVacancy {
  cls: string;
  chartType: number;
  rows: CoachVacancyRow[];
}

export interface BookingSegment {
  splitNo: number | null;
  from: string;
  to: string;
  quota: string | null;
  occupancy: boolean | null;
}

export interface Berth {
  berthNo: number;
  berthCode: string;
  cabinCoupe: string | null;
  cabinCoupeNameNo: string | null;
  from: string;
  to: string;
  segments: BookingSegment[];
  enabled: boolean | null;
}

export interface CoachComposition {
  coachName: string;
  cls: string;
  berths: Berth[];
}

export interface AvailabilityInterval {
  from: string;
  to: string;
}

export interface AvailableBerthRow {
  coachName: string;
  classCode: string;
  berthNo: number;
  berthCode: string;
  enabled: boolean | null;
  available: boolean;
  reason?: string;
  requestedFrom: string;
  requestedTo: string;
  availabilityWindow: AvailabilityInterval | null;
  occupiedSegments: BookingSegment[];
  freeSegments: BookingSegment[];
}

export interface CoachAvailability {
  coachName: string;
  classCode: string;
  coachKey: string;
  fromStation: string;
  toStation: string;
  /** Only the available berths, in route order. */
  result: AvailableBerthRow[];
  availableCount: number;
  /** Every berth evaluated in this coach, available or not. */
  totalBerths: number;
}

/** A berth that can't cover the whole trip but is free for parts of it. */
export interface PartialBerth {
  coachName: string;
  classCode: string;
  berthNo: number;
  berthCode: string;
  windows: AvailabilityInterval[];
}

export interface ClassAvailability {
  classCode: string;
  fromStation: string;
  toStation: string;
  /** One entry per composition, including coaches with nothing available. */
  coaches: CoachAvailability[];
  availableCount: number;
  /** Every berth evaluated across the class, available or not. */
  totalBerths: number;
  /** Berths free for part of the trip, longest coverage first. */
  partials: PartialBerth[];
}

export interface CrossBoardingResult {
  fromStation: string;
  toStation: string;
  availableCount: number;
  totalBerthsEvaluated: number;
  coachesCovered: number;
  availableBerths: AvailableBerthRow[];
}