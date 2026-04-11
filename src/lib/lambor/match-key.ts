import type { LiveMatch } from "@/types/live-matches";

export function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(fc|cf|sc|ac|club|deportivo|sporting)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stable key for one fixture on the slip (one leg per match). */
export function matchKeyFromLive(match: LiveMatch) {
  return `${normalizeName(match.homeTeam)}__${normalizeName(match.awayTeam)}`;
}
