/** Tiny localStorage TTL cache. Free, per-user, no server. */

interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(`irctc-cache:${key}`);
  } catch {
    return null;
  }
}

function writeRaw(key: string, raw: string): void {
  try {
    localStorage.setItem(`irctc-cache:${key}`, raw);
  } catch {
    // Quota exceeded or private mode — caching is best-effort.
  }
}

export function cacheGet<T>(key: string, ttlMs: number): T | null {
  const raw = readRaw(key);
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (typeof entry.fetchedAt !== "number") return null;
    if (Date.now() - entry.fetchedAt > ttlMs) return null;
    return entry.value;
  } catch {
    return null;
  }
}

export function cacheSet<T>(key: string, value: T): void {
  const entry: CacheEntry<T> = { value, fetchedAt: Date.now() };
  try {
    writeRaw(key, JSON.stringify(entry));
  } catch {
    // Ignore serialization/quota errors.
  }
}

export const TTL = {
  schedule: 7 * 24 * 60 * 60 * 1000,
  journey: 12 * 60 * 60 * 1000,
  coach: 2 * 60 * 60 * 1000,
};
