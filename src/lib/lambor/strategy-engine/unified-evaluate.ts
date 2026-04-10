import { evaluateMatch } from "@/lib/lambor-ai/engine";
import { liveMatchToAnalyticsInput } from "@/lib/lambor/live-match-analytics";
import type { LiveMatch } from "@/types/live-matches";

import { buildMatchFeatures } from "./features";
import { buildGlobalSignals } from "./signals";
import { computeMomentumScore } from "./momentum";
import type { RiskTier, StrategyEngineContext, UnifiedDecision, UnifiedEvaluation } from "./types";

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function riskFromConfidence(c: number): RiskTier {
  if (c >= 85) return "LOW";
  if (c >= 70) return "MEDIUM";
  return "HIGH";
}

function labelFromDecision(d: UnifiedDecision): UnifiedEvaluation["label"] {
  if (d === "BET") return "HIGH CONFIDENCE";
  if (d === "WATCH") return "MEDIUM";
  return "RISKY";
}

function tierDecision(confidence: number): UnifiedDecision {
  if (confidence >= 80) return "BET";
  if (confidence >= 60) return "WATCH";
  return "NO_BET";
}

function xgScoreForContext(totalXg: number, wantLowXg: boolean): number {
  const t = clamp(totalXg / 3.5, 0, 1);
  return wantLowXg ? (1 - t) * 100 : t * 100;
}

function oddsSignalScore(change: number): number {
  const s = clamp(change * 80 + 50, 0, 100);
  return s;
}

/**
 * Master blend: strategy engine + momentum + xG + odds + optional learning boost.
 * `wantLowXg` biases xG component toward low totals (under-style strategies).
 */
export function evaluateMatchUnified(
  match: LiveMatch,
  ctx: StrategyEngineContext,
  options?: { wantLowXg?: boolean; learningBoost?: number },
): UnifiedEvaluation {
  const oddsStr = ctx.getOddsForMatch(match);
  const current = Number.parseFloat(oddsStr);
  const oddsCurrent = Number.isFinite(current) && current > 1 ? current : 1.75;
  const openStored = ctx.oddsOpenByMatchId?.get(match.id);
  const oddsOpen =
    typeof openStored === "number" && Number.isFinite(openStored) && openStored > 1 ? openStored : oddsCurrent * 1.03;

  const input = liveMatchToAnalyticsInput(match);
  const engine = evaluateMatch(input, ctx.profile);
  const strategyScore = engine.confidence;

  const features = buildMatchFeatures(match, oddsCurrent, oddsOpen);
  const signals = buildGlobalSignals(match, ctx);
  const momentumScore = computeMomentumScore(features);

  const wantLowXg = options?.wantLowXg ?? true;
  const xgScore = xgScoreForContext(features.totalXg, wantLowXg);
  const oddsScore = oddsSignalScore(features.oddsChange);

  let confidence =
    strategyScore * 0.4 +
    momentumScore * 0.15 +
    xgScore * 0.2 +
    oddsScore * 0.1 +
    signals.gamePace * 0.075 +
    signals.timeDecayStability * 0.075;

  confidence += options?.learningBoost ?? 0;
  confidence = clamp(confidence, 0, 100);

  const decision = tierDecision(confidence);
  let label = labelFromDecision(decision);
  if (decision === "NO_BET" && confidence < 60) label = "HIGH RISK";

  return {
    confidence: Number(confidence.toFixed(1)),
    risk: riskFromConfidence(confidence),
    decision,
    label,
    signals,
    features,
    momentumScore: Number(momentumScore.toFixed(1)),
  };
}
