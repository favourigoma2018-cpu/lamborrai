"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, Brain, CircleDollarSign, Cpu, Flame, Wallet } from "lucide-react";
import type { BetOrderData, GameData } from "@azuro-org/toolkit";
import { BetOrderResult, BetOrderState } from "@azuro-org/toolkit";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import type { BetSlipSelection } from "@/components/bets/bet-slip";
import { BetPage } from "@/components/bets/bet-page";
import { BetSlipProvider } from "@/contexts/bet-slip-context";
import { LamborMindChat } from "@/components/lambor/LamborMindChat";
import { LiveMatchesPanel } from "@/components/lambor/live-matches-panel";
import { StrategyInsightsStrip } from "@/components/lambor/strategy-insights";
import { StrategyPackagesPanel } from "@/components/lambor/strategy-packages-panel";
import { LamborWalletLayer } from "@/components/wallet/lambor-wallet-layer";
import { useLiveMatches } from "@/hooks/use-live-matches";
import type { ConditionsByGameId } from "@/lib/azuro/fetch-conditions";
import { useAzuroBets, useInvalidateAzuroBets } from "@/hooks/use-azuro-bets";
import { azuroBetPnl, formatAzuroBetTitle, isAzuroBetOpen } from "@/lib/azuro/bet-helpers";
import { isValidAzuroSlipSelection } from "@/lib/azuro/slip-selection-guards";
import { useBetSlip } from "@/contexts/bet-slip-context";
import { pickSelectionFromAzuroGame, pickSelectionFromLiveMatch } from "@/lib/lambor/pick-selection-from-live";
import { processLamborStrategy } from "@/lib/lambor-ai/decision-engine";
import type { LiveMatch } from "@/types/live-matches";

type TabKey = "dash" | "bet" | "wall" | "mind";

const tabs: Array<{ key: TabKey; label: string; icon: ComponentType<{ className?: string }> }> = [
  { key: "dash", label: "Dash", icon: BarChart3 },
  { key: "bet", label: "Bet", icon: CircleDollarSign },
  { key: "wall", label: "Wall", icon: Wallet },
  { key: "mind", label: "Mind", icon: Brain },
];

function BullMark() {
  return (
    <div className="relative h-12 w-12 rounded-2xl border border-emerald-300/30 bg-zinc-900/70 p-2 shadow-[0_0_35px_rgba(0,255,163,0.25)]">
      <svg viewBox="0 0 60 60" className="h-full w-full">
        <path
          d="M8 34 Q16 14 29 24 Q40 13 52 22 M18 28 Q26 32 30 43 Q34 32 42 28 M24 44 L20 52 M36 44 L40 52"
          fill="none"
          stroke="#00ffa3"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="drop-shadow-[0_0_7px_#00ffa3]"
        />
      </svg>
    </div>
  );
}

function GlassCard({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`rounded-2xl border border-zinc-700/70 bg-zinc-900/55 p-4 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_30px_rgba(0,0,0,0.35)] ${className}`}
    >
      {children}
    </div>
  );
}

function formatStartTime(startsAt: string) {
  const sec = Number.parseInt(startsAt, 10);
  if (Number.isNaN(sec)) return startsAt;
  return new Date(sec * 1000).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function splitTeamsFromTitle(title: string): { home: string; away: string } {
  const normalized = title.replace(/\s+/g, " ").trim();
  const separators = [" vs ", " v ", " - ", " – ", " — "];
  for (const sep of separators) {
    if (normalized.toLowerCase().includes(sep.trim())) {
      const [homeRaw, awayRaw] = normalized.split(new RegExp(sep, "i")).map((s) => s.trim());
      if (homeRaw && awayRaw) return { home: homeRaw, away: awayRaw };
    }
  }
  return { home: normalized, away: "" };
}

function findGameForEnginePickTitle(pickMatch: string, games: GameData[]): GameData | null {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const target = norm(pickMatch);
  for (const game of games) {
    const { home, away } = splitTeamsFromTitle(game.title);
    const label = norm(`${home} vs ${away || "TBD"}`);
    if (label === target || norm(game.title) === target) return game;
  }
  return null;
}

function engineConfidenceTier(confidence: number): "high" | "mid" | "low" {
  if (confidence >= 75) return "high";
  if (confidence >= 60) return "mid";
  return "low";
}

function enginePillClass(color: "green" | "yellow" | "red") {
  if (color === "green") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (color === "yellow") return "border-amber-500/45 bg-amber-500/10 text-amber-200";
  return "border-red-500/40 bg-red-500/10 text-red-300";
}

function engineTierGlow(tier: "high" | "mid" | "low") {
  if (tier === "high") return "border-emerald-500/50 shadow-[0_0_22px_rgba(0,255,163,0.18)]";
  if (tier === "mid") return "border-amber-500/45 shadow-[0_0_20px_rgba(245,158,11,0.14)]";
  return "border-red-500/40 shadow-[0_0_18px_rgba(239,68,68,0.12)]";
}

function engineTierLabelClass(tier: "high" | "mid" | "low") {
  if (tier === "high") return "text-emerald-300";
  if (tier === "mid") return "text-amber-200";
  return "text-red-300";
}

function engineAddButtonClass(tier: "high" | "mid" | "low", disabled: boolean) {
  if (disabled) return "border-zinc-700 bg-zinc-800/60 text-zinc-500";
  if (tier === "high") return "border-emerald-400/70 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30";
  if (tier === "mid") return "border-amber-400/60 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25";
  return "border-red-400/55 bg-red-500/15 text-red-100 hover:bg-red-500/25";
}

function EnginePickCard({
  pick,
  isBestPick,
  selection,
  hasAzuro,
  inSlip,
  marketLabel,
  oddsLabel,
  onAddToBet,
}: {
  pick: ReturnType<typeof processLamborStrategy>["results"][number];
  isBestPick: boolean;
  selection: BetSlipSelection | null;
  hasAzuro: boolean;
  inSlip: boolean;
  marketLabel: string;
  oddsLabel: string;
  onAddToBet: () => void;
}) {
  const tier = engineConfidenceTier(pick.confidence);

  return (
    <div className={`rounded-2xl border bg-zinc-900/55 p-4 backdrop-blur-xl ${engineTierGlow(tier)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {isBestPick ? (
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
              <span>🔥 BEST PICK</span>
            </div>
          ) : null}
          <p className="truncate text-sm font-semibold text-zinc-100">{pick.match}</p>
          <p className="mt-0.5 text-[11px] text-zinc-400">{marketLabel}</p>
          <p className="mt-1 text-[11px] text-zinc-500">{pick.reason}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-2xl font-semibold ${engineTierLabelClass(tier)}`}>{pick.confidence}%</p>
          <p className="mt-1 text-sm font-semibold text-emerald-300">{oddsLabel}</p>
          <div className="mt-1 flex items-center justify-end gap-1.5">
            <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${enginePillClass(pick.color)}`}>{pick.label}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span
          className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
            pick.decision === "BET" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-zinc-600 bg-zinc-800/80 text-zinc-400"
          }`}
        >
          {pick.decision}
        </span>
        <button
          type="button"
          disabled={!hasAzuro || !Boolean(selection?.conditionId?.trim()) || inSlip}
          title={
            !hasAzuro || !selection?.conditionId
              ? "No Azuro condition mapped for this fixture."
              : inSlip
                ? "Already on your bet slip."
                : "Add this leg to the bet slip."
          }
          onClick={onAddToBet}
          className={`rounded-xl border px-4 py-2.5 text-xs font-bold transition active:scale-[0.99] ${engineAddButtonClass(tier, !hasAzuro || !selection?.conditionId || inSlip)}`}
        >
          {inSlip ? "Added" : "Add to Bet"}
        </button>
      </div>
    </div>
  );
}

type DashScreenProps = {
  games: GameData[];
  total: number;
  azuroOrders: BetOrderData[];
  conditionsByGameId: ConditionsByGameId;
  liveMatches: LiveMatch[];
  liveLoading: boolean;
  liveError: string | null;
  onSelectLive: (match: LiveMatch) => void;
  onOpenBetTab: () => void;
};

function DashScreen({
  games,
  total,
  azuroOrders,
  conditionsByGameId,
  liveMatches,
  liveLoading,
  liveError,
  onSelectLive,
  onOpenBetTab,
}: DashScreenProps) {
  const { addSelection, items: slipItems } = useBetSlip();
  const [dashToast, setDashToast] = useState<string | null>(null);

  useEffect(() => {
    if (!dashToast) return;
    const t = window.setTimeout(() => setDashToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [dashToast]);
  const netToday = useMemo(() => {
    const today = new Date().toDateString();
    return azuroOrders
      .filter((o) => new Date(o.createdAt).toDateString() === today)
      .reduce((sum, o) => sum + (azuroBetPnl(o) ?? 0), 0);
  }, [azuroOrders]);

  const settled = azuroOrders.filter((o) => o.state === BetOrderState.Settled);
  const successful = settled.filter((o) => o.result === BetOrderResult.Won).length;
  const hitRate = settled.length ? (successful / settled.length) * 100 : 0;
  const recent = settled.slice(0, 6).map((o) => (o.result === BetOrderResult.Won ? "W" : "L"));

  const activeBets = azuroOrders.filter(isAzuroBetOpen).slice(0, 3);
  void total;
  void conditionsByGameId;

  const engineInput = useMemo(() => {
    return games.map((game) => {
      const { home, away } = splitTeamsFromTitle(game.title);
      const oddsRaw = (conditionsByGameId[game.gameId] ?? [])[0]?.outcomes?.[0]?.odds ?? null;
      const primary = oddsRaw ? Number.parseFloat(String(oddsRaw)) : null;
      const hasOdds = typeof primary === "number" && Number.isFinite(primary) && primary > 1;

      return {
        teams: { home, away: away || "TBD" },
        kickoffAt: game.startsAt,
        odds: { primary: hasOdds ? primary : null },
        marketData: hasOdds ? { stable: true, consistency: 0.65 } : null,
        formStats: null,
        predictionSignals: null,
      };
    });
  }, [conditionsByGameId, games]);

  const engineOutput = useMemo(() => processLamborStrategy(engineInput), [engineInput]);
  const topPicks = engineOutput.results.slice(0, 5);

  return (
    <div className="relative space-y-4">
      <AnimatePresence>
        {dashToast ? (
          <motion.div
            key="dash-toast"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="pointer-events-none fixed left-1/2 top-24 z-[60] w-[min(100%-2rem,20rem)] -translate-x-1/2 rounded-xl border border-emerald-500/45 bg-zinc-950/95 px-4 py-2.5 text-center text-sm font-semibold text-emerald-100 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
          >
            {dashToast}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="grid grid-cols-2 gap-3">
        <GlassCard>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Today&apos;s Net</p>
          <p className={`mt-2 text-2xl font-semibold ${netToday >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {netToday >= 0 ? "+" : ""}${netToday.toFixed(2)}
          </p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Hit Rate</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-100">{hitRate.toFixed(1)}%</p>
        </GlassCard>
      </div>

      <GlassCard>
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Last Results (Placed)</p>
        <div className="mt-3 flex gap-2">
          {recent.length === 0 ? (
            <span className="text-xs text-zinc-500">No settled bets yet.</span>
          ) : (
            recent.map((result, index) => (
            <span
              key={`${result}-${index}`}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                result === "W"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-red-500/20 text-red-300 border border-red-500/30"
              }`}
            >
              {result}
            </span>
            ))
          )}
        </div>
      </GlassCard>

      <GlassCard>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Active Bets</p>
          <span className="text-xs text-emerald-300">{activeBets.length} open</span>
        </div>
        <div className="space-y-2.5">
          {activeBets.length === 0 ? (
            <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/70 px-3 py-2.5 text-sm text-zinc-400">
              No open Azuro orders.
            </div>
          ) : (
            activeBets.map((order) => (
              <div key={order.id} className="rounded-xl border border-zinc-700/60 bg-zinc-900/70 px-3 py-2.5 text-sm text-zinc-200">
                {formatAzuroBetTitle(order)} · {order.state}{" "}
                <span className="float-right text-zinc-500">${order.amount.toFixed(2)}</span>
              </div>
            ))
          )}
        </div>
      </GlassCard>

      <GlassCard>
        <p className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-400">Live Matches (API-Football)</p>
        <LiveMatchesPanel
          matches={liveMatches}
          loading={liveLoading}
          error={liveError}
          onBet={onSelectLive}
        />
      </GlassCard>

      <GlassCard>
        <StrategyInsightsStrip />
      </GlassCard>

      <GlassCard className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Strategy packages</p>
          <span className="text-[10px] text-zinc-500">Cached feed • no extra API</span>
        </div>
        <StrategyPackagesPanel
          liveMatches={liveMatches}
          liveLoading={liveLoading}
          liveError={liveError}
          games={games}
          conditionsByGameId={conditionsByGameId}
          onOpenBetTab={onOpenBetTab}
        />
      </GlassCard>

      <GlassCard className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">LAMBOR ENGINE PICKS</p>
          <span className="text-xs text-zinc-500">Top 5 • today only</span>
        </div>

        {topPicks.length === 0 ? (
          <p className="text-xs text-zinc-500">No eligible matches for today (valid odds required).</p>
        ) : (
          <div className="space-y-3">
            {topPicks.map((pick) => {
              const game = findGameForEnginePickTitle(pick.match, games);
              const selection = game ? pickSelectionFromAzuroGame(game, conditionsByGameId) : null;
              const hasAzuro =
                selection != null &&
                Boolean(selection.conditionId?.trim()) &&
                isValidAzuroSlipSelection(selection);
              const mk =
                hasAzuro && selection?.gameId ? (`azuro:${selection.gameId}` as const) : null;
              const inSlip = mk != null && slipItems.some((i) => i.matchKey === mk);
              const marketLabel = selection?.marketTitle ?? "—";
              const oddsLabel = selection?.odds ?? "—";

              return (
                <EnginePickCard
                  key={pick.match}
                  pick={pick}
                  isBestPick={engineOutput.bestPick?.match === pick.match}
                  selection={selection}
                  hasAzuro={hasAzuro}
                  inSlip={inSlip}
                  marketLabel={marketLabel}
                  oddsLabel={oddsLabel}
                  onAddToBet={() => {
                    if (!selection || !hasAzuro) return;
                    const out = addSelection(selection);
                    if (out === "duplicate" || inSlip) {
                      setDashToast("Already in bet slip");
                      return;
                    }
                    if (out === "invalid") {
                      setDashToast("Could not add — missing Azuro data");
                      return;
                    }
                    setDashToast("Added to bet slip");
                    onOpenBetTab();
                  }}
                />
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

type BetScreenProps = {
  games: GameData[];
  conditionsByGameId: ConditionsByGameId;
  liveMatches: LiveMatch[];
  liveLoading: boolean;
  liveError: string | null;
};

function BetScreen({
  games,
  conditionsByGameId,
  liveMatches,
  liveLoading,
  liveError,
}: BetScreenProps) {
  return (
    <BetPage
      liveMatches={liveMatches}
      liveLoading={liveLoading}
      liveError={liveError}
      recommendSelection={(match) => pickSelectionFromLiveMatch(match, games, conditionsByGameId)}
    />
  );
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function WallScreen() {
  return (
    <LamborWalletLayer />
  );
}

function MindScreen(props: {
  liveMatches: LiveMatch[];
  liveLoading: boolean;
  liveError: string | null;
  lastUpdated: number | null;
  refetchLiveMatches: () => Promise<void>;
  azuroOrders: BetOrderData[];
  onOpenBetTab: () => void;
}) {
  return <LamborMindChat {...props} />;
}

type LamborDashboardProps = {
  games: GameData[];
  conditionsByGameId: ConditionsByGameId;
  total: number;
  page: number;
  perPage: number;
};

export function LamborDashboard({ games, conditionsByGameId, total }: LamborDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("dash");
  const { matches: liveMatches, loading: liveLoading, error: liveError, lastUpdated, refetch } = useLiveMatches();
  const { data: azuroOrders = [], refetch: refetchAzuroBets } = useAzuroBets();

  function handleSelectLiveMatch(match: LiveMatch) {
    setActiveTab("bet");
  }

  return (
    <BetSlipProvider liveMatches={liveMatches}>
    <div className="mx-auto min-h-screen w-full max-w-md bg-[#0b0f14] px-4 pb-28 pt-5 text-zinc-100">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(0,255,163,0.14),rgba(0,0,0,0)_38%),radial-gradient(circle_at_bottom,rgba(0,255,136,0.08),rgba(0,0,0,0)_45%)]" />

      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BullMark />
          <div>
            <h1 className="text-xl font-semibold tracking-[0.18em] text-zinc-100">LAMBOR</h1>
            <p className="text-xs text-zinc-400">Live football intelligence</p>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-2 text-emerald-300 shadow-[0_0_20px_rgba(0,255,163,0.2)]">
          <Cpu className="h-4 w-4" />
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.section
          key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {activeTab === "dash" && (
            <DashScreen
              games={games}
              total={total}
              azuroOrders={azuroOrders}
              conditionsByGameId={conditionsByGameId}
              liveMatches={liveMatches}
              liveLoading={liveLoading}
              liveError={liveError}
              onSelectLive={handleSelectLiveMatch}
              onOpenBetTab={() => setActiveTab("bet")}
            />
          )}
          {activeTab === "bet" && (
            <BetScreen
              games={games}
              conditionsByGameId={conditionsByGameId}
              liveMatches={liveMatches}
              liveLoading={liveLoading}
              liveError={liveError}
            />
          )}
          {activeTab === "wall" && <WallScreen />}
          {activeTab === "mind" && (
            <MindScreen
              liveMatches={liveMatches}
              liveLoading={liveLoading}
              liveError={liveError}
              lastUpdated={lastUpdated}
              refetchLiveMatches={refetch}
              azuroOrders={azuroOrders}
              onOpenBetTab={() => setActiveTab("bet")}
            />
          )}
        </motion.section>
      </AnimatePresence>

      <button
        className="fixed bottom-20 left-1/2 z-30 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full border border-emerald-300/70 bg-emerald-400/15 text-emerald-200 shadow-[0_0_26px_rgba(0,255,163,0.55)] transition hover:scale-105"
        aria-label="Quick action"
      >
        <motion.span
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.8 }}
        >
          <Flame className="h-5 w-5" />
        </motion.span>
      </button>

      <nav className="fixed bottom-4 left-1/2 z-20 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-2xl border border-zinc-700/80 bg-zinc-900/85 p-2 backdrop-blur-2xl">
        <div className="grid grid-cols-4 gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  void refetchAzuroBets();
                }}
                className={`rounded-xl py-2 text-center transition ${
                  active ? "bg-emerald-500/20 text-emerald-300 shadow-[0_0_18px_rgba(0,255,163,0.25)]" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Icon className="mx-auto h-4 w-4" />
                <span className="mt-1 block text-[11px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
    </BetSlipProvider>
  );
}
