"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, Brain, CircleDollarSign, Cpu, Flame, Send, Wallet } from "lucide-react";
import type { BetOrderData, GameData } from "@azuro-org/toolkit";
import { BetOrderResult, BetOrderState } from "@azuro-org/toolkit";
import type { ComponentType, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";

import type { BetSlipSelection } from "@/components/bets/bet-slip";
import { BetPage } from "@/components/bets/bet-page";
import { LiveMatchesPanel } from "@/components/lambor/live-matches-panel";
import { StrategyInsightsStrip } from "@/components/lambor/strategy-insights";
import { StrategyPackagesPanel } from "@/components/lambor/strategy-packages-panel";
import { LamborWalletLayer } from "@/components/wallet/lambor-wallet-layer";
import { useLiveMatches } from "@/hooks/use-live-matches";
import type { ConditionsByGameId } from "@/lib/azuro/fetch-conditions";
import { useAzuroBets, useInvalidateAzuroBets } from "@/hooks/use-azuro-bets";
import { azuroBetPnl, formatAzuroBetTitle, isAzuroBetOpen } from "@/lib/azuro/bet-helpers";
import { pickSelectionFromLiveMatch } from "@/lib/lambor/pick-selection-from-live";
import { executeCommand, parseCommand } from "@/lib/lambor-ai/chat-action-engine";
import { processLamborStrategy } from "@/lib/lambor-ai/decision-engine";
import { evaluateMatchesDecisionFirst, riskLevelFromConfidence } from "@/lib/lambor-ai/engine";
import { readLearningProfile, recordBetResult } from "@/lib/lambor-ai/learning";
import { isLiveInPlayMatch } from "@/lib/lambor-ai/live-status";
import { STRATEGY_ORDER } from "@/lib/lambor-ai/strategies";
import { liveMatchToAnalyticsInput } from "@/lib/lambor/live-match-analytics";
import type { StrategyName, StrategyResult } from "@/lib/lambor-ai/types";
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

function filterLiveMatchesForBetGames(matches: LiveMatch[], orders: BetOrderData[]): LiveMatch[] {
  const gameIds = new Set<string>();
  for (const o of orders) {
    for (const c of o.conditions) {
      gameIds.add(String(c.gameId));
    }
  }
  if (gameIds.size === 0) return [];
  return matches.filter((m) => gameIds.has(String(m.id)));
}

function formatStrategyLabel(name: StrategyName) {
  return name.replace(/_/g, " ");
}

function orderStrategyBreakdown(rows: StrategyResult[]): StrategyResult[] {
  const order = new Map(STRATEGY_ORDER.map((n, i) => [n, i]));
  return [...rows].sort((a, b) => (order.get(a.strategy) ?? 999) - (order.get(b.strategy) ?? 999));
}

function riskBadgeClass(level: "LOW" | "MEDIUM" | "HIGH") {
  if (level === "LOW") return "border-emerald-500/45 bg-emerald-500/10 text-emerald-300";
  if (level === "MEDIUM") return "border-amber-500/45 bg-amber-500/10 text-amber-200";
  return "border-red-500/40 bg-red-500/10 text-red-300";
}

function decisionBadgeClass(color: "green" | "yellow" | "red") {
  if (color === "green") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (color === "yellow") return "border-amber-500/45 bg-amber-500/10 text-amber-200";
  return "border-red-500/40 bg-red-500/10 text-red-300";
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

function engineGlowClass(color: "green" | "yellow" | "red") {
  if (color === "green") return "border-emerald-500/35 shadow-[0_0_24px_rgba(0,255,163,0.12)]";
  if (color === "yellow") return "border-amber-500/35 shadow-[0_0_24px_rgba(245,158,11,0.12)]";
  return "border-red-500/30 shadow-[0_0_22px_rgba(239,68,68,0.10)]";
}

function enginePillClass(color: "green" | "yellow" | "red") {
  if (color === "green") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (color === "yellow") return "border-amber-500/45 bg-amber-500/10 text-amber-200";
  return "border-red-500/40 bg-red-500/10 text-red-300";
}

function EnginePickCard({
  pick,
  isBestPick,
  onSelect,
}: {
  pick: ReturnType<typeof processLamborStrategy>["results"][number];
  isBestPick: boolean;
  onSelect: (selection: BetSlipSelection) => void;
}) {
  const action =
    pick.confidence >= 80 ? { text: "Bet Now", style: "green" as const } : pick.confidence >= 60 ? { text: "Consider", style: "yellow" as const } : { text: "Avoid", style: "red" as const };

  const [home, away] = pick.match.split(" vs ").map((s) => s.trim());
  const canSelect = action.style !== "red" && Boolean(home) && Boolean(away);

  return (
    <div className={`rounded-2xl border bg-zinc-900/55 p-4 backdrop-blur-xl ${engineGlowClass(pick.color)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {isBestPick ? (
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
              <span>🔥 BEST PICK</span>
            </div>
          ) : null}
          <p className="truncate text-sm font-semibold text-zinc-100">{pick.match}</p>
          <p className="mt-1 text-[11px] text-zinc-500">{pick.reason}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-semibold text-zinc-100">{pick.confidence}%</p>
          <div className="mt-1 flex items-center justify-end gap-1.5">
            <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${enginePillClass(pick.color)}`}>{pick.label}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${
            pick.decision === "BET" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-zinc-600 bg-zinc-800/80 text-zinc-400"
          }`}
        >
          {pick.decision}
        </span>

        <button
          type="button"
          disabled={!canSelect}
          onClick={() =>
            onSelect({
              gameTitle: pick.match,
              marketTitle: "LAMBOR Engine Pick",
              outcomeTitle: action.text,
              conditionId: "engine",
              outcomeId: "engine",
              odds: "1.00",
              executable: false,
            })
          }
          className={`rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
            action.style === "green"
              ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-300 shadow-[0_0_18px_rgba(0,255,163,0.25)] hover:bg-emerald-500/20"
              : action.style === "yellow"
                ? "border-amber-400/60 bg-amber-500/10 text-amber-200 shadow-[0_0_16px_rgba(245,158,11,0.18)] hover:bg-amber-500/15"
                : "border-red-500/40 bg-red-500/10 text-red-300"
          }`}
        >
          {action.text}
        </button>
      </div>
    </div>
  );
}

type DashScreenProps = {
  games: GameData[];
  total: number;
  azuroOrders: BetOrderData[];
  onSelect: (selection: BetSlipSelection) => void;
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
  onSelect,
  conditionsByGameId,
  liveMatches,
  liveLoading,
  liveError,
  onSelectLive,
  onOpenBetTab,
}: DashScreenProps) {
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
    <div className="space-y-4">
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
            {topPicks.map((pick) => (
              <EnginePickCard
                key={pick.match}
                pick={pick}
                isBestPick={engineOutput.bestPick?.match === pick.match}
                onSelect={onSelect}
              />
            ))}
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

type MindScreenProps = {
  games: GameData[];
  conditionsByGameId: ConditionsByGameId;
  liveMatches: LiveMatch[];
  liveLoading: boolean;
  liveError: string | null;
  azuroOrders: BetOrderData[];
  onOpenBetTab: () => void;
};

function MindScreen({
  games,
  conditionsByGameId,
  liveMatches,
  liveLoading,
  liveError,
  azuroOrders,
  onOpenBetTab,
}: MindScreenProps) {
  const feed = useMemo(() => {
    return games.slice(0, 3).map((game) => {
      const condition = (conditionsByGameId[game.gameId] ?? [])[0];
      const outcome = condition?.outcomes?.[0];
      const odds = Number.parseFloat(outcome?.odds ?? "0");
      const confidence = Number.isFinite(odds) && odds > 0 ? Math.round(Math.min(92, Math.max(38, (1 / odds) * 100))) : 50;
      const decision = confidence >= 58 ? "BET" : "NO BET";
      const tag = confidence >= 75 ? "HIGH CONFIDENCE" : confidence >= 58 ? "RISKY" : "REJECTED";
      return {
        match: game.title,
        confidence,
        decision,
        tag,
        reasoning: condition
          ? `Azuro market "${condition.title ?? condition.conditionId}" shows top outcome at ${outcome?.odds ?? "-"} odds.`
          : "No condition market published yet for this event.",
      };
    });
  }, [conditionsByGameId, games]);
  const [learningRefresh, setLearningRefresh] = useState(0);
  const liveInPlayMatches = useMemo(() => liveMatches.filter(isLiveInPlayMatch), [liveMatches]);
  const decisionCards = useMemo(() => {
    const refreshToken = learningRefresh;
    void refreshToken;
    if (liveInPlayMatches.length === 0) return [];
    const profile = readLearningProfile();
    const inputs = liveInPlayMatches.map(liveMatchToAnalyticsInput);
    return evaluateMatchesDecisionFirst(inputs, profile);
  }, [liveInPlayMatches, learningRefresh]);
  const showRejected = false;
  const visibleDecisionCards = useMemo(
    () =>
      showRejected
        ? decisionCards
        : decisionCards.filter((card) => card.confidence >= 65 && card.decision !== "NO BET"),
    [decisionCards, showRejected],
  );

  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});

  function onRecordResult(
    decision: (typeof decisionCards)[number]["raw"],
    result: "win" | "loss",
  ) {
    const odds = result === "win" ? 1.7 : 1.4;
    recordBetResult({
      match: decision.match,
      strategy: decision.strategyUsed,
      confidence: decision.confidence,
      result,
      odds,
      league: "Live",
      minute: null,
      placedAt: new Date().toISOString(),
    });
    setLearningRefresh((value) => value + 1);
  }

  const [chatMessages, setChatMessages] = useState<
    Array<{ role: "user" | "assistant"; text: string }>
  >([
    { role: "user", text: "Should I hedge Arsenal +0.5 now?" },
    {
      role: "assistant",
      text: "Hedge 30% at 1.74. Volatility spike expected after minute 88.",
    },
  ]);
  const [chatDraft, setChatDraft] = useState("");
  const [showBetMomentum, setShowBetMomentum] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<ReturnType<typeof parseCommand> | null>(null);
  const [executing, setExecuting] = useState(false);
  const { address: connectedAddress } = useAccount();
  const invalidateAzuroBets = useInvalidateAzuroBets();

  const betMomentumMatches = useMemo(
    () => filterLiveMatchesForBetGames(liveMatches, azuroOrders),
    [liveMatches, azuroOrders],
  );
  const hasBetGamesForMomentum = useMemo(
    () => azuroOrders.some((o) => o.conditions.length > 0),
    [azuroOrders],
  );

  async function runPendingCommand(command: ReturnType<typeof parseCommand>) {
    setExecuting(true);
    setChatMessages((prev) => [...prev, { role: "assistant", text: "⏳ Executing..." }]);
    try {
      const withdrawAddress =
        typeof window === "undefined"
          ? ""
          : (window.localStorage.getItem("lambor.wallet.withdrawAddress.v1") ?? "");
      const result = await executeCommand(command, {
        activeWalletAddress: connectedAddress ?? null,
        withdrawAddress,
        liveMatches,
        onOpenBetTab,
        getStatusSummary: () =>
          visibleDecisionCards.length === 0
            ? "No high-quality bets available right now."
            : `${visibleDecisionCards.length} actionable opportunities are live.`,
      });
      setChatMessages((prev) => [...prev, { role: "assistant", text: result.message }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", text: "❌ Command execution failed." }]);
    } finally {
      setExecuting(false);
      setPendingCommand(null);
    }
  }

  async function sendMindChat() {
    const text = chatDraft.trim().replace(/\s+/g, " ");
    if (!text) return;
    setChatDraft("");
    setChatMessages((prev) => [...prev, { role: "user", text }]);

    if (pendingCommand && /^yes$/i.test(text)) {
      await runPendingCommand(pendingCommand);
      return;
    }
    if (pendingCommand && /^(no|cancel)$/i.test(text)) {
      setPendingCommand(null);
      setChatMessages((prev) => [...prev, { role: "assistant", text: "Cancelled. No action executed." }]);
      return;
    }

    const command = parseCommand(text);
    if (command.intent === "unknown") {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "❌ I couldn't parse that command. Try: Place bet Arsenal +0.5, Hedge 30% Arsenal +0.5, Withdraw 10, Deposit 20, Status.",
        },
      ]);
      return;
    }

    setPendingCommand(command);
    const confirmationText =
      command.intent === "hedge"
        ? `Confirm hedge ${command.percentage ?? "-"}% ${command.market ?? ""}?`
        : command.intent === "place_bet"
          ? `Confirm bet execution for ${command.market ?? "selected market"}?`
          : command.intent === "withdraw"
            ? `Confirm withdraw ${command.amount ?? "-"}?`
            : command.intent === "deposit"
              ? `Confirm deposit ${command.amount ?? "-"}?`
              : "Run status check now?";
    setChatMessages((prev) => [...prev, { role: "assistant", text: `${confirmationText} Reply \"yes\" or \"no\".` }]);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {feed.map((item) => (
          <GlassCard key={item.match}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-100">{item.match}</p>
              <span className="rounded-md border border-zinc-600 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">{item.tag}</span>
            </div>
            <p className={`text-xs font-semibold ${item.decision === "BET" ? "text-emerald-300" : "text-zinc-300"}`}>
              {item.decision} • {item.confidence}% confidence
            </p>
            <p className="mt-1 text-xs text-zinc-400">{item.reasoning}</p>
          </GlassCard>
        ))}
      </div>

      <GlassCard>
        <p className="mb-1 text-xs uppercase tracking-[0.18em] text-zinc-400">Live Momentum (your bets)</p>
        <p className="mb-3 text-[11px] leading-snug text-zinc-500">
          Match info only for games you&apos;ve bet on. Nothing loads until you ask.
        </p>
        {!showBetMomentum ? (
          <button
            type="button"
            onClick={() => {
              void invalidateAzuroBets();
              setShowBetMomentum(true);
            }}
            className="w-full rounded-xl border border-emerald-500/45 bg-emerald-500/10 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
          >
            Show momentum for my bet games
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowBetMomentum(false)}
                className="flex-1 rounded-xl border border-zinc-600 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800/70"
              >
                Hide
              </button>
            </div>
            {!hasBetGamesForMomentum ? (
              <p className="text-xs text-zinc-500">
                No saved bets yet. Place a bet on the Bet tab first — then you can load momentum for those fixtures here.
              </p>
            ) : (
              <LiveMatchesPanel
                matches={betMomentumMatches}
                loading={liveLoading}
                error={liveError}
                emptyMessage="No live fixtures in the feed match your bet games right now."
              />
            )}
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <p className="mb-1 text-xs uppercase tracking-[0.18em] text-zinc-400">LAMBOR Strategy Engine</p>
        <p className="mb-3 text-[11px] leading-snug text-zinc-500">
          Decision-first mode: each match returns one action based on filtered strategies and risk-weighted confidence.
        </p>
        <div className="space-y-2.5">
          {visibleDecisionCards.length === 0 ? (
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-3">
              <p className="text-sm font-semibold text-zinc-200">No high-quality bets available</p>
              <p className="mt-1 text-xs text-zinc-500">
                Lambor is scanning for strong opportunities. Check back shortly.
              </p>
            </div>
          ) : (
            visibleDecisionCards.map((card) => (
              <div key={card.match} className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-zinc-100">{card.match}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${decisionBadgeClass(card.color)}`}>
                      {card.decision}
                    </span>
                    <span className="rounded border border-zinc-600 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
                      {card.confidence}%
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Top strategies:{" "}
                  <span className="text-zinc-300">{card.topStrategies.length > 0 ? card.topStrategies.join(", ") : "None"}</span>
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">{card.reason}</p>

                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedDetails((prev) => ({
                        ...prev,
                        [card.match]: !prev[card.match],
                      }))
                    }
                    className="rounded-md border border-zinc-600 px-2 py-1 text-[10px] font-semibold text-zinc-300 transition hover:bg-zinc-800/70"
                  >
                    {expandedDetails[card.match] ? "Hide Details" : "View Details"}
                  </button>
                </div>

                {expandedDetails[card.match] ? (
                  <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-700/80 bg-zinc-950/50">
                    <table className="w-full min-w-[280px] border-collapse text-left text-[10px]">
                      <thead>
                        <tr className="border-b border-zinc-700/80 text-zinc-500">
                          <th className="px-2 py-1.5 font-medium">Strategy</th>
                          <th className="px-2 py-1.5 font-medium">Conf.</th>
                          <th className="px-2 py-1.5 font-medium">Risk</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderStrategyBreakdown(card.raw.strategyBreakdown).map((row) => {
                          const level = riskLevelFromConfidence(row.confidence);
                          return (
                            <tr key={row.strategy} className="border-b border-zinc-800/80 last:border-0">
                              <td className="px-2 py-1.5 align-top text-zinc-300">{formatStrategyLabel(row.strategy)}</td>
                              <td className="px-2 py-1.5 text-zinc-400">{row.confidence.toFixed(1)}%</td>
                              <td className="px-2 py-1.5">
                                <span className={`inline-block rounded border px-1.5 py-0.5 font-semibold ${riskBadgeClass(level)}`}>
                                  {level}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={card.decision !== "BET"}
                    title={card.decision !== "BET" ? "Learning only recorded for BET signals" : undefined}
                    onClick={() => onRecordResult(card.raw, "win")}
                    className="rounded-md border border-emerald-500/50 px-2 py-1 text-[10px] font-semibold text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Mark Win
                  </button>
                  <button
                    type="button"
                    disabled={card.decision !== "BET"}
                    title={card.decision !== "BET" ? "Learning only recorded for BET signals" : undefined}
                    onClick={() => onRecordResult(card.raw, "loss")}
                    className="rounded-md border border-red-500/50 px-2 py-1 text-[10px] font-semibold text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Mark Loss
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </GlassCard>

      <GlassCard>
        <p className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-400">AI Chat</p>
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {chatMessages.map((m, index) => (
            <div
              key={`${index}-${m.text.slice(0, 24)}`}
              className={`max-w-[86%] rounded-xl border p-2.5 text-xs ${
                m.role === "user"
                  ? "border-zinc-700 bg-zinc-900/80 text-zinc-300"
                  : "ml-auto border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              }`}
            >
              {m.text}
            </div>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMindChat();
          }}
        >
          <textarea
            value={chatDraft}
            onChange={(event) => setChatDraft(event.target.value)}
            rows={1}
            className="min-h-11 max-h-36 min-w-0 flex-1 resize-y rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-emerald-400 focus:shadow-[0_0_20px_rgba(0,255,163,0.25)]"
            placeholder="Ask LAMBOR Mind..."
            enterKeyHint="send"
            autoComplete="off"
            aria-label="Message to LAMBOR Mind"
          />
          <button
            type="submit"
            disabled={!chatDraft.trim() || executing}
            className="flex h-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-4 text-emerald-300 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        {pendingCommand ? (
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void runPendingCommand(pendingCommand)}
              disabled={executing}
              className="rounded-md border border-emerald-500/50 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 disabled:opacity-40"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingCommand(null);
                setChatMessages((prev) => [...prev, { role: "assistant", text: "Cancelled. No action executed." }]);
              }}
              disabled={executing}
              className="rounded-md border border-zinc-600 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        ) : null}
      </GlassCard>
    </div>
  );
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
  const { matches: liveMatches, loading: liveLoading, error: liveError } = useLiveMatches();
  const { data: azuroOrders = [], refetch: refetchAzuroBets } = useAzuroBets();

  function handleSelectLiveMatch(match: LiveMatch) {
    setActiveTab("bet");
  }

  return (
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
              onSelect={() => setActiveTab("bet")}
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
              games={games}
              conditionsByGameId={conditionsByGameId}
              liveMatches={liveMatches}
              liveLoading={liveLoading}
              liveError={liveError}
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
  );
}
