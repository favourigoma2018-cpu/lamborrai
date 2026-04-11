import type { StrategyName } from "@/lib/lambor-ai/types";

/** Canonical market kinds shown in Lambor UI (aligned with Azuro where possible). */
export type LamborMarketKind =
  | "match_winner"
  | "double_chance"
  | "over_under"
  | "btts"
  | "half_time_over_under"
  | "half_time_winner"
  /** Azuro condition we could not map to a canonical kind — still selectable on-chain. */
  | "other_azuro";

export type MarketPeriod = "full" | "1st_half" | "2nd_half";

export type LamborMarketOption = {
  /** Human label (e.g. "Home", "Over 2.5"). */
  label: string;
  /** Decimal odds string for display; `prepareBet` derives EIP-712 `minOdds` with slippage. */
  odds: string;
  /** Azuro condition id (maps to on-chain condition). */
  marketId: string;
  outcomeId: string;
  /** True when this row came from an Azuro `GameCondition` (always true for rows we emit). */
  executable: boolean;
};

export type LamborMarketGroup = {
  type: LamborMarketKind;
  /** For totals / lines. */
  line?: number;
  period?: MarketPeriod;
  /** Original Azuro condition title (shown for `other_azuro` and as subtitle elsewhere). */
  conditionTitle?: string | null;
  options: LamborMarketOption[];
};

export type MatchMarketsPayload = {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  score: string;
  minute: number | null;
  status: string;
  league: string;
  azuroGameId?: string;
  markets: LamborMarketGroup[];
};

/** Keys used to match engine strategies to UI selections. */
export type StrategyMarketHint = {
  market: LamborMarketKind;
  selection?: string;
  line?: number;
  ou?: "over" | "under";
  period?: MarketPeriod;
};

export type StrategyRecommendation = {
  strategy: StrategyName;
  hints: StrategyMarketHint[];
};
