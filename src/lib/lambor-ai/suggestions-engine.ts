import type { DecisionFirstEngineDecision } from "@/lib/lambor-ai/engine";
import { evaluateMatchesDecisionFirst } from "@/lib/lambor-ai/engine";
import { liveMatchToAnalyticsInput } from "@/lib/lambor/live-match-analytics";
import { isLiveInPlayMatch } from "@/lib/lambor-ai/live-status";
import type { LearningProfile, MatchAnalyticsInput, StrategyName } from "@/lib/lambor-ai/types";
import type { LiveMatch } from "@/types/live-matches";

/** One ranked pick for Lambor Mind (chat + JSON-style consumers). */
export type BetSuggestion = {
  match: string;
  bet: string;
  odds: number;
  confidence: number;
  strategy: string;
  explanation: string;
  /** Short list of stats that drove the read. */
  dataTriggers: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  /** Higher is better for ranking (inverse pain). */
  riskScore: number;
  /** 0–100 odds-shape score. */
  oddsQuality: number;
  /** Composite for ordering. */
  rankScore: number;
};

const STRATEGY_BET_LABEL: Partial<Record<StrategyName, string>> = {
  UNDER_2_5_HT: "Under 2.5 (first half)",
  UNDER_2_5_SECOND_HALF: "Under 2.5 (second half)",
  OVER_1_5_LATE_GOALS: "Over 1.5 / late goals",
  FAVORITE_DOMINANCE: "Favorite control",
  DRAW_STABILITY: "Draw / low variance",
  MOMENTUM_SPIKE: "Momentum continuation",
  DEAD_GAME_FILTER: "Dead game / low tempo",
  LATE_EQUALIZER: "Late equalizer risk",
  RED_CARD_EXPLOIT: "Red card dynamics",
};

function betLabelForStrategy(s: StrategyName): string {
  return STRATEGY_BET_LABEL[s] ?? s.replace(/_/g, " ").toLowerCase();
}

/** Synthetic decimal from engine confidence + live shape (no new upstream odds). */
function estimateOdds(input: MatchAnalyticsInput, confidence: number): number {
  const base = typeof input.favoriteOdds === "number" && input.favoriteOdds > 1 ? input.favoriteOdds : 1.58;
  const tilt = (confidence - 76) * 0.012;
  return Number(Math.max(1.32, Math.min(2.4, base + tilt)).toFixed(2));
}

function oddsQuality(odds: number): number {
  if (odds >= 1.45 && odds <= 1.95) return 90 - Math.abs(odds - 1.65) * 40;
  if (odds >= 1.2 && odds < 1.45) return 55;
  if (odds > 1.95 && odds <= 2.35) return 72;
  if (odds > 2.35) return 40;
  return 50;
}

function riskRankScore(level: "LOW" | "MEDIUM" | "HIGH"): number {
  if (level === "LOW") return 100;
  if (level === "MEDIUM") return 68;
  return 42;
}

function dataTriggersLine(input: MatchAnalyticsInput): string {
  const sot = (input.shotsOnTargetHome ?? 0) + (input.shotsOnTargetAway ?? 0);
  const shots = (input.totalShotsHome ?? 0) + (input.totalShotsAway ?? 0);
  const rc = (input.redCardsHome ?? 0) + (input.redCardsAway ?? 0);
  const xgProxy = ((input.shotsOnTargetHome ?? 0) * 0.11 + (input.shotsOnTargetAway ?? 0) * 0.11).toFixed(2);
  return `Minute ${input.minute ?? "—"}, score ${input.homeGoals}-${input.awayGoals}, SOT ${sot}, shots ${shots}, xG proxy ~${xgProxy}, red cards ${rc}.`;
}

function explanationFrom(card: DecisionFirstEngineDecision, input: MatchAnalyticsInput): string {
  const top = [...card.raw.strategyBreakdown]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 2)
    .map((r) => `${r.strategy.replace(/_/g, " ")} (${r.confidence.toFixed(0)}%: ${r.reasoning})`)
    .join(" ");
  return `${card.reason} Drivers: ${top || "aggregate engine read."}`;
}

function buildSuggestion(card: DecisionFirstEngineDecision, input: MatchAnalyticsInput): BetSuggestion {
  const odds = estimateOdds(input, card.confidence);
  const oq = oddsQuality(odds);
  const level = card.raw.riskLevel;
  const rs = riskRankScore(level);
  const rankScore = card.confidence * 1.15 + oq * 0.35 + rs * 0.25;
  const strategy = card.raw.strategyUsed;
  return {
    match: card.match,
    bet: betLabelForStrategy(strategy),
    odds,
    confidence: card.confidence,
    strategy: strategy.toLowerCase(),
    explanation: explanationFrom(card, input),
    dataTriggers: dataTriggersLine(input),
    riskLevel: level,
    riskScore: rs,
    oddsQuality: oq,
    rankScore,
  };
}

export type ComputeSuggestionsOptions = {
  minConfidence?: number;
  maxResults?: number;
};

/**
 * Pulls in-play rows from cached live feed, runs the full strategy stack, filters BET ≥ confidence,
 * ranks by confidence, odds quality, and risk, returns top N.
 */
export function computeSuggestions(
  cachedMatches: LiveMatch[],
  profile: LearningProfile,
  options: ComputeSuggestionsOptions = {},
): { suggestions: BetSuggestion[]; evaluatedCount: number; cacheKey: string } {
  const minConfidence = options.minConfidence ?? 70;
  const maxResults = Math.min(5, options.maxResults ?? 5);
  const inPlay = cachedMatches.filter(isLiveInPlayMatch);
  const inputs = inPlay.map(liveMatchToAnalyticsInput);
  const cards = evaluateMatchesDecisionFirst(inputs, profile);

  const cacheKey = inPlay.map((m) => `${m.id}:${m.minute ?? ""}:${m.score}`).join("|");

  const rows: BetSuggestion[] = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const input = inputs[i];
    if (!card || !input) continue;
    if (card.decision !== "BET") continue;
    if (card.confidence < minConfidence) continue;
    rows.push(buildSuggestion(card, input));
  }

  rows.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (b.oddsQuality !== a.oddsQuality) return b.oddsQuality - a.oddsQuality;
    return b.riskScore - a.riskScore;
  });

  return {
    suggestions: rows.slice(0, Math.min(rows.length, maxResults)),
    evaluatedCount: cards.length,
    cacheKey,
  };
}

export type BetQueryKind = "best" | "safe" | "combo" | "late_risk" | null;

export function classifyBetQuery(text: string): BetQueryKind {
  const q = text.toLowerCase().trim();
  if (/\b(best bet|best bets|top opportun|what should i bet|opportunities now)\b/.test(q)) return "best";
  if (/\b(safe bet|low risk|conservative|show safe)\b/.test(q)) return "safe";
  if (/\b(2\.?0 odds|two odds|combo|double)\b/.test(q)) return "combo";
  if (/\b(late goal|after 80|80\+|chaos|volatile)\b/.test(q)) return "late_risk";
  return null;
}

function isLateStructureSuggestion(s: BetSuggestion): boolean {
  const blob = `${s.strategy} ${s.bet}`.toLowerCase();
  return (
    blob.includes("late") ||
    blob.includes("second half") ||
    blob.includes("equalizer") ||
    blob.includes("over 1")
  );
}

/** Filter / rank already-computed suggestions for chat commands (no re-fetch). */
export function filterSuggestionsForQuery(kind: BetQueryKind, suggestions: BetSuggestion[]): BetSuggestion[] {
  if (!kind || suggestions.length === 0) return suggestions;
  if (kind === "best") return suggestions;
  if (kind === "safe") {
    return suggestions
      .filter((s) => s.riskLevel === "LOW")
      .sort((a, b) => b.rankScore - a.rankScore)
      .slice(0, 5);
  }
  if (kind === "combo") {
    return suggestions
      .filter((s) => s.odds >= 1.88 && s.odds <= 2.12)
      .sort((a, b) => b.oddsQuality - a.oddsQuality)
      .slice(0, 5);
  }
  if (kind === "late_risk") {
    return suggestions.filter(isLateStructureSuggestion).slice(0, 5);
  }
  return suggestions;
}

/** Serialize suggestion to example JSON shape (for debugging / future API). */
export function suggestionToExampleJson(s: BetSuggestion) {
  return {
    match: s.match,
    bet: s.bet,
    odds: s.odds,
    confidence: s.confidence,
    strategy: s.strategy,
    explanation: `${s.explanation} Data: ${s.dataTriggers}`,
  };
}

export function allDecisionCardsFromCache(
  cachedMatches: LiveMatch[],
  profile: LearningProfile,
): DecisionFirstEngineDecision[] {
  const inPlay = cachedMatches.filter(isLiveInPlayMatch);
  const inputs = inPlay.map(liveMatchToAnalyticsInput);
  return evaluateMatchesDecisionFirst(inputs, profile);
}
