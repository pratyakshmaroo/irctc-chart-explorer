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
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  const ready = Boolean(sessionKey && destination && classCode);

  const setDestination = useCallback(
    (value: string) => {
      setDestinationState(value);
      setResult(null);
      setError(null);
      setLoading(Boolean(sessionKey && value && classCode));
    },
    [sessionKey, classCode],
  );

  const reset = useCallback(() => {
    setDestinationState("");
    setResult(null);
    setLoading(false);
    setError(null);
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!sessionKey || !destination || !classCode) {
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

    getCross({ key: sessionKey, dest: destination, classCode }, controller.signal)
      .then((res) => {
        if (!active) return;
        setResult(res);
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
  }, [sessionKey, destination, classCode, attempt, onSessionExpired]);

  return { destination, setDestination, result, loading, error, ready, reset, retry };
}
