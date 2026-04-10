import type { StrategyPackageId } from "@/lib/lambor/strategy-packages/metadata";

const STORAGE_KEY = "lambor.strategyPackages.stats.v1";

export type StrategyPackageStats = {
  totalBets: number;
  wins: number;
  losses: number;
  totalStake: number;
  totalProfit: number;
  recent: Array<"win" | "loss">;
};

function empty(): StrategyPackageStats {
  return { totalBets: 0, wins: 0, losses: 0, totalStake: 0, totalProfit: 0, recent: [] };
}

export function readPackageStatsMap(): Record<string, StrategyPackageStats> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, StrategyPackageStats>;
    return typeof p === "object" && p !== null ? p : {};
  } catch {
    return {};
  }
}

export function writePackageStatsMap(map: Record<string, StrategyPackageStats>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getPackageStats(id: StrategyPackageId): StrategyPackageStats {
  const map = readPackageStatsMap();
  return map[id] ?? empty();
}

/** Prior win rate 0–100 for confidence blending; neutral 50 when sample is thin. */
export function getStrategyPriorWinRate(id: StrategyPackageId): number {
  const s = getPackageStats(id);
  const n = s.wins + s.losses;
  if (n < 3) return 50;
  return (s.wins / n) * 100;
}

/** Returns -15…+15 to fold into unified confidence (learning channel). */
export function getPackageLearningBoost(id: StrategyPackageId): number {
  const s = getPackageStats(id);
  const n = s.wins + s.losses;
  if (n < 3) return 0;

  const winRate = s.wins / n;
  let boost = 0;
  if (winRate > 0.65) boost += 5;
  else if (winRate < 0.5) boost -= 5;

  const streakLosses = s.recent.slice(0, 5).filter((x) => x === "loss").length;
  if (streakLosses >= 3) boost -= 5;

  return Math.max(-15, Math.min(15, boost));
}

export function recordStrategyPackageResult(
  id: StrategyPackageId,
  outcome: "win" | "loss",
  stake = 1,
  profit = 0,
) {
  if (typeof window === "undefined") return;
  const map = readPackageStatsMap();
  const cur = map[id] ?? empty();
  cur.totalBets += 1;
  if (outcome === "win") cur.wins += 1;
  else cur.losses += 1;
  cur.totalStake += stake;
  cur.totalProfit += profit;
  cur.recent = [outcome, ...cur.recent].slice(0, 15);
  map[id] = cur;
  writePackageStatsMap(map);
}
