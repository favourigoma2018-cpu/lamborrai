"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { GameData } from "@azuro-org/toolkit";
import { Loader2, Sparkles, Trophy } from "lucide-react";
import { useCallback, useState } from "react";

import type { BetSlipSelection } from "@/components/bets/bet-slip";
import type { ConditionsByGameId } from "@/lib/azuro/fetch-conditions";
import { readBlockedLeagueIds } from "@/lib/lambor/blocked-leagues";
import { pickSelectionFromLiveMatch, pickUnder25FtFromLiveMatch } from "@/lib/lambor/pick-selection-from-live";
import { readLearningProfile } from "@/lib/lambor-ai/learning";
import { buildOddsOpenMap } from "@/lib/lambor/odds-snapshot";
import { readBankroll } from "@/lib/lambor/strategy-engine/bankroll";
import { getPackageLearningBoost, getStrategyPriorWinRate } from "@/lib/lambor/strategy-engine/package-learning";
import { STRATEGY_PACKAGES, type StrategyPackageId } from "@/lib/lambor/strategy-packages/metadata";
import { runStrategy, type StrategyPackageResult } from "@/lib/lambor/strategy-packages/run-strategy";
import { enqueueSlipSelections } from "@/lib/lambor/slip-queue";
import type { LiveMatch } from "@/types/live-matches";

function riskClass(level: "LOW" | "MEDIUM" | "HIGH") {
  if (level === "LOW") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (level === "MEDIUM") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-red-500/35 bg-red-500/10 text-red-300";
}

type StrategyPackagesPanelProps = {
  liveMatches: LiveMatch[];
  liveLoading: boolean;
  liveError: string | null;
  games: GameData[];
  conditionsByGameId: ConditionsByGameId;
  onOpenBetTab: () => void;
};

export function StrategyPackagesPanel({
  liveMatches,
  liveLoading,
  liveError,
  games,
  conditionsByGameId,
  onOpenBetTab,
}: StrategyPackagesPanelProps) {
  const [activeId, setActiveId] = useState<StrategyPackageId | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<StrategyPackageResult | null>(null);

  const runScan = useCallback(
    async (strategyId: StrategyPackageId) => {
      setActiveId(strategyId);
      setResult(null);
      setScanning(true);
      await new Promise((r) => setTimeout(r, 380));
      const profile = readLearningProfile();
      const br = readBankroll();
      const blocked = readBlockedLeagueIds();

      const pickForStrategy = (m: LiveMatch) =>
        strategyId === "moderate_unders_live"
          ? pickUnder25FtFromLiveMatch(m, games, conditionsByGameId)
          : pickSelectionFromLiveMatch(m, games, conditionsByGameId);

      const getOddsForMatch = (m: LiveMatch) => pickForStrategy(m)?.odds ?? "1.50";

      const oddsOpenByMatchId = buildOddsOpenMap(liveMatches, (matchId) => {
        const m = liveMatches.find((x) => x.id === matchId);
        if (!m) return 1.5;
        const raw = pickForStrategy(m)?.odds ?? "1.50";
        const dec = Number.parseFloat(raw);
        return Number.isFinite(dec) && dec > 1 ? dec : 1.5;
      });

      const out = runStrategy(strategyId, liveMatches, {
        getOddsForMatch,
        profile,
        getPackageLearningBoost: (id) => getPackageLearningBoost(id),
        getStrategyPriorWinRate: (id) => getStrategyPriorWinRate(id),
        bankrollUsd: br.balance,
        dailyLossUsd: br.lastDailyLoss,
        blockedLeagueIds: new Set(blocked),
        oddsOpenByMatchId,
      });
      setResult(out);
      setScanning(false);
    },
    [liveMatches, games, conditionsByGameId],
  );

  function addAllToSlip() {
    if (!result?.matches.length) return;
    const selections: BetSlipSelection[] = [];
    for (const row of result.matches) {
      const sel =
        result.strategyId === "moderate_unders_live"
          ? pickUnder25FtFromLiveMatch(row.match, games, conditionsByGameId)
          : pickSelectionFromLiveMatch(row.match, games, conditionsByGameId);
      if (sel) selections.push(sel);
    }
    if (selections.length === 0) return;
    enqueueSlipSelections(selections, result.strategyId);
    onOpenBetTab();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2.5 sm:grid-cols-2">
        {STRATEGY_PACKAGES.map((pkg) => {
          const selected = activeId === pkg.id;
          return (
            <button
              key={pkg.id}
              type="button"
              onClick={() => void runScan(pkg.id)}
              disabled={liveLoading || Boolean(liveError) || liveMatches.length === 0}
              className={`rounded-2xl border p-3 text-left transition ${
                selected
                  ? "border-emerald-400/60 bg-emerald-500/10 shadow-[0_0_20px_rgba(0,255,163,0.15)]"
                  : "border-zinc-700/70 bg-zinc-900/55 hover:border-zinc-600"
              } disabled:cursor-not-allowed disabled:opacity-45`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-100">{pkg.name}</p>
                <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold ${riskClass(pkg.riskLevel)}`}>
                  {pkg.riskLevel}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">{pkg.description}</p>
              <p className="mt-2 text-[10px] text-zinc-600">
                Odds: <span className="text-zinc-400">{pkg.oddsRangeLabel}</span>
              </p>
            </button>
          );
        })}
      </div>

      {liveError ? <p className="text-xs text-red-300">{liveError}</p> : null}
      {!liveLoading && liveMatches.length === 0 ? (
        <p className="text-xs text-zinc-500">Load live matches first — strategy scan uses your cached feed.</p>
      ) : null}

      <AnimatePresence mode="wait">
        {scanning ? (
          <motion.div
            key="scan"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-200"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Scanning matches…
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {result && !scanning ? (
          <motion.div
            key="out"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3 rounded-2xl border border-zinc-700/70 bg-zinc-950/50 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">{result.strategy}</p>
              {result.combinedOdds != null && result.matches.length > 1 ? (
                <span className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-300">
                  Combined ~{result.combinedOdds.toFixed(2)}x
                </span>
              ) : null}
            </div>

            {result.matches.length === 0 ? (
              <p className="text-sm text-zinc-500">No qualifying fixtures for this package right now.</p>
            ) : (
              <ul className="space-y-2">
                {result.matches.map((row, idx) => {
                  const isBest = result.bestPick?.match.id === row.match.id;
                  return (
                    <li
                      key={`${row.match.id}-${idx}`}
                      className={`rounded-xl border px-3 py-2.5 ${
                        isBest ? "border-emerald-400/50 bg-emerald-500/10" : "border-zinc-700/60 bg-zinc-900/60"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {isBest ? (
                            <span className="mb-1 inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-semibold text-emerald-300">
                              <Trophy className="h-3 w-3" /> Best pick
                            </span>
                          ) : null}
                          <p className="truncate text-sm font-medium text-zinc-100">
                            {row.match.homeTeam} vs {row.match.awayTeam}
                          </p>
                          <p className="mt-0.5 text-[11px] text-zinc-500">{row.market}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-emerald-300">{row.odds}</p>
                          <p className="text-[10px] text-zinc-500">{row.confidence.toFixed(0)}%</p>
                          {row.stakeSuggested != null ? (
                            <p className="text-[10px] text-zinc-500">Stake ~${row.stakeSuggested.toFixed(2)}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {row.liveRiskBand ? (
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${
                              row.liveRiskBand === "GREEN"
                                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                                : "border-amber-500/50 bg-amber-500/15 text-amber-200"
                            }`}
                          >
                            {row.liveRiskBand}
                          </span>
                        ) : null}
                        {row.flagForApproval ? (
                          <span className="rounded border border-amber-500/40 px-1.5 py-0.5 text-[9px] font-semibold text-amber-200">
                            Manual approval (stake over $25)
                          </span>
                        ) : null}
                        <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${riskClass(row.risk)}`}>
                          {row.risk}
                        </span>
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${
                            row.decision === "BET"
                              ? "border-emerald-500/40 text-emerald-300"
                              : row.decision === "WATCH"
                                ? "border-amber-500/40 text-amber-200"
                                : "border-zinc-600 text-zinc-500"
                          }`}
                        >
                          {row.decision}
                        </span>
                        <span className="inline-flex items-center gap-0.5 rounded border border-zinc-600 px-1.5 py-0.5 text-[9px] text-zinc-400">
                          <Sparkles className="h-3 w-3 text-amber-400/90" />
                          {row.label}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[10px] text-zinc-500">
                        {row.tacticalReason ? <span className="block text-zinc-400">{row.tacticalReason}</span> : null}
                        Momentum {row.momentumScore.toFixed(0)} • Est. xG {row.totalXg.toFixed(2)} • Odds{" "}
                        {row.oddsTrend === "decreasing" ? "↓" : row.oddsTrend === "increasing" ? "↑" : "→"}
                        {row.scanMinute != null ? ` • Min ${row.scanMinute}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}

            {result.matches.length > 0 ? (
              <button
                type="button"
                onClick={addAllToSlip}
                className="w-full rounded-xl border border-emerald-500/50 bg-emerald-500/15 py-2.5 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
              >
                Add all to bet slip
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
