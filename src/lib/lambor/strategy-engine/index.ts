export type {
  GlobalSignals,
  MatchFeatures,
  StrategyEngineContext,
  UnifiedDecision,
  UnifiedEvaluation,
  RiskTier,
  OddsTrend,
} from "./types";
export { buildMatchFeatures } from "./features";
export { buildGlobalSignals } from "./signals";
export { computeMomentumScore } from "./momentum";
export { evaluateMatchUnified } from "./unified-evaluate";
export {
  readPackageStatsMap,
  getPackageStats,
  getPackageLearningBoost,
  getStrategyPriorWinRate,
  recordStrategyPackageResult,
} from "./package-learning";
export {
  readBankroll,
  writeBankroll,
  suggestStakeAmount,
  maxExposureAmount,
  type BankrollState,
} from "./bankroll";
