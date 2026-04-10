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

/** Maps a 0–100 confidence score to LOW / MEDIUM / HIGH risk (used for aggregate and per-strategy rows). */
export function riskLevelFromConfidence(confidence: number): EngineDecision["riskLevel"] {
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
    riskLevel: riskLevelFromConfidence(confidence),
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

export type DecisionFirstEngineDecision = {
  match: string;
  decision: "BET" | "CAUTION" | "NO BET";
  confidence: number;
  topStrategies: string[];
  reason: string;
  color: "green" | "yellow" | "red";
  raw: EngineDecision;
};

function riskWeight(level: EngineDecision["riskLevel"]) {
  if (level === "LOW") return 1.0;
  if (level === "MEDIUM") return 0.7;
  return 0.4;
}

function toDecisionFirstDecision(raw: EngineDecision): DecisionFirstEngineDecision {
  // 1) Filter strategies by confidence >= 65.
  const filtered = raw.strategyBreakdown.filter((row) => row.confidence >= 65);
  const scoredRows = filtered.map((row) => {
    const level = riskLevelFromConfidence(row.confidence);
    const effectiveWeight = riskWeight(level) * (row.weight > 0 ? row.weight : 1);
    return {
      strategy: row.strategy,
      confidence: row.confidence,
      level,
      effectiveWeight,
    };
  });

  // 2/3) Risk weighting + weighted average score.
  const denominator = scoredRows.reduce((sum, row) => sum + row.effectiveWeight, 0);
  const weightedScore =
    denominator > 0
      ? scoredRows.reduce((sum, row) => sum + row.confidence * row.effectiveWeight, 0) / denominator
      : raw.confidence;
  const confidence = Number(clamp(weightedScore).toFixed(1));

  // 4) Decision rules.
  const hasLowRisk = scoredRows.some((row) => row.level === "LOW");
  let decision: DecisionFirstEngineDecision["decision"] = "NO BET";
  let color: DecisionFirstEngineDecision["color"] = "red";
  if (confidence >= 80 && hasLowRisk) {
    decision = "BET";
    color = "green";
  } else if (confidence >= 65) {
    decision = "CAUTION";
    color = "yellow";
  }

  const strongest = [...scoredRows]
    .sort((a, b) => b.confidence * b.effectiveWeight - a.confidence * a.effectiveWeight)
    .slice(0, 2)
    .map((row) => row.strategy.replace(/_/g, " "));

  const reason =
    decision === "BET"
      ? `${strongest.join(", ")} lead with weighted support and at least one low-risk setup.`
      : decision === "CAUTION"
        ? `${strongest.join(", ")} show partial alignment; edge exists but risk is elevated.`
        : filtered.length === 0
          ? "No strategy cleared the 65% confidence filter."
          : "Weighted confidence remains below actionable threshold.";

  return {
    match: raw.match,
    decision,
    confidence,
    topStrategies: strongest,
    reason,
    color,
    raw,
  };
}

export function evaluateMatchesDecisionFirst(
  matches: MatchAnalyticsInput[],
  profileArg?: LearningProfile,
): DecisionFirstEngineDecision[] {
  return evaluateMatches(matches, profileArg).map(toDecisionFirstDecision);
}
