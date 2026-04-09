import { calculateStrategyHealth, createDefaultProfile } from "@/lib/lambor-ai/learning";
import { strategyEvaluators } from "@/lib/lambor-ai/strategies";
import type { EngineDecision, LearningProfile, MatchAnalyticsInput, StrategyName, StrategyResult } from "@/lib/lambor-ai/types";

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function weightedAverage(items: StrategyResult[]) {
  const denominator = items.reduce((sum, item) => sum + item.weight, 0);
  if (denominator <= 0) return 0;
  return items.reduce((sum, item) => sum + item.confidence * item.weight, 0) / denominator;
}

function applyPenalties(match: MatchAnalyticsInput, profile: LearningProfile, strategies: StrategyResult[]) {
  let penalty = 0;

  const volatility = Math.abs(match.homeGoals - match.awayGoals) >= 2 && (match.minute ?? 0) < 55;
  if (volatility) penalty += 7;

  const redCards = (match.redCardsHome ?? 0) + (match.redCardsAway ?? 0);
  if (redCards >= 2) penalty += 8;
  else if (redCards === 1) penalty += 4;

  const totalShots = (match.totalShotsHome ?? 0) + (match.totalShotsAway ?? 0);
  const totalSot = (match.shotsOnTargetHome ?? 0) + (match.shotsOnTargetAway ?? 0);
  if (totalShots > 0 && totalSot / totalShots > 0.7) penalty += 6;

  const top = [...strategies].sort((a, b) => b.confidence - a.confidence)[0];
  if (top) {
    const health = calculateStrategyHealth(profile, top.strategy);
    if (health.recentLosses >= 3) penalty += 6;
    if (health.winRate < 0.45 && health.total >= 6) penalty += 5;
  }

  return penalty;
}

function tagConfidence(confidence: number): EngineDecision["tag"] {
  if (confidence >= 85) return "HIGH CONFIDENCE";
  if (confidence >= 70) return "MEDIUM";
  return "LOW";
}

function riskFromConfidence(confidence: number): EngineDecision["riskLevel"] {
  if (confidence >= 85) return "LOW";
  if (confidence >= 70) return "MEDIUM";
  return "HIGH";
}

export function evaluateMatch(
  match: MatchAnalyticsInput,
  profileArg?: LearningProfile,
): EngineDecision {
  const profile = profileArg ?? createDefaultProfile();
  const strategyResults = (Object.keys(strategyEvaluators) as StrategyName[]).map((name) =>
    strategyEvaluators[name](match, profile.strategyWeights[name] ?? 1),
  );

  const deadGame = strategyResults.find((item) => item.strategy === "DEAD_GAME_FILTER");
  const deadGameNoBet = Boolean(deadGame && deadGame.confidence >= 85);

  const penalty = applyPenalties(match, profile, strategyResults);
  const healthAdjusted = strategyResults.map((item) => {
    const health = calculateStrategyHealth(profile, item.strategy);
    let adjustment = 0;
    if (health.total >= 4 && health.winRate >= 0.6) adjustment += 2;
    if (health.total >= 4 && health.winRate < 0.45) adjustment -= 3;
    return { ...item, confidence: clamp(item.confidence + adjustment) };
  });
  const adjustedConfidence = clamp(weightedAverage(healthAdjusted) - penalty);

  const topStrategy = [...healthAdjusted].sort((a, b) => b.confidence - a.confidence)[0];
  const threshold = profile.threshold ?? 80;
  const confidence = deadGameNoBet ? Math.min(adjustedConfidence, 69) : adjustedConfidence;
  const decision: EngineDecision["decision"] = confidence >= threshold ? "BET" : "NO_BET";

  return {
    match: `${match.homeTeam} vs ${match.awayTeam}`,
    strategyUsed: topStrategy?.strategy ?? "DRAW_STABILITY",
    confidence: Number(confidence.toFixed(1)),
    decision,
    tag: tagConfidence(confidence),
    riskLevel: riskFromConfidence(confidence),
    reasoning:
      decision === "BET"
        ? `${topStrategy?.strategy ?? "Top strategy"} aligned with current tempo; confidence cleared ${threshold}%.`
        : deadGameNoBet
          ? "Dead Game Filter blocked entry due to low activity profile."
          : `Signals are mixed after penalties; confidence below ${threshold}%.`,
    strategyBreakdown: healthAdjusted,
  };
}

export function evaluateMatches(matches: MatchAnalyticsInput[], profileArg?: LearningProfile) {
  return matches.map((match) => evaluateMatch(match, profileArg));
}
