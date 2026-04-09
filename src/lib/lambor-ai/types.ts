import type { LiveMatch } from "@/types/live-matches";

export type MatchAnalyticsInput = LiveMatch & {
  homeGoals: number;
  awayGoals: number;
  possessionHome?: number | null;
  possessionAway?: number | null;
  shotsOnTargetHome?: number | null;
  shotsOnTargetAway?: number | null;
  totalShotsHome?: number | null;
  totalShotsAway?: number | null;
  attacksHome?: number | null;
  attacksAway?: number | null;
  dangerousAttacksHome?: number | null;
  dangerousAttacksAway?: number | null;
  redCardsHome?: number | null;
  redCardsAway?: number | null;
  favoriteOdds?: number | null;
};

export type StrategyName =
  | "UNDER_2_5_HT"
  | "UNDER_2_5_SECOND_HALF"
  | "OVER_1_5_LATE_GOALS"
  | "FAVORITE_DOMINANCE"
  | "DRAW_STABILITY"
  | "MOMENTUM_SPIKE"
  | "DEAD_GAME_FILTER"
  | "LATE_EQUALIZER"
  | "RED_CARD_EXPLOIT";

export type StrategyResult = {
  strategy: StrategyName;
  confidence: number;
  weight: number;
  reasoning: string;
};

export type RiskLevel = "HIGH CONFIDENCE" | "MEDIUM" | "LOW";

export type EngineDecision = {
  match: string;
  strategyUsed: StrategyName;
  confidence: number;
  decision: "BET" | "NO_BET";
  tag: RiskLevel;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  reasoning: string;
  strategyBreakdown: StrategyResult[];
};

export type StrategyStats = {
  wins: number;
  losses: number;
  roi: number;
  recent: Array<"win" | "loss">;
};

export type LearningProfile = {
  threshold: number;
  strategyWeights: Record<StrategyName, number>;
  strategyStats: Record<StrategyName, StrategyStats>;
};

export type BetResultRecord = {
  match: string;
  strategy: StrategyName;
  confidence: number;
  result: "win" | "loss";
  odds: number;
  league: string;
  minute: number | null;
  placedAt: string;
};
