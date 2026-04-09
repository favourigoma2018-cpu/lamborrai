import type { BetResultRecord, LearningProfile, StrategyName, StrategyStats } from "@/lib/lambor-ai/types";

const DEFAULT_THRESHOLD = 80;
const STORAGE_KEY_PROFILE = "lambor.ai.profile.v1";
const STORAGE_KEY_RESULTS = "lambor.ai.results.v1";

const strategyNames: StrategyName[] = [
  "UNDER_2_5_HT",
  "UNDER_2_5_SECOND_HALF",
  "OVER_1_5_LATE_GOALS",
  "FAVORITE_DOMINANCE",
  "DRAW_STABILITY",
  "MOMENTUM_SPIKE",
  "DEAD_GAME_FILTER",
  "LATE_EQUALIZER",
  "RED_CARD_EXPLOIT",
];

function defaultStats(): StrategyStats {
  return { wins: 0, losses: 0, roi: 0, recent: [] };
}

export function createDefaultProfile(): LearningProfile {
  return {
    threshold: DEFAULT_THRESHOLD,
    strategyWeights: Object.fromEntries(strategyNames.map((name) => [name, 1])) as LearningProfile["strategyWeights"],
    strategyStats: Object.fromEntries(strategyNames.map((name) => [name, defaultStats()])) as LearningProfile["strategyStats"],
  };
}

export function readLearningProfile(): LearningProfile {
  if (typeof window === "undefined") return createDefaultProfile();
  const raw = window.localStorage.getItem(STORAGE_KEY_PROFILE);
  if (!raw) return createDefaultProfile();
  try {
    return JSON.parse(raw) as LearningProfile;
  } catch {
    return createDefaultProfile();
  }
}

export function writeLearningProfile(profile: LearningProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(profile));
}

export function readBetResults(): BetResultRecord[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY_RESULTS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as BetResultRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeBetResults(results: BetResultRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY_RESULTS, JSON.stringify(results.slice(0, 400)));
}

export function recordBetResult(entry: BetResultRecord) {
  const profile = readLearningProfile();
  const results = readBetResults();
  const stats = profile.strategyStats[entry.strategy] ?? defaultStats();

  const weightDelta = entry.result === "win" ? 0.05 : -0.05;
  const nextWeight = Math.max(0.4, Math.min(2.2, (profile.strategyWeights[entry.strategy] ?? 1) + weightDelta));
  profile.strategyWeights[entry.strategy] = nextWeight;

  if (entry.result === "win") stats.wins += 1;
  else stats.losses += 1;
  stats.recent = [entry.result, ...stats.recent].slice(0, 10);
  const impliedProfit = entry.result === "win" ? Math.max(0, entry.odds - 1) : -1;
  stats.roi = Number(((stats.roi * (stats.wins + stats.losses - 1) + impliedProfit) / (stats.wins + stats.losses)).toFixed(4));
  profile.strategyStats[entry.strategy] = stats;

  writeLearningProfile(profile);
  writeBetResults([entry, ...results]);
}

export function calculateStrategyHealth(profile: LearningProfile, strategy: StrategyName) {
  const stats = profile.strategyStats[strategy] ?? defaultStats();
  const total = stats.wins + stats.losses;
  const winRate = total ? stats.wins / total : 0;
  return {
    total,
    winRate,
    roi: stats.roi,
    recentLosses: stats.recent.slice(0, 5).filter((r) => r === "loss").length,
  };
}
