import type { LiveMatch } from "@/types/live-matches";

import type { MatchFeatures } from "./types";

function parseScore(score: string): { home: number; away: number } {
  const [a, b] = score.split("-").map((p) => Number.parseInt(p.trim(), 10));
  return {
    home: Number.isFinite(a) ? a : 0,
    away: Number.isFinite(b) ? b : 0,
  };
}

/** Rough xG proxy when API-Football does not expose expected goals. */
function estimateXg(shotsOnTarget: number, totalShots: number): number {
  return Math.min(4.5, shotsOnTarget * 0.11 + totalShots * 0.028);
}

export function buildMatchFeatures(match: LiveMatch, oddsCurrent: number, oddsOpen: number): MatchFeatures {
  const { home, away } = parseScore(match.score);
  const sotH = match.shotsOnTargetHome ?? 0;
  const sotA = match.shotsOnTargetAway ?? 0;
  const tsH = match.totalShotsHome ?? sotH * 2;
  const tsA = match.totalShotsAway ?? sotA * 2;
  const homeXg = estimateXg(sotH, tsH);
  const awayXg = estimateXg(sotA, tsA);

  return {
    minute: match.minute ?? 0,
    scoreHome: home,
    scoreAway: away,
    totalGoals: home + away,
    homeXg,
    awayXg,
    totalXg: homeXg + awayXg,
    shotsOnTargetHome: sotH,
    shotsOnTargetAway: sotA,
    totalShotsHome: tsH,
    totalShotsAway: tsA,
    possessionHome: match.possessionHome ?? 50,
    possessionAway: match.possessionAway ?? 50,
    attacksHome: match.attacksHome ?? 0,
    attacksAway: match.attacksAway ?? 0,
    dangerousAttacksHome: match.dangerousAttacksHome ?? 0,
    dangerousAttacksAway: match.dangerousAttacksAway ?? 0,
    redCardsHome: match.redCardsHome ?? 0,
    redCardsAway: match.redCardsAway ?? 0,
    oddsOpen,
    oddsCurrent,
    oddsChange: oddsOpen - oddsCurrent,
  };
}
