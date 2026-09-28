import { useCallback, useEffect, useState } from "react";

import { ApiError, getCross, isAbortError } from "@/lib/api.ts";
import type { CrossResult } from "@/lib/api.ts";
import { describeError, isSessionExpired } from "@/lib/errors.ts";

interface UseCrossOptions {
  sessionKey: string | undefined;
  classCode: string;
  /** Called when the backend reports the chart session is gone. */
  onSessionExpired: () => void;
}

/**
 * Owns the cross-boarding comparison: the destination being compared and the
 * per-boarding-station berth counts for it.
 */
export function useCross({
  sessionKey,
  classCode,
  onSessionExpired,
}: UseCrossOptions) {
  const [destination, setDestinationState] = useState("");
  const [result, setResult] = useState<CrossResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  const ready = Boolean(sessionKey && destination && classCode);

  const setDestination = useCallback(
    (value: string) => {
      setDestinationState(value);
      setResult(null);
      setError(null);
      setProgress(null);
      setLoading(Boolean(sessionKey && value && classCode));
    },
    [sessionKey, classCode],
  );

  const reset = useCallback(() => {
    setDestinationState("");
    setResult(null);
    setLoading(false);
    setProgress(null);
    setError(null);
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!sessionKey || !destination || !classCode) {
      setResult(null);
      setLoading(false);
      setProgress(null);
      setError(null);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setResult(null);
    setProgress(null);
    setError(null);

    getCross(
      {
        key: sessionKey,
        dest: destination,
        classCode,
        onProgress: (done, total) => {
          if (active) setProgress({ done, total });
        },
      },
      controller.signal,
    )
      .then((res) => {
        if (!active) return;
        setResult(res);
        setLoading(false);
        setProgress(null);
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
        setProgress(null);
      });

    return () => {
      active = false;
      controller.abort();
    };
    // `onSessionExpired` is intentionally omitted: it only calls setters, so the
    // captured copy is always equivalent, and listing it would re-fire the query
    // on every render.
  }, [sessionKey, destination, classCode, attempt, onSessionExpired]);

  return { destination, setDestination, result, loading, progress, error, ready, reset, retry };
}
