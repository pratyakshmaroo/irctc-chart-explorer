export interface StationOption {
  code: string;
  name: string;
  boardingDisabled?: boolean;
}

export interface RouteNode {
  code: string;
  name: string;
  boardingDisabled?: boolean;
  arrivalTime?: string | null;
  departureTime?: string | null;
  distance?: string | null;
  dayCount?: number | null;
}

export type ChartStatus = "prepared" | "pending" | "unknown";

export interface JourneySummary {
  trainNo: string;
  trainName: string | null;
  journeyDate: string;
  boardingStation: string | null;
  chartStatus: ChartStatus;
  chartingStation: string | null;
}

export interface CoachSummary {
  coachKey: string;
  coachName: string;
  classCode: string;
  available: number;
  total: number;
}

/** The forward From → To journey plus class the availability query is about. */
export interface SegmentSelection {
  from: string;
  to: string;
  cls: string;
}

export interface BerthRow {
  id: string;
  coachName: string;
  classCode: string;
  berthNo: number;
  berthType: string;
  from: string;
  to: string;
  fromName: string;
  toName: string;
}

export interface BoardingComparison {
  fromStation: string;
  fromName: string;
  availableCount: number;
  totalBerths: number;
  coachesCovered: number;
}

export type PageSize = 10 | 25 | 50 | 100 | "All";

export const PAGE_SIZE_OPTIONS: readonly PageSize[] = [
  10, 25, 50, 100, "All",
];

export const BERTH_TYPE_LABELS: Record<string, string> = {
  L: "Lower",
  U: "Upper",
  MB: "Middle",
  SL: "Side lower",
  SU: "Side upper",
  R: "Side berth",
  P: "Side berth",
};