import type { DecisionFirstEngineDecision } from "@/lib/lambor-ai/engine";
import type { MindContext } from "@/lib/lambor-ai/mind-context";

export type MindQueryMode = "performance" | "decision" | "loss_analysis" | "pattern" | "general";

export type MindDecisionLabel = "APPROVE" | "REJECT" | "CAUTION";

export type MindResponseMetadata = {
  mode: MindQueryMode;
  decision?: MindDecisionLabel;
};

/** Assistant envelope for Lambor Mind (UI + optional analytics). */
export type MindAssistantPayload = {
  text: string;
  timestamp: string;
  metadata?: MindResponseMetadata;
  /** Short lead sentence for emphasis in UI. */
  highlight?: string;
};

function normalize(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function classifyMindQuery(userText: string): MindQueryMode {
  const q = normalize(userText);
  if (
    /\b(should i bet|worth a bet|take this bet|bet this|good bet|bad bet|approve|fade|pass on)\b/.test(q) ||
    /\bshould i\b.*\bbet\b/.test(q)
  ) {
    return "decision";
  }
  if (/\b(loss|losses|losing|why did i lose|bad run|drawdown|variance|slump)\b/.test(q)) {
    return "loss_analysis";
  }
  if (/\b(performance|pnl|p\/l|profit|win rate|how am i|record|stats|summary)\b/.test(q)) {
    return "performance";
  }
  if (/\b(pattern|late goal|after 80|red card|momentum|odds misread|volatility)\b/.test(q)) {
    return "pattern";
  }
  return "general";
}

function findDecisionCard(
  userText: string,
  cards: DecisionFirstEngineDecision[],
): DecisionFirstEngineDecision | null {
  const q = normalize(userText);
  for (const c of cards) {
    const m = normalize(c.match);
    if (!m) continue;
    const parts = m.split(/\s+vs\s+|\s+v\s+/i).flatMap((p) => p.split(/\s+/).filter(Boolean));
    for (const token of parts) {
      if (token.length < 3) continue;
      if (q.includes(token.toLowerCase())) return c;
    }
    if (q.includes(m.slice(0, 12).toLowerCase())) return c;
  }
  return cards.length === 1 ? cards[0] ?? null : null;
}

function mapEngineDecision(d: DecisionFirstEngineDecision["decision"]): MindDecisionLabel {
  if (d === "BET") return "APPROVE";
  if (d === "NO BET") return "REJECT";
  return "CAUTION";
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function performanceBlock(ctx: MindContext): MindAssistantPayload {
  const { stats, patterns } = ctx;
  const wr = pct(stats.winRate);
  const pnl = stats.totalPnlUnits >= 0 ? `+${stats.totalPnlUnits.toFixed(2)}` : stats.totalPnlUnits.toFixed(2);
  const insight = patterns.summaryLines[0] ?? "Book is balanced; continue logging outcomes for sharper segmentation.";
  const highlight = `Session: ${stats.totalBets} tickets · ${stats.wins}W / ${stats.losses}L · win rate ${wr} · unit P/L ${pnl}.`;
  const body = `${highlight} Open Azuro legs: ${stats.openAzuroPositions}. Settled on-chain (W/L): ${stats.settledAzuroWins}/${stats.settledAzuroLosses}. Key read: ${insight}`;
  return {
    text: body,
    timestamp: new Date().toISOString(),
    metadata: { mode: "performance" },
    highlight,
  };
}

function lossAnalysisBlock(ctx: MindContext): MindAssistantPayload {
  const { stats, patterns } = ctx;
  const late = pct(patterns.lateGoalLossShare);
  const mom = pct(patterns.momentumLossShare);
  const red = pct(patterns.redCardLossShare);
  const highlight =
    stats.losses === 0
      ? "No logged losses in the learning book yet."
      : `Loss book: ${stats.losses} legs. Late-structure share ${late}; momentum ${mom}; red-card setups ${red}.`;
  const variance =
    patterns.lateGoalLossShare >= 0.35
      ? "Attribution skews toward late-game volatility rather than systematic price error."
      : patterns.highConfidenceLossCount >= 3
        ? "Several high-confidence marks still lost; treat that as variance plus possible odds compression, not necessarily process failure."
        : "Mixture reads as variance-heavy; entries are not dominated by a single failure mode.";
  const body = `${highlight} ${variance} ${patterns.summaryLines.slice(0, 2).join(" ")}`;
  return {
    text: body,
    timestamp: new Date().toISOString(),
    metadata: { mode: "loss_analysis" },
    highlight,
  };
}

function patternBlock(ctx: MindContext): MindAssistantPayload {
  const { patterns, stats, liveVolatilityHint } = ctx;
  const vol =
    liveVolatilityHint != null
      ? `Live sample volatility index ~${(liveVolatilityHint * 100).toFixed(0)} (higher = wider score separation in the current feed slice).`
      : "Live volatility index unavailable (no in-play slice with scores).";
  const highlight = `Pattern desk: late-goal loss share ${pct(patterns.lateGoalLossShare)} · momentum ${pct(patterns.momentumLossShare)} · red-card ${pct(patterns.redCardLossShare)}.`;
  const body = `${highlight} ${vol} Session win rate ${pct(stats.winRate)} over ${stats.totalBets} logged results.`;
  return {
    text: body,
    timestamp: new Date().toISOString(),
    metadata: { mode: "pattern" },
    highlight,
  };
}

function decisionBlock(
  ctx: MindContext,
  userText: string,
  cards: DecisionFirstEngineDecision[],
): MindAssistantPayload {
  const card = findDecisionCard(userText, cards);
  if (!card) {
    const highlight = "CAUTION — No single live card matched your text.";
    const body = `${highlight} Name a fixture from the strategy strip, or ask for Performance / Patterns. Book: ${ctx.stats.totalBets} results, win rate ${pct(ctx.stats.winRate)}.`;
    return {
      text: body,
      timestamp: new Date().toISOString(),
      metadata: { mode: "decision", decision: "CAUTION" },
      highlight,
    };
  }
  const decision = mapEngineDecision(card.decision);
  const highlight = `${decision} — ${card.match} · engine ${card.decision} at ${card.confidence}% (risk-weighted).`;
  const hist =
    ctx.stats.totalBets >= 5
      ? `Your logged win rate is ${pct(ctx.stats.winRate)}; use that as prior, not hype.`
      : "Limited logged sample; lean on the engine read and keep size small until the book deepens.";
  const momentum =
    card.raw.strategyBreakdown.find((s) => s.strategy === "MOMENTUM_SPIKE")?.reasoning ??
    "Momentum stack is neutral-to-supportive in the breakdown.";
  const oddsRead =
    card.confidence >= 78
      ? "Odds / confidence stack is firm but not immune to late variance."
      : "Price / confidence is mid-tier; edge exists but clearance over noise is thinner.";
  const body = `${highlight} Reasoning: ${momentum} ${oddsRead} Historical: ${hist} Engine note: ${card.reason}`;
  return {
    text: body,
    timestamp: new Date().toISOString(),
    metadata: { mode: "decision", decision },
    highlight,
  };
}

function generalBlock(ctx: MindContext): MindAssistantPayload {
  const top = ctx.topStrategiesByVolume[0];
  const strat = top ? `${top.strategy.replace(/_/g, " ")} (${top.count} tickets)` : "insufficient volume";
  const insight = ctx.patterns.summaryLines[0] ?? "Patterns are flat; no dominant structural alarm.";
  const auto = ctx.autoInsight ? ` Auto-read: ${ctx.autoInsight}` : "";
  const highlight = `Book health: ${ctx.stats.wins}W / ${ctx.stats.losses}L, win rate ${pct(ctx.stats.winRate)}, unit P/L ${ctx.stats.totalPnlUnits >= 0 ? "+" : ""}${ctx.stats.totalPnlUnits.toFixed(2)}.`;
  const body = `${highlight} Top strategy by count: ${strat}. Engine threshold ${ctx.learningThreshold}%. ${insight}${auto}`;
  return {
    text: body,
    timestamp: new Date().toISOString(),
    metadata: { mode: "general" },
    highlight,
  };
}

/**
 * Deterministic, data-backed reply for Lambor Mind (no external LLM).
 */
export function generateMindResponse(
  userText: string,
  ctx: MindContext,
  decisionCards: DecisionFirstEngineDecision[],
): MindAssistantPayload {
  const mode = classifyMindQuery(userText);
  switch (mode) {
    case "performance":
      return performanceBlock(ctx);
    case "loss_analysis":
      return lossAnalysisBlock(ctx);
    case "pattern":
      return patternBlock(ctx);
    case "decision":
      return decisionBlock(ctx, userText, decisionCards);
    default:
      return generalBlock(ctx);
  }
}
