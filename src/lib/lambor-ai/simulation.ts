import { evaluateMatches } from "@/lib/lambor-ai/engine";
import { createDefaultProfile } from "@/lib/lambor-ai/learning";
import type { EngineDecision, MatchAnalyticsInput } from "@/lib/lambor-ai/types";

export type SimulationMatch = MatchAnalyticsInput & {
  actualResult: "win" | "loss";
  odds: number;
};

export type SimulationReport = {
  total: number;
  bets: number;
  wins: number;
  losses: number;
  roi: number;
  threshold: number;
  decisions: EngineDecision[];
};

export function runSimulation(matches: SimulationMatch[], threshold = 80): SimulationReport {
  const profile = createDefaultProfile();
  profile.threshold = threshold;
  const decisions = evaluateMatches(matches, profile);

  let bets = 0;
  let wins = 0;
  let losses = 0;
  let pnl = 0;

  decisions.forEach((decision, index) => {
    if (decision.decision !== "BET") return;
    bets += 1;
    if (matches[index]?.actualResult === "win") {
      wins += 1;
      pnl += Math.max(0, (matches[index]?.odds ?? 1) - 1);
    } else {
      losses += 1;
      pnl -= 1;
    }
  });

  return {
    total: matches.length,
    bets,
    wins,
    losses,
    roi: bets ? Number((pnl / bets).toFixed(4)) : 0,
    threshold,
    decisions,
  };
}
