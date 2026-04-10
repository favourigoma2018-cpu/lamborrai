import type { MatchAnalyticsInput } from "@/lib/lambor-ai/types";
import type { LiveMatch } from "@/types/live-matches";

function parseScore(score: string) {
  const [homeRaw, awayRaw] = score.split("-").map((part) => Number.parseInt(part.trim(), 10));
  return {
    homeGoals: Number.isFinite(homeRaw) ? homeRaw : 0,
    awayGoals: Number.isFinite(awayRaw) ? awayRaw : 0,
  };
}

/** Maps API-Football live row + stats into the Lambor strategy engine input shape. */
export function liveMatchToAnalyticsInput(match: LiveMatch): MatchAnalyticsInput {
  const { homeGoals, awayGoals } = parseScore(match.score);
  const minute = match.minute ?? 0;
  const baselinePressure = Math.max(2, Math.floor(minute / 10));
  return {
    ...match,
    homeGoals,
    awayGoals,
    shotsOnTargetHome: match.shotsOnTargetHome ?? homeGoals + baselinePressure,
    shotsOnTargetAway: match.shotsOnTargetAway ?? awayGoals + Math.max(1, baselinePressure - 1),
    totalShotsHome: match.totalShotsHome ?? homeGoals * 2 + baselinePressure * 2,
    totalShotsAway: match.totalShotsAway ?? awayGoals * 2 + baselinePressure * 2 - 1,
    attacksHome: match.attacksHome ?? baselinePressure * 5,
    attacksAway: match.attacksAway ?? baselinePressure * 5,
    dangerousAttacksHome: match.dangerousAttacksHome ?? baselinePressure * 2,
    dangerousAttacksAway: match.dangerousAttacksAway ?? baselinePressure * 2,
    possessionHome: match.possessionHome ?? 50,
    possessionAway: match.possessionAway ?? 50,
    redCardsHome: match.redCardsHome ?? 0,
    redCardsAway: match.redCardsAway ?? 0,
    favoriteOdds: 1.55,
  };
}
