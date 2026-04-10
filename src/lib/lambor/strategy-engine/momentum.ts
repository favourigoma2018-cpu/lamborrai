import type { MatchFeatures } from "./types";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Momentum 0–100: dangerous attacks, SOT, possession imbalance, xG delta.
 */
export function computeMomentumScore(f: MatchFeatures): number {
  const da = f.dangerousAttacksHome + f.dangerousAttacksAway;
  const sot = f.shotsOnTargetHome + f.shotsOnTargetAway;
  const poss = Math.abs(f.possessionHome - f.possessionAway);
  const xgDelta = Math.abs(f.homeXg - f.awayXg);

  const raw = da * 0.4 + sot * 0.3 + poss * 0.15 + xgDelta * 20 * 0.15;
  return clamp(raw, 0, 100);
}
