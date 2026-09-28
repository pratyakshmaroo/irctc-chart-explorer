import { ApiError } from "@/lib/api.ts";

/** True when the chart session behind the request is gone and must be re-opened. */
export function isSessionExpired(error: unknown): error is ApiError {
  return error instanceof ApiError && error.kind === "session";
}

/** Turns any thrown value into copy a passenger can act on. */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Unexpected error. Try again.";

  switch (error.kind) {
    case "chart":
      return "This train/date does not have a usable chart yet. Try again later or choose another date.";
    case "rate-limit":
      return "The chart service is rate-limiting requests. Wait a moment and retry.";
    case "blocked":
      return "The chart service is temporarily blocking this request. Try again later.";
    case "network":
      return "Could not reach IRCTC. Check your internet, then retry.";
    case "upstream":
      return error.status && error.status !== 502
        ? `IRCTC's chart service is temporarily unavailable (HTTP ${error.status}). It is usually transient — retry in a minute.`
        : "IRCTC's chart service is temporarily unavailable. It is usually transient — retry in a minute.";
    case "malformed":
      return "The chart service returned unexpected data. Try again later.";
    case "http":
      return error.status
        ? `The chart service returned HTTP ${error.status}. Try again later.`
        : "The chart service returned an HTTP error. Try again later.";
    case "internal":
      return "The chart service hit an unexpected error. Try again.";
    case "session":
      return "This chart session is no longer loaded. Search the train again.";
    case "usage":
      return error.message;
  }
}
