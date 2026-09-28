import { useCallback, useEffect, useState } from "react";

import { ApiError, getAvailability, isAbortError } from "@/lib/api.ts";
import type { AvailabilityResult } from "@/lib/api.ts";
import { describeError, isSessionExpired } from "@/lib/errors.ts";
import type { PageSize, SegmentSelection } from "@/lib/types.ts";

const EMPTY_SEGMENT: SegmentSelection = { from: "", to: "", cls: "" };

/** A segment is queryable only once origin, destination and class are all set. */
function isComplete(segment: SegmentSelection | null): segment is SegmentSelection {
  return Boolean(segment?.from && segment.to && segment.cls);
}

export interface AvailabilityChange {
  segment?: Partial<SegmentSelection>;
  coach?: string | null;
  page?: number;
  pageSize?: PageSize;
}

interface UseAvailabilityOptions {
  sessionKey: string | undefined;
  /** Called when the backend reports the chart session is gone. */
  onSessionExpired: () => void;
}

/**
 * Owns the availability query: what the passenger selected (segment, coach,
 * page, page size) and the rows that selection produced. Every selection change
 * invalidates the current result, so the sections below can never show rows
 * that belong to a previous selection.
 */
export function useAvailability({
  sessionKey,
  onSessionExpired,
}: UseAvailabilityOptions) {
  const [segment, setSegment] = useState<SegmentSelection | null>(null);
  const [coach, setCoach] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // Drives the request, kept separate from `page` so that the server correcting
  // an out-of-range page can move the pager without re-requesting rows we hold.
  const [pageRequest, setPageRequest] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [result, setResult] = useState<AvailabilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  const ready = Boolean(sessionKey) && isComplete(segment);

  /**
   * The single entry point for every selection change. It applies the change,
   * returns to page 1, drops the previous rows and seeds the loading flag so the
   * sections below do not flash an empty state in the render that precedes the
   * effect.
   */
  const patch = useCallback(
    (change: AvailabilityChange) => {
      const nextSegment = change.segment
        ? { ...EMPTY_SEGMENT, ...segment, ...change.segment }
        : segment;
      const nextPage = change.page ?? 1;

      if (change.segment) setSegment(nextSegment);
      if ("coach" in change) setCoach(change.coach ?? null);
      setPage(nextPage);
      setPageRequest(nextPage);
      if (change.pageSize !== undefined) setPageSize(change.pageSize);
      setResult(null);
      setError(null);
      setLoading(Boolean(sessionKey) && isComplete(nextSegment));
    },
    [segment, sessionKey],
  );

  /** Full teardown for a new search or a lost session. Keeps the page size. */
  const reset = useCallback(() => {
    setSegment(null);
    setCoach(null);
    setPage(1);
    setPageRequest(1);
    setResult(null);
    setLoading(false);
    setError(null);
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!sessionKey || !isComplete(segment)) {
      setResult(null);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setResult(null);
    setError(null);

    getAvailability(
      {
        key: sessionKey,
        from: segment.from,
        to: segment.to,
        classCode: segment.cls,
        coach,
        page: pageRequest,
        size: pageSize,
      },
      controller.signal,
    )
      .then((res) => {
        if (!active) return;
        setResult(res);
        // Display-only correction: `pageRequest` is deliberately untouched so a
        // clamped response cannot re-fire this effect for rows we already hold.
        // The functional form keeps the current value out of this closure.
        setPage((current) =>
          current === res.pagination.page ? current : res.pagination.page,
        );
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active || isAbortError(cause)) return;
        if (isSessionExpired(cause)) {
          onSessionExpired();
          return;
        }
        setError(
          cause instanceof ApiError ? cause : new ApiError("internal", describeError(cause)),
        );
        setResult(null);
        setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
    // `onSessionExpired` is intentionally omitted: it only calls setters, so the
    // captured copy is always equivalent, and listing it would re-fire the query
    // on every render.
  }, [sessionKey, segment, coach, pageRequest, pageSize, attempt, onSessionExpired]);

  return {
    segment,
    coach,
    page,
    pageSize,
    result,
    loading,
    error,
    ready,
    patch,
    reset,
    retry,
  };
}
