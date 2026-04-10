import { fetchLiveFixturesPayload, normalizeLiveFixtures } from "@/lib/server/api-football-live";

/**
 * Thin wrapper for API-Football `fixtures?live=all` (used by tests or cron jobs).
 * Production UI should call `GET /api/live-matches` which uses the shared 10-minute server cache.
 */
export async function fetchLiveMatchesRaw(apiKey: string) {
  const payload = await fetchLiveFixturesPayload(apiKey);
  if (!payload) return [];
  return normalizeLiveFixtures(payload);
}
