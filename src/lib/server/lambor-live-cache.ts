import type { LiveMatch } from "@/types/live-matches";

import {
  enrichMatchesWithRotatingStats,
  fetchLiveFixturesPayload,
  normalizeLiveFixtures,
  type FixtureStats,
  fetchFixtureStats,
} from "@/lib/server/api-football-live";

type GlobalLive = typeof globalThis & {
  __lamborLiveMatchesCache?: LiveMatch[];
  __lamborLiveFetchedAt?: number;
  __lamborLiveRotation?: number;
  __lamborLiveStatsByFixtureId?: Map<number, FixtureStats>;
  __lamborLiveInflight?: Promise<{
    matches: LiveMatch[];
    degraded: boolean;
    warning?: string;
    lastUpdated: number;
  }>;
  /** Last time upstream returned zero live fixtures (optional backoff). */
  __lamborLiveLastEmptyAt?: number;
};

/** API-Football live=all refresh interval — all users share this server cache. */
const TTL_MS = 10 * 60 * 1000;

const EMPTY_BACKOFF_MS = 15 * 60 * 1000;

export async function getLiveMatchesWithCache(apiKey: string): Promise<{
  matches: LiveMatch[];
  degraded: boolean;
  warning?: string;
  lastUpdated: number;
}> {
  const g = globalThis as GlobalLive;
  const now = Date.now();

  if (g.__lamborLiveMatchesCache && g.__lamborLiveFetchedAt && now - g.__lamborLiveFetchedAt < TTL_MS) {
    return { matches: g.__lamborLiveMatchesCache, degraded: false, lastUpdated: g.__lamborLiveFetchedAt };
  }

  if (
    g.__lamborLiveLastEmptyAt &&
    now - g.__lamborLiveLastEmptyAt < EMPTY_BACKOFF_MS &&
    (g.__lamborLiveMatchesCache?.length ?? 0) === 0
  ) {
    return {
      matches: [],
      degraded: false,
      lastUpdated: g.__lamborLiveFetchedAt ?? g.__lamborLiveLastEmptyAt,
    };
  }

  if (g.__lamborLiveInflight) return g.__lamborLiveInflight;

  g.__lamborLiveInflight = (async () => {
    try {
      const payload = await fetchLiveFixturesPayload(apiKey);
      if (!payload) {
        const fallback = g.__lamborLiveMatchesCache ?? [];
        return {
          matches: fallback,
          degraded: true,
          warning: "Live provider unreachable; returning last known snapshot.",
          lastUpdated: g.__lamborLiveFetchedAt ?? now,
        };
      }

      const baseMatches = normalizeLiveFixtures(payload);
      if (baseMatches.length === 0) {
        g.__lamborLiveLastEmptyAt = Date.now();
        g.__lamborLiveFetchedAt = Date.now();
        g.__lamborLiveMatchesCache = [];
        return { matches: [], degraded: false, lastUpdated: g.__lamborLiveFetchedAt };
      }

      const prevStats = g.__lamborLiveStatsByFixtureId ?? new Map<number, FixtureStats>();
      const rotationCursor = g.__lamborLiveRotation ?? 0;

      const { matches, nextCursor, statsMap } = await enrichMatchesWithRotatingStats(
        baseMatches,
        apiKey,
        rotationCursor,
        prevStats,
      );

      g.__lamborLiveRotation = nextCursor;
      g.__lamborLiveStatsByFixtureId = statsMap;
      g.__lamborLiveMatchesCache = matches;
      g.__lamborLiveFetchedAt = Date.now();

      return { matches, degraded: false, lastUpdated: g.__lamborLiveFetchedAt };
    } catch {
      const fallback = g.__lamborLiveMatchesCache ?? [];
      return {
        matches: fallback,
        degraded: true,
        warning: "Live feed error; returning last known snapshot.",
        lastUpdated: g.__lamborLiveFetchedAt ?? now,
      };
    } finally {
      g.__lamborLiveInflight = undefined;
    }
  })();

  return g.__lamborLiveInflight;
}

/** Resolve a fixture from the warm cache only (no extra API-Football calls). */
export function getLiveMatchFromWarmCache(id: number): LiveMatch | null {
  const g = globalThis as GlobalLive;
  const list = g.__lamborLiveMatchesCache;
  if (!list) return null;
  return list.find((m) => m.id === id) ?? null;
}

/**
 * Load a single fixture from API-Football (used when /api/match/:id is requested for an id not in cache).
 * Costs 1 (+1 optional stats) request — prefer warm cache for hot paths.
 */
export async function fetchSingleLiveMatch(apiKey: string, id: number): Promise<LiveMatch | null> {
  try {
    const res = await fetch(`https://v3.football.api-sports.io/fixtures?id=${id}`, {
      headers: { "x-apisports-key": apiKey },
      cache: "no-store",
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as Parameters<typeof normalizeLiveFixtures>[0];
    const list = normalizeLiveFixtures(payload);
    const base = list[0];
    if (!base) return null;
    const stats = await fetchFixtureStats(id, apiKey);
    return { ...base, ...stats };
  } catch {
    return null;
  }
}
