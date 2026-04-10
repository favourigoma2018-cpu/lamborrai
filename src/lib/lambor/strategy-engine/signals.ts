import type { LiveMatch } from "@/types/live-matches";

import { buildMatchFeatures } from "./features";
import type { GlobalSignals, OddsTrend, StrategyEngineContext } from "./types";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function oddsTrend(change: number): OddsTrend {
  if (change > 0.05) return "decreasing";
  if (change < -0.05) return "increasing";
  return "stable";
}

export function buildGlobalSignals(match: LiveMatch, ctx: StrategyEngineContext): GlobalSignals {
  const oddsStr = ctx.getOddsForMatch(match);
  const current = Number.parseFloat(oddsStr);
  const oddsCurrent = Number.isFinite(current) && current > 1 ? current : 1.75;
  const openStored = ctx.oddsOpenByMatchId?.get(match.id);
  const oddsOpen =
    typeof openStored === "number" && Number.isFinite(openStored) && openStored > 1 ? openStored : oddsCurrent * 1.03;

  const f = buildMatchFeatures(match, oddsCurrent, oddsOpen);

  const shotsOnTargetTotal = f.shotsOnTargetHome + f.shotsOnTargetAway;
  const totalShotsTotal = f.totalShotsHome + f.totalShotsAway;
  const attacksTotal = f.attacksHome + f.attacksAway;
  const dangerousTotal = f.dangerousAttacksHome + f.dangerousAttacksAway;
  const redTotal = f.redCardsHome + f.redCardsAway;

  const minute = Math.max(1, f.minute || 1);
  const phaseFactor = 1 + (90 - Math.min(90, minute)) / 90;
  const recentMomentum = clamp((dangerousTotal * 0.35 + shotsOnTargetTotal * 0.4) / phaseFactor, 0, 100);

  const gamePace = clamp(100 - (totalShotsTotal / 28) * 100, 0, 100);
  const shotIntensity = clamp((shotsOnTargetTotal / 14) * 100, 0, 100);
  const attackingPressure = clamp((dangerousTotal / 45) * 100, 0, 100);
  const late = minute >= 70 ? 1 : 0;
  const calm = 100 - attackingPressure;
  const timeDecayStability = clamp(calm * (0.55 + late * 0.35) + (redTotal > 0 ? -8 : 0), 0, 100);

  return {
    minute: f.minute,
    score: match.score,
    totalGoals: f.totalGoals,
    shotsOnTargetTotal,
    totalShotsTotal,
    possessionHome: f.possessionHome,
    possessionAway: f.possessionAway,
    attacksTotal,
    dangerousAttacksTotal: dangerousTotal,
    recentMomentum,
    redCardsTotal: redTotal,
    oddsMovement: {
      open: oddsOpen,
      current: oddsCurrent,
      change: f.oddsChange,
      trend: oddsTrend(f.oddsChange),
    },
    gamePace,
    shotIntensity,
    attackingPressure,
    timeDecayStability,
  };
}
