import type { StrategyName } from "@/lib/lambor-ai/types";
import type { LamborMarketKind, StrategyMarketHint, StrategyRecommendation } from "@/types/betting-markets";

/**
 * Maps Lambor strategy engine outputs to market hints for highlighting recommended selections.
 * Does not change strategy math — UI-only guidance.
 */
const MAP: Record<StrategyName, StrategyMarketHint[]> = {
  UNDER_2_5_HT: [
    { market: "over_under", line: 2.5, ou: "under", period: "1st_half" },
    { market: "half_time_over_under", line: 2.5, ou: "under" },
  ],
  UNDER_2_5_SECOND_HALF: [
    { market: "over_under", line: 2.5, ou: "under", period: "2nd_half" },
    { market: "over_under", line: 2.5, ou: "under" },
  ],
  OVER_1_5_LATE_GOALS: [
    { market: "over_under", line: 1.5, ou: "over" },
    { market: "over_under", line: 2.5, ou: "over" },
  ],
  FAVORITE_DOMINANCE: [{ market: "match_winner", selection: "home" }],
  DRAW_STABILITY: [{ market: "match_winner", selection: "draw" }],
  MOMENTUM_SPIKE: [
    { market: "over_under", line: 1.5, ou: "over" },
    { market: "match_winner", selection: "home" },
  ],
  DEAD_GAME_FILTER: [{ market: "btts", selection: "no" }],
  LATE_EQUALIZER: [
    { market: "match_winner", selection: "draw" },
    { market: "over_under", line: 0.5, ou: "over" },
  ],
  RED_CARD_EXPLOIT: [{ market: "over_under", line: 2.5, ou: "over" }],
};

export function hintsForStrategy(strategy: StrategyName): StrategyMarketHint[] {
  return MAP[strategy] ?? [];
}

export function recommendationFromStrategy(strategy: StrategyName): StrategyRecommendation {
  return { strategy, hints: hintsForStrategy(strategy) };
}

function norm(s: string) {
  return s.trim().toLowerCase();
}

/** Whether an option row matches a strategy hint (for outline / badge). */
export function optionMatchesHint(
  hint: StrategyMarketHint,
  groupType: LamborMarketKind,
  line: number | undefined,
  optionLabel: string,
): boolean {
  if (hint.market !== groupType) return false;
  if (hint.line != null && line != null && Math.abs(hint.line - line) > 0.01) return false;
  if (hint.line != null && line == null) return false;

  const label = norm(optionLabel);

  if (hint.ou === "over") {
    if (!label.includes("over")) return false;
  }
  if (hint.ou === "under") {
    if (!label.includes("under")) return false;
  }

  if (hint.selection) {
    const sel = norm(hint.selection);
    if (groupType === "match_winner" || groupType === "half_time_winner") {
      if (sel === "home" && !label.includes("home") && !label.includes("1")) return false;
      if (sel === "away" && !label.includes("away") && !label.includes("2")) return false;
      if (sel === "draw" && !label.includes("draw") && label !== "x") return false;
    }
    if (groupType === "double_chance") {
      if (sel === "1x" && !label.includes("1x") && !label.includes("1 x")) return false;
      if (sel === "x2" && !label.includes("x2") && !label.includes("x 2")) return false;
      if (sel === "12" && !label.includes("12")) return false;
    }
    if (groupType === "btts") {
      if (sel === "yes" && !label.includes("yes")) return false;
      if (sel === "no" && !label.includes("no")) return false;
    }
  }

  return true;
}
