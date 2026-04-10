import type { LiveMatch } from "@/types/live-matches";

/**
 * API-Football `status.short` values that are not in play. The live feed is usually `fixtures?live=all`,
 * but cached or edge payloads can include finished fixtures — those must not receive BET signals.
 */
const NOT_IN_PLAY = new Set([
  "FT",
  "AET",
  "PEN",
  "NS",
  "TBD",
  "PST",
  "CANC",
  "ABD",
  "AWD",
  "WO",
  "INT",
  "SUSP",
]);

export function isLiveInPlayMatch(match: LiveMatch): boolean {
  const s = (match.status ?? "").trim().toUpperCase();
  if (!s) return false;
  return !NOT_IN_PLAY.has(s);
}
