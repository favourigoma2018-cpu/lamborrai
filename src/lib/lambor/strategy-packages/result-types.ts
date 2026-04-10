import type { StrategyPackageId } from "@/lib/lambor/strategy-packages/metadata";
import type { OddsTrend, RiskTier, UnifiedDecision } from "@/lib/lambor/strategy-engine/types";
import type { LiveMatch } from "@/types/live-matches";

export type StrategyScanRow = {
  match: LiveMatch;
  matchId: number;
  teams: string;
  market: string;
  odds: string;
  confidence: number;
  risk: RiskTier;
  decision: UnifiedDecision;
  label: "HIGH CONFIDENCE" | "MEDIUM" | "RISKY" | "HIGH RISK";
  momentumScore: number;
  totalXg: number;
  oddsTrend: OddsTrend;
  /** Live Under 2.5 FT band (moderate_unders_live). */
  liveRiskBand?: "GREEN" | "YELLOW";
  stakeSuggested?: number;
  flagForApproval?: boolean;
  tacticalReason?: string;
  scanMinute?: number;
};

export type StrategyPackageResult = {
  strategyId: StrategyPackageId;
  strategy: string;
  matches: StrategyScanRow[];
  combinedOdds?: number;
  bestPick?: StrategyScanRow;
};
