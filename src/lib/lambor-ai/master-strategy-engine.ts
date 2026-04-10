export type MasterInputMatch = {
  match: string;
  odds: number;
  confidence: number;
  marketType: string;
};

export type RiskLevel = "low" | "medium" | "high";
export type UiColor = "green" | "yellow" | "red";
export type Decision = "BET" | "NO_BET";

export type ValueBetPick = {
  type: "VALUE_BET";
  match: string;
  odds: number;
  confidence: number;
  valueScore: number;
  label: "🔥 BEST PICK";
  color: "green" | "yellow";
  decision: "BET";
};

export type SafeBetPick = {
  type: "SAFE_MARKET";
  match: string;
  odds: number;
  confidence: number;
  risk: "low" | "medium";
  color: "green" | "yellow";
  decision: "BET";
};

export type AccumulatorPick = {
  type: "ACCUMULATOR";
  matches: Array<{
    match: string;
    odds: number;
    confidence: number;
    marketType: string;
  }>;
  totalOdds: number;
  avgConfidence: number;
  risk: "low" | "medium";
  decision: "BET";
};

export type LamborMasterStrategyEngineOutput = {
  bestPick: ValueBetPick | null;
  safeBets: SafeBetPick[];
  accumulator: AccumulatorPick | null;
};

type ValueCandidate = MasterInputMatch & {
  impliedProbability: number;
  valueScore: number;
};

const LOW_VOLATILITY_MARKETS = new Set(["over_1.5", "under_3.5", "double_chance", "draw_no_bet"]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeMarketType(marketType: string): string {
  return marketType.trim().toLowerCase();
}

function colorFromConfidence(confidence: number): UiColor {
  if (confidence >= 80) return "green";
  if (confidence >= 60) return "yellow";
  return "red";
}

function riskFromConfidence(confidence: number): RiskLevel {
  if (confidence >= 80) return "low";
  if (confidence >= 60) return "medium";
  return "high";
}

/**
 * GLOBAL FILTER
 * Reject:
 * - confidence < 60
 * - missing/invalid odds
 * - odds > 3.5
 */
function sanitizeMatches(matches: MasterInputMatch[]): MasterInputMatch[] {
  return matches
    .filter((m) => {
      if (!m || typeof m.match !== "string" || !m.match.trim()) return false;
      if (!isValidNumber(m.odds) || m.odds <= 1 || m.odds > 3.5) return false;
      if (!isValidNumber(m.confidence) || m.confidence < 60) return false;
      if (typeof m.marketType !== "string" || !m.marketType.trim()) return false;
      return true;
    })
    .map((m) => ({
      ...m,
      confidence: clamp(m.confidence, 0, 100),
      marketType: normalizeMarketType(m.marketType),
    }));
}

/**
 * A) VALUE EDGE STRATEGY
 * impliedProbability = (1 / odds) * 100
 * valueScore = confidence - impliedProbability
 */
function runValueEdgeStrategy(matches: MasterInputMatch[]): ValueCandidate[] {
  return matches
    .map((m) => {
      const impliedProbability = (1 / m.odds) * 100;
      const valueScore = m.confidence - impliedProbability;
      return {
        ...m,
        impliedProbability: round2(impliedProbability),
        valueScore: round2(valueScore),
      };
    })
    .filter((m) => m.confidence >= 65 && m.odds >= 1.5 && m.odds <= 3.0 && m.valueScore >= 10)
    .sort((a, b) => b.valueScore - a.valueScore)
    .slice(0, 3);
}

/**
 * B) LOW VOLATILITY STRATEGY
 * Allowed markets:
 * - over_1.5
 * - under_3.5
 * - double_chance
 * - draw_no_bet
 */
function runLowVolatilityStrategy(matches: MasterInputMatch[]): MasterInputMatch[] {
  return matches
    .filter(
      (m) =>
        LOW_VOLATILITY_MARKETS.has(m.marketType) &&
        m.confidence >= 70 &&
        m.odds >= 1.25 &&
        m.odds <= 1.8,
    )
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}

/**
 * C) SAFE ACCUMULATOR STRATEGY
 * Uses only low-volatility matches.
 * Rules:
 * - pick top 3-5 matches
 * - each odds between 1.2 and 1.5
 * - at least one has confidence >= 90
 */
function runSafeAccumulatorStrategy(lowVolatilityMatches: MasterInputMatch[]): AccumulatorPick | null {
  const pool = lowVolatilityMatches
    .filter((m) => m.odds >= 1.2 && m.odds <= 1.5)
    .sort((a, b) => b.confidence - a.confidence);

  if (pool.length < 3) return null;

  const selected = pool.slice(0, Math.min(5, pool.length));
  const has90Plus = selected.some((m) => m.confidence >= 90);
  if (!has90Plus) return null;

  // Ensure minimum 3 legs.
  const legs = selected.length >= 3 ? selected : [];
  if (legs.length < 3) return null;

  const totalOdds = round2(legs.reduce((acc, m) => acc * m.odds, 1));
  const avgConfidence = round2(legs.reduce((acc, m) => acc + m.confidence, 0) / legs.length);
  const risk = riskFromConfidence(avgConfidence);

  return {
    type: "ACCUMULATOR",
    matches: legs.map((m) => ({
      match: m.match,
      odds: m.odds,
      confidence: m.confidence,
      marketType: m.marketType,
    })),
    totalOdds,
    avgConfidence,
    risk: risk === "high" ? "medium" : risk,
    decision: "BET",
  };
}

function toSafeBetPick(match: MasterInputMatch): SafeBetPick {
  const risk = riskFromConfidence(match.confidence);
  const color: "green" | "yellow" = match.confidence >= 80 ? "green" : "yellow";
  return {
    type: "SAFE_MARKET",
    match: match.match,
    odds: match.odds,
    confidence: round2(match.confidence),
    risk: risk === "high" ? "medium" : risk,
    color,
    decision: "BET",
  };
}

function toBestPick(valueCandidates: ValueCandidate[]): ValueBetPick | null {
  const best = valueCandidates[0];
  if (!best) return null;
  const color: "green" | "yellow" = best.confidence >= 80 ? "green" : "yellow";
  return {
    type: "VALUE_BET",
    match: best.match,
    odds: best.odds,
    confidence: round2(best.confidence),
    valueScore: round2(best.valueScore),
    label: "🔥 BEST PICK",
    color,
    decision: "BET",
  };
}

/**
 * LamborMasterStrategyEngine
 * Unifies:
 * 1) Value Edge
 * 2) Low Volatility
 * 3) Safe Accumulator
 *
 * Always returns:
 * - 1 bestPick (or null)
 * - up to 5 safeBets
 * - 1 accumulator (or null)
 */
export function LamborMasterStrategyEngine(
  inputMatches: MasterInputMatch[],
): LamborMasterStrategyEngineOutput {
  if (!Array.isArray(inputMatches) || inputMatches.length === 0) {
    return { bestPick: null, safeBets: [], accumulator: null };
  }

  const sanitized = sanitizeMatches(inputMatches);
  if (sanitized.length === 0) {
    return { bestPick: null, safeBets: [], accumulator: null };
  }

  const valueEdge = runValueEdgeStrategy(sanitized);
  const lowVolatility = runLowVolatilityStrategy(sanitized);
  const accumulator = runSafeAccumulatorStrategy(lowVolatility);

  return {
    bestPick: toBestPick(valueEdge),
    safeBets: lowVolatility.map(toSafeBetPick),
    accumulator,
  };
}

// Optional named export alias for ergonomics.
export const runLamborMasterStrategyEngine = LamborMasterStrategyEngine;

