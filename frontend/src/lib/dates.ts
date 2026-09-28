import { format, parseISO } from "date-fns";

export function isoDateOf(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function formatJourneyDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return format(parseISO(iso), "dd MMM yyyy");
}
