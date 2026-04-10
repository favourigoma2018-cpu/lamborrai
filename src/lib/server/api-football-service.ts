/**
 * API-Football access for Lambor is centralized on the server with caching.
 *
 * - Live list: `getLiveMatchesWithCache` in `lambor-live-cache` (TTL + rotating stats)
 * - HTTP entry: `GET /api/live-matches`
 *
 * Do not call api-sports.io from the browser; use those routes only.
 */
export { getLiveMatchesWithCache } from "@/lib/server/lambor-live-cache";
