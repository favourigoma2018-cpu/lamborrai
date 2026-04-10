export type RiskLevel = "low" | "medium" | "high";
export type Decision = "BET" | "NO_BET";
export type CardColor = "green" | "yellow" | "red";
export type DecisionLabel = "HIGH CONFIDENCE" | "MEDIUM RISK" | "RISKY" | "REJECTED";

export type MatchOdds = {
  /** Decimal odds for selected pick; falls back to min valid 1X2 odds when absent. */
  primary?: number | null;
  home?: number | null;
  draw?: number | null;
  away?: number | null;
};

export type MarketData = {
  /** 0..1 where 1 is highly consistent market movement. */
  consistency?: number | null;
  /** 0..1 where 1 is very unstable market movement. */
  volatility?: number | null;
  /** Optional explicit stability flag from upstream provider. */
  stable?: boolean | null;
};

export type FormStats = {
  /** Normalized 0..100 */
  homeFormScore?: number | null;
  /** Normalized 0..100 */
  awayFormScore?: number | null;
  /** How many matches back this form snapshot covers. */
  sampleSize?: number | null;
};

export type PredictionSignal = {
  name: string;
  /** Normalized 0..100 confidence for this signal. */
  confidence: number;
  /** Relative influence (default 1). */
  weight?: number | null;
};

export type StrategyMatchInput = {
  teams: {
    home: string;
    away: string;
  };
  /** Kickoff date/time used for "today only" filter. */
  kickoffAt: string | number | Date;
  odds: MatchOdds;
  marketData?: MarketData | null;
  formStats?: FormStats | null;
  predictionSignals?: PredictionSignal[] | null;
};

export type ProcessedMatchDecision = {
  match: string;
  confidence: number;
  risk: RiskLevel;
  decision: Decision;
  color: CardColor;
  label: DecisionLabel;
  reason: string;
  /** UI helper, e.g. "BET • 92% confidence" */
  summary: string;
};

export type StrategyEngineOutput = {
  results: ProcessedMatchDecision[];
  bestPick: ProcessedMatchDecision | null;
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(value: string | number | Date, now = new Date()): boolean {
  const parsed = toDate(value);
  if (!parsed) return false;
  return isSameLocalDay(parsed, now);
}

function findPrimaryOdds(odds: MatchOdds): number | null {
  if (typeof odds.primary === "number" && Number.isFinite(odds.primary) && odds.primary > 1) {
    return odds.primary;
  }
  const candidates = [odds.home, odds.draw, odds.away].filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item) && item > 1,
  );
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

function hasValidOdds(match: StrategyMatchInput): boolean {
  return findPrimaryOdds(match.odds) !== null;
}

function oddsScore(primaryOdds: number): { score: number; reason: string } {
  let score = 50;
  let reason = "Neutral odds baseline.";

  if (primaryOdds >= 1.2 && primaryOdds <= 2.0) {
    // Peak confidence around 1.60 and still favorable inside 1.2-2.0 band.
    const proximityToSweetSpot = 1 - Math.min(1, Math.abs(primaryOdds - 1.6) / 0.4);
    const boost = 12 + proximityToSweetSpot * 10;
    score += boost;
    reason = "Strong odds profile in preferred 1.2-2.0 range.";
  } else if (primaryOdds > 2.5) {
    const penalty = 12 + Math.min(12, (primaryOdds - 2.5) * 6);
    score -= penalty;
    reason = "Long odds increase uncertainty and downside risk.";
  } else if (primaryOdds > 2.0 && primaryOdds <= 2.5) {
    score -= 6;
    reason = "Slightly stretched odds reduce edge quality.";
  } else if (primaryOdds > 1.0 && primaryOdds < 1.2) {
    score -= 4;
    reason = "Very short odds can limit value despite high hit probability.";
  }

  return { score: clamp(score), reason };
}

function marketScore(marketData?: MarketData | null): { delta: number; reason: string } {
  if (!marketData) return { delta: -10, reason: "Market consistency data missing." };

  let delta = 0;
  const notes: string[] = [];

  if (typeof marketData.consistency === "number") {
    const consistency = clamp(marketData.consistency, 0, 1);
    if (consistency >= 0.7) {
      delta += 12;
      notes.push("market signals are consistent");
    } else if (consistency >= 0.45) {
      delta += 4;
      notes.push("market consistency is moderate");
    } else {
      delta -= 8;
      notes.push("market consistency is weak");
    }
  } else {
    delta -= 4;
    notes.push("consistency metric missing");
  }

  if (marketData.stable === true) {
    delta += 5;
    notes.push("market is stable");
  } else if (marketData.stable === false) {
    delta -= 6;
    notes.push("market appears unstable");
  }

  if (typeof marketData.volatility === "number") {
    const volatility = clamp(marketData.volatility, 0, 1);
    if (volatility > 0.7) {
      delta -= 9;
      notes.push("high volatility penalized");
    } else if (volatility < 0.3) {
      delta += 3;
      notes.push("low volatility supports confidence");
    }
  }

  return {
    delta,
    reason: notes.length ? `${notes.join("; ")}.` : "Market data present but neutral.",
  };
}

function formScore(formStats?: FormStats | null): { delta: number; reason: string } {
  if (!formStats) return { delta: -4, reason: "Form stats missing." };

  const home = typeof formStats.homeFormScore === "number" ? clamp(formStats.homeFormScore) : null;
  const away = typeof formStats.awayFormScore === "number" ? clamp(formStats.awayFormScore) : null;
  const sampleSize = formStats.sampleSize ?? 0;

  if (home === null || away === null) return { delta: -3, reason: "Partial form data only." };

  const gap = Math.abs(home - away);
  let delta = 0;
  if (gap >= 18) delta += 7;
  else if (gap >= 10) delta += 4;
  else if (gap <= 4) delta -= 2;

  if (sampleSize > 0 && sampleSize < 3) delta -= 3;
  else if (sampleSize >= 5) delta += 2;

  return { delta, reason: "Form trend contribution applied." };
}

function signalScore(signals?: PredictionSignal[] | null): { delta: number; reason: string } {
  if (!signals || signals.length === 0) return { delta: -8, reason: "Prediction signals missing." };

  let weightedSum = 0;
  let totalWeight = 0;
  for (const signal of signals) {
    const weight = signal.weight ?? 1;
    if (!Number.isFinite(weight) || weight <= 0) continue;
    weightedSum += clamp(signal.confidence) * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) return { delta: -8, reason: "Prediction signals invalid." };

  const avg = weightedSum / totalWeight;
  const delta = (avg - 50) * 0.3;
  return {
    delta,
    reason: avg >= 60 ? "Prediction signals reinforce the edge." : "Prediction signals are mixed.",
  };
}

function classifyRisk(confidence: number): RiskLevel {
  if (confidence >= 80) return "low";
  if (confidence >= 60) return "medium";
  return "high";
}

function decisionFromConfidence(confidence: number): Decision {
  return confidence >= 60 ? "BET" : "NO_BET";
}

function colorFromRisk(risk: RiskLevel): CardColor {
  if (risk === "low") return "green";
  if (risk === "medium") return "yellow";
  return "red";
}

function labelFromConfidence(confidence: number, decision: Decision): DecisionLabel {
  if (confidence >= 80) return "HIGH CONFIDENCE";
  if (confidence >= 60) return "MEDIUM RISK";
  if (decision === "NO_BET" && confidence < 45) return "REJECTED";
  return "RISKY";
}

function buildReason(parts: string[]): string {
  const cleaned = parts.map((part) => part.trim()).filter(Boolean);
  if (cleaned.length === 0) return "Insufficient quality signals.";
  return cleaned.join(" ");
}

function evaluateMatch(match: StrategyMatchInput): ProcessedMatchDecision {
  const primaryOdds = findPrimaryOdds(match.odds);
  if (primaryOdds === null) {
    return {
      match: `${match.teams.home} vs ${match.teams.away}`,
      confidence: 0,
      risk: "high",
      decision: "NO_BET",
      color: "red",
      label: "REJECTED",
      reason: "Invalid odds data.",
      summary: "NO BET • 0% confidence",
    };
  }

  const base = oddsScore(primaryOdds);
  const market = marketScore(match.marketData);
  const form = formScore(match.formStats);
  const signals = signalScore(match.predictionSignals);

  const rawConfidence = base.score + market.delta + form.delta + signals.delta;
  const confidence = Math.round(clamp(rawConfidence));
  const risk = classifyRisk(confidence);
  const decision = decisionFromConfidence(confidence);
  const color = colorFromRisk(risk);
  const label = labelFromConfidence(confidence, decision);
  const reason = buildReason([base.reason, market.reason, form.reason, signals.reason]);

  return {
    match: `${match.teams.home} vs ${match.teams.away}`,
    confidence,
    risk,
    decision,
    color,
    label,
    reason,
    summary: `${decision} • ${confidence}% confidence`,
  };
}

/**
 * Lambor Strategy Engine
 * - Filters to today's matches with valid odds
 * - Scores confidence/risk/decision for each match
 * - Sorts by highest confidence
 * - Returns top pick separately
 */
export function processLamborStrategy(matches: StrategyMatchInput[], now = new Date()): StrategyEngineOutput {
  const eligible = matches.filter((match) => isToday(match.kickoffAt, now) && hasValidOdds(match));
  const results = eligible.map(evaluateMatch).sort((a, b) => b.confidence - a.confidence);
  return {
    results,
    bestPick: results[0] ?? null,
  };
}

