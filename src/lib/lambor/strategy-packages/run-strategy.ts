import type { StrategyPackageId } from "@/lib/lambor/strategy-packages/metadata";
import {
  pickTwoOddsCombo,
  runLamborGeneral,
  runModerateUndersLive,
  runNoGoalLast15,
  runThreeInOne,
  runUnder25Ht,
} from "@/lib/lambor/strategy-engine/package-runners";
import type { StrategyEngineContext } from "@/lib/lambor/strategy-engine/types";
import type { LiveMatch } from "@/types/live-matches";

import { STRATEGY_PACKAGES } from "./metadata";
import type { StrategyPackageResult, StrategyScanRow } from "./result-types";

export type { StrategyPackageResult, StrategyScanRow } from "./result-types";

export type RunStrategyContext = StrategyEngineContext;

function metaLabel(id: StrategyPackageId): string {
  return STRATEGY_PACKAGES.find((p) => p.id === id)?.name ?? id;
}

/**
 * Pure strategy scan over in-memory matches. No network I/O.
 * Uses unified multi-factor engine + modular package rules.
 */
export function runStrategy(
  strategyId: StrategyPackageId,
  matches: LiveMatch[],
  ctx: RunStrategyContext,
): StrategyPackageResult {
  const strategy = metaLabel(strategyId);
  const base: Pick<StrategyPackageResult, "strategyId" | "strategy"> = {
    strategyId,
    strategy,
  };

  if (matches.length === 0) {
    return { ...base, matches: [] };
  }

  let rows: StrategyScanRow[] = [];
  let combinedOdds: number | undefined;

  switch (strategyId) {
    case "under_2_5_ht":
      rows = runUnder25Ht(matches, ctx, "under_2_5_ht", "2.5");
      break;
    case "under_1_5_ht":
      rows = runUnder25Ht(matches, ctx, "under_1_5_ht", "1.5");
      break;
    case "two_odds_combo": {
      const picked = pickTwoOddsCombo(matches, ctx, 2, 2.05);
      rows = picked.rows;
      combinedOdds = picked.combined;
      break;
    }
    case "three_in_one": {
      const picked = runThreeInOne(matches, ctx);
      rows = picked.rows;
      if (picked.combined !== undefined) combinedOdds = picked.combined;
      break;
    }
    case "no_goal_last_15":
      rows = runNoGoalLast15(matches, ctx, "no_goal_last_15");
      break;
    case "moderate_unders_live":
      rows = runModerateUndersLive(matches, ctx, "moderate_unders_live");
      break;
    case "lambor_general":
      rows = runLamborGeneral(matches, ctx, "lambor_general");
      break;
    default:
      rows = [];
  }

  const bestPick = rows[0] ?? undefined;

  return {
    ...base,
    matches: rows,
    ...(combinedOdds !== undefined && rows.length > 1 ? { combinedOdds } : {}),
    ...(bestPick ? { bestPick } : {}),
  };
}
