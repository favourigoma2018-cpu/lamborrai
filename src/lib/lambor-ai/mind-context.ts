import type { BetOrderData } from "@azuro-org/toolkit";
import { BetOrderResult, BetOrderState } from "@azuro-org/toolkit";

import { azuroBetPnl, isAzuroBetOpen } from "@/lib/azuro/bet-helpers";
import type { BetResultRecord, LearningProfile, StrategyName } from "@/lib/lambor-ai/types";
import type { DecisionFirstEngineDecision } from "@/lib/lambor-ai/engine";
import type { LiveMatch } from "@/types/live-matches";

export type MindSessionStats = {
  totalBets: number;
  wins: number;
  losses: number;
  winRate: number;
  /** Unit-stake approximation: win = odds - 1, loss = -1 per record. */
  totalPnlUnits: number;
  openAzuroPositions: number;
  settledAzuroWins: number;
  settledAzuroLosses: number;
};

export type MindRecentBet = {
  match: string;
  strategy: StrategyName;
  result: "win" | "loss";
  confidence: number;
  odds: number;
  placedAt: string;
  minute: number | null;
};

export type MindPatternInsights = {
  lateGoalLossShare: number;
  redCardLossShare: number;
  momentumLossShare: number;
  highConfidenceLossCount: number;
  summaryLines: string[];
};

export type MindContext = {
  builtAt: string;
  /** Engine pass threshold from learning profile (percent). */
  learningThreshold: number;
  stats: MindSessionStats;
  recentBets: MindRecentBet[];
  topStrategiesByVolume: Array<{ strategy: StrategyName; count: number }>;
  patterns: MindPatternInsights;
  actionableSignals: Array<{
    match: string;
    decision: string;
    confidence: number;
    strategyUsed: StrategyName;
  }>;
  /** Live feed volatility hint 0..1 (higher = more goal differential in sample). */
  liveVolatilityHint: number | null;
  /** Optional nudge after enough data (every few bets / pattern). */
  autoInsight: string | null;
};

const LATE_STRATEGIES: ReadonlySet<StrategyName> = new Set([
  "OVER_1_5_LATE_GOALS",
  "LATE_EQUALIZER",
  "UNDER_2_5_SECOND_HALF",
]);
const RED_STRATEGIES: ReadonlySet<StrategyName> = new Set(["RED_CARD_EXPLOIT"]);
const MOMENTUM_STRATEGIES: ReadonlySet<StrategyName> = new Set(["MOMENTUM_SPIKE"]);

function strategyVolume(results: BetResultRecord[]): Map<StrategyName, number> {
  const m = new Map<StrategyName, number>();
  for (const r of results) {
    m.set(r.strategy, (m.get(r.strategy) ?? 0) + 1);
  }
  return m;
}

function computePatterns(losses: BetResultRecord[]): MindPatternInsights {
  if (losses.length === 0) {
    return {
      lateGoalLossShare: 0,
      redCardLossShare: 0,
      momentumLossShare: 0,
      highConfidenceLossCount: 0,
      summaryLines: [],
    };
  }

  let late = 0;
  let red = 0;
  let mom = 0;
  let highConf = 0;
  for (const l of losses) {
    if (LATE_STRATEGIES.has(l.strategy)) late += 1;
    if (RED_STRATEGIES.has(l.strategy)) red += 1;
    if (MOMENTUM_STRATEGIES.has(l.strategy)) mom += 1;
    if (l.confidence >= 85) highConf += 1;
  }

  const n = losses.length;
  const lateGoalLossShare = late / n;
  const redCardLossShare = red / n;
  const momentumLossShare = mom / n;

  const summaryLines: string[] = [];
  if (lateGoalLossShare >= 0.35) {
    summaryLines.push(
      "A material share of losses maps to late-game or second-half structures; variance after ~80' remains elevated in that bucket.",
    );
  }
  if (redCardLossShare >= 0.25) {
    summaryLines.push("Red-card–linked setups are showing up repeatedly in the loss column; treat those as higher noise.");
  }
  if (momentumLossShare >= 0.3) {
    summaryLines.push("Momentum-spike entries are contributing disproportionately to losses; re-check entry timing vs. price.");
  }
  if (n > 0 && highConf / n >= 0.25) {
    summaryLines.push("Several losses occurred on high-confidence tickets — review whether odds were too short vs. realized edge.");
  }
  if (summaryLines.length === 0) {
    summaryLines.push("No single structural pattern dominates the loss book; reads look closer to mixed variance.");
  }

  return {
    lateGoalLossShare,
    redCardLossShare,
    momentumLossShare,
    highConfidenceLossCount: highConf,
    summaryLines,
  };
}

function computeLiveVolatilityFromMatches(matches: LiveMatch[]): number | null {
  const inPlay = matches.filter((m) => {
    const st = String(m.status ?? "").toLowerCase();
    return st.includes("live") || st.includes("1h") || st.includes("2h");
  });
  if (inPlay.length === 0) return null;
  let sum = 0;
  let c = 0;
  for (const m of inPlay) {
    const hg = Number(m.goalsHome ?? 0);
    const ag = Number(m.goalsAway ?? 0);
    if (Number.isFinite(hg) && Number.isFinite(ag)) {
      sum += Math.abs(hg - ag);
      c += 1;
    }
  }
  if (c === 0) return null;
  return Math.min(1, sum / c / 3);
}

function azuroSettledStats(orders: BetOrderData[]) {
  let wins = 0;
  let losses = 0;
  for (const o of orders) {
    if (o.state !== BetOrderState.Settled) continue;
    if (o.result === BetOrderResult.Won) wins += 1;
    else if (o.result === BetOrderResult.Lost) losses += 1;
  }
  return { wins, losses };
}

function azuroPnlSum(orders: BetOrderData[]): number {
  let s = 0;
  for (const o of orders) {
    const p = azuroBetPnl(o);
    if (p != null) s += p;
  }
  return s;
}

function autoInsightFrom(
  stats: MindSessionStats,
  patterns: MindPatternInsights,
  resultsLen: number,
): string | null {
  if (resultsLen >= 3 && resultsLen % 3 === 0 && patterns.lateGoalLossShare >= 0.3) {
    return "Late goal risk is elevated versus your recent loss mix; size down or defer marginal adds until clocks stabilize.";
  }
  if (stats.totalBets >= 5 && stats.winRate >= 0.62 && stats.totalPnlUnits > 0) {
    return "Strategy book is net positive with a stable win rate; maintain discipline on stake sizing.";
  }
  if (patterns.momentumLossShare >= 0.35 && stats.losses >= 3) {
    return "Momentum signals are weakening in outcomes; consider tightening filters on spike entries.";
  }
  return null;
}

export type BuildMindContextInput = {
  azuroOrders: BetOrderData[];
  betResults: BetResultRecord[];
  profile: LearningProfile;
  decisionCards: DecisionFirstEngineDecision[];
  liveMatches: LiveMatch[];
};

/**
 * Assembles session stats, recent history, strategy mix, and pattern hints for Lambor Mind.
 * Call from the client (uses passed-in data; no I/O).
 */
export function buildContext(input: BuildMindContextInput): MindContext {
  const { azuroOrders, betResults, profile, decisionCards, liveMatches } = input;
  const results = [...betResults].sort(
    (a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime(),
  );

  const wins = results.filter((r) => r.result === "win").length;
  const losses = results.filter((r) => r.result === "loss").length;
  const totalBets = results.length;
  const winRate = totalBets > 0 ? wins / totalBets : 0;

  let totalPnlUnits = 0;
  for (const r of results) {
    totalPnlUnits += r.result === "win" ? Math.max(0, r.odds - 1) : -1;
  }

  const openAzuroPositions = azuroOrders.filter(isAzuroBetOpen).length;
  const az = azuroSettledStats(azuroOrders);
  const azPnl = azuroPnlSum(azuroOrders);

  const stats: MindSessionStats = {
    totalBets,
    wins,
    losses,
    winRate,
    totalPnlUnits: Number(totalPnlUnits.toFixed(3)),
    openAzuroPositions,
    settledAzuroWins: az.wins,
    settledAzuroLosses: az.losses,
  };

  const recentBets: MindRecentBet[] = results.slice(0, 18).map((r) => ({
    match: r.match,
    strategy: r.strategy,
    result: r.result,
    confidence: r.confidence,
    odds: r.odds,
    placedAt: r.placedAt,
    minute: r.minute,
  }));

  const volMap = strategyVolume(results);
  const topStrategiesByVolume = [...volMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([strategy, count]) => ({ strategy, count }));

  const lossRecords = results.filter((r) => r.result === "loss");
  const patterns = computePatterns(lossRecords);

  const actionableSignals = decisionCards.slice(0, 6).map((c) => ({
    match: c.match,
    decision: c.decision,
    confidence: c.confidence,
    strategyUsed: c.raw.strategyUsed,
  }));

  const liveVolatilityHint = computeLiveVolatilityFromMatches(liveMatches);

  let autoInsight = autoInsightFrom(stats, patterns, totalBets);
  if (!autoInsight && azPnl !== 0) {
    autoInsight = `On-chain settled P/L (Azuro) is approximately ${azPnl >= 0 ? "+" : ""}${azPnl.toFixed(2)}; compare to the unit-stake learning book for drift.`;
  }

  return {
    builtAt: new Date().toISOString(),
    learningThreshold: profile.threshold,
    stats,
    recentBets,
    topStrategiesByVolume,
    patterns,
    actionableSignals,
    liveVolatilityHint,
    autoInsight,
  };
}
