import type { StrategyPackageId } from "@/lib/lambor/strategy-packages/metadata";
import type { LearningProfile } from "@/lib/lambor-ai/types";
import type { LiveMatch } from "@/types/live-matches";

/** Final decision tier for unified engine (extends legacy BET/NO_BET with WATCH). */
export type UnifiedDecision = "BET" | "WATCH" | "NO_BET";

export type RiskTier = "LOW" | "MEDIUM" | "HIGH";

export type OddsTrend = "increasing" | "stable" | "decreasing";

export type MatchFeatures = {
  minute: number;
  scoreHome: number;
  scoreAway: number;
  totalGoals: number;
  /** Estimated when API does not provide xG (from shots). */
  homeXg: number;
  awayXg: number;
  totalXg: number;
  shotsOnTargetHome: number;
  shotsOnTargetAway: number;
  totalShotsHome: number;
  totalShotsAway: number;
  possessionHome: number;
  possessionAway: number;
  attacksHome: number;
  attacksAway: number;
  dangerousAttacksHome: number;
  dangerousAttacksAway: number;
  redCardsHome: number;
  redCardsAway: number;
  oddsOpen: number;
  oddsCurrent: number;
  oddsChange: number;
};

export type GlobalSignals = {
  minute: number;
  score: string;
  totalGoals: number;
  shotsOnTargetTotal: number;
  totalShotsTotal: number;
  possessionHome: number;
  possessionAway: number;
  attacksTotal: number;
  dangerousAttacksTotal: number;
  /** Proxy for “last phase” intensity (no sub-minute API). */
  recentMomentum: number;
  redCardsTotal: number;
  oddsMovement: {
    open: number;
    current: number;
    change: number;
    trend: OddsTrend;
  };
  /** 0–100 composite pace (low = under bias). */
  gamePace: number;
  /** 0–100 shot intensity. */
  shotIntensity: number;
  /** 0–100 attacking pressure. */
  attackingPressure: number;
  /** 0–100 late-game stability (higher later if calm). */
  timeDecayStability: number;
};

export type StrategyEngineContext = {
  getOddsForMatch: (match: LiveMatch) => string;
  profile?: LearningProfile;
  /** Optional opening odds snapshot (matchId → decimal). */
  oddsOpenByMatchId?: Map<number, number>;
  /** Learning adjustments for strategy packages (client-side). */
  getPackageLearningBoost?: (packageId: StrategyPackageId) => number;
  /** Win-rate prior 0–100 for confidence blending (e.g. from package learning stats). */
  getStrategyPriorWinRate?: (packageId: StrategyPackageId) => number;
  /** Bankroll in USD for stake suggestions (client). */
  bankrollUsd?: number;
  /** Rolling daily loss in USD — strategies may halt when above guard threshold. */
  dailyLossUsd?: number;
  /** API-Football league ids to exclude from live scans. */
  blockedLeagueIds?: ReadonlySet<number> | number[];
};

export type UnifiedEvaluation = {
  confidence: number;
  risk: RiskTier;
  decision: UnifiedDecision;
  label: "HIGH CONFIDENCE" | "MEDIUM" | "RISKY" | "HIGH RISK";
  signals: GlobalSignals;
  features: MatchFeatures;
  momentumScore: number;
};

export type StrategyPackageMatchOutput = {
  matchId: number;
  teams: string;
  market: string;
  odds: string;
  confidence: number;
  risk: RiskTier;
  decision: UnifiedDecision;
  label: "HIGH CONFIDENCE" | "MEDIUM" | "RISKY" | "HIGH RISK";
  /** UI extras */
  momentumScore: number;
  totalXg: number;
  oddsTrend: OddsTrend;
};
