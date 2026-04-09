"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, Brain, CircleDollarSign, Cpu, Flame, Wallet } from "lucide-react";
import type { GameData } from "@azuro-org/toolkit";
import type { ComponentType, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useAccount, useBalance, useChainId } from "wagmi";

import { BetSlip, type BetSlipSelection } from "@/components/bets/bet-slip";
import { LiveMatchesPanel } from "@/components/lambor/live-matches-panel";
import { targetChain } from "@/config/chain";
import { useLiveMatches } from "@/hooks/use-live-matches";
import type { ConditionsByGameId } from "@/lib/azuro/fetch-conditions";
import { readPlacedBets } from "@/lib/bets/local-bets";
import { evaluateMatches } from "@/lib/lambor-ai/engine";
import { readLearningProfile, recordBetResult } from "@/lib/lambor-ai/learning";
import type { EngineDecision, MatchAnalyticsInput } from "@/lib/lambor-ai/types";
import type { PlacedBetRecord } from "@/types/bets";
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

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(fc|cf|sc|ac|club|deportivo|sporting)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreGameMatch(gameTitle: string, home: string, away: string) {
  const title = normalizeName(gameTitle);
  const homeName = normalizeName(home);
  const awayName = normalizeName(away);
  let score = 0;
  if (title.includes(homeName)) score += 2;
  if (title.includes(awayName)) score += 2;

  const homeToken = homeName.split(" ")[0];
  const awayToken = awayName.split(" ")[0];
  if (homeToken && title.includes(homeToken)) score += 1;
  if (awayToken && title.includes(awayToken)) score += 1;
  return score;
}

function scoreLeagueMatch(gameLeague: string, liveLeague: string) {
  const game = normalizeName(gameLeague);
  const live = normalizeName(liveLeague);
  if (!game || !live) return 0;
  if (game === live) return 3;
  if (game.includes(live) || live.includes(game)) return 2;

  const gameToken = game.split(" ")[0];
  const liveToken = live.split(" ")[0];
  if (gameToken && liveToken && gameToken === liveToken) return 1;
  return 0;
}

function scoreKickoffProximity(gameStartsAt: string, liveTimestamp: number) {
  const startsAtSec = Number.parseInt(gameStartsAt, 10);
  if (!Number.isFinite(startsAtSec) || !Number.isFinite(liveTimestamp) || liveTimestamp <= 0) return 0;

  const diffHours = Math.abs(startsAtSec - liveTimestamp) / 3600;
  if (diffHours <= 2) return 3;
  if (diffHours <= 6) return 2;
  if (diffHours <= 12) return 1;
  return 0;
}

function pickSelectionFromLiveMatch(
  match: LiveMatch,
  games: GameData[],
  conditionsByGameId: ConditionsByGameId,
): BetSlipSelection | null {
  const ranked = games
    .map((game) => ({
      game,
      score:
        scoreGameMatch(game.title, match.homeTeam, match.awayTeam) * 3 +
        scoreLeagueMatch(game.league.name, match.league) * 2 +
        scoreKickoffProximity(game.startsAt, match.timestamp),
    }))
    .sort((a, b) => b.score - a.score);

  const candidate = ranked.find(({ game, score }) => {
    const conditions = conditionsByGameId[game.gameId] ?? [];
    return score > 0 && conditions.length > 0 && (conditions[0]?.outcomes?.length ?? 0) > 0;
  });

  const fallback = ranked.find(({ game }) => {
    const conditions = conditionsByGameId[game.gameId] ?? [];
    return conditions.length > 0 && (conditions[0]?.outcomes?.length ?? 0) > 0;
  });

  const selectedGame = candidate?.game ?? fallback?.game;
  if (!selectedGame) return null;

  const condition = (conditionsByGameId[selectedGame.gameId] ?? [])[0];
  const outcome = condition?.outcomes?.[0];
  if (!condition || !outcome) return null;

  return {
    gameTitle: selectedGame.title,
    marketTitle: condition.title ?? `Market ${condition.conditionId}`,
    outcomeTitle: outcome.title ?? `Outcome ${outcome.outcomeId}`,
    conditionId: condition.conditionId,
    outcomeId: outcome.outcomeId,
    odds: outcome.odds,
  };
}

function parseScore(score: string) {
  const [homeRaw, awayRaw] = score.split("-").map((part) => Number.parseInt(part.trim(), 10));
  return {
    homeGoals: Number.isFinite(homeRaw) ? homeRaw : 0,
    awayGoals: Number.isFinite(awayRaw) ? awayRaw : 0,
  };
}

function toAnalyticsInput(match: LiveMatch): MatchAnalyticsInput {
  const { homeGoals, awayGoals } = parseScore(match.score);
  const minute = match.minute ?? 0;
  const baselinePressure = Math.max(2, Math.floor(minute / 10));
  return {
    ...match,
    homeGoals,
    awayGoals,
    shotsOnTargetHome: match.shotsOnTargetHome ?? homeGoals + baselinePressure,
    shotsOnTargetAway: match.shotsOnTargetAway ?? awayGoals + Math.max(1, baselinePressure - 1),
    totalShotsHome: match.totalShotsHome ?? homeGoals * 2 + baselinePressure * 2,
    totalShotsAway: match.totalShotsAway ?? awayGoals * 2 + baselinePressure * 2 - 1,
    attacksHome: match.attacksHome ?? baselinePressure * 5,
    attacksAway: match.attacksAway ?? baselinePressure * 5,
    dangerousAttacksHome: match.dangerousAttacksHome ?? baselinePressure * 2,
    dangerousAttacksAway: match.dangerousAttacksAway ?? baselinePressure * 2,
    possessionHome: match.possessionHome ?? 50,
    possessionAway: match.possessionAway ?? 50,
    redCardsHome: match.redCardsHome ?? 0,
    redCardsAway: match.redCardsAway ?? 0,
    favoriteOdds: 1.55,
  };
}

type DashScreenProps = {
  games: GameData[];
  total: number;
  placedBets: PlacedBetRecord[];
  onSelect: (selection: BetSlipSelection) => void;
  conditionsByGameId: ConditionsByGameId;
  liveMatches: LiveMatch[];
  liveLoading: boolean;
  liveError: string | null;
  onSelectLive: (match: LiveMatch) => void;
};

function DashScreen({
  games,
  total,
  placedBets,
  onSelect,
  conditionsByGameId,
  liveMatches,
  liveLoading,
  liveError,
  onSelectLive,
}: DashScreenProps) {
  const netToday = useMemo(() => {
    const today = new Date().toDateString();
    return placedBets
      .filter((bet) => new Date(bet.createdAt).toDateString() === today)
      .reduce((sum, bet) => {
        const stake = Number.parseFloat(bet.amount) || 0;
        const payout = Number.parseFloat(bet.potentialPayout) || 0;
        if (bet.status === "success") return sum + (payout - stake);
        if (bet.status === "failed") return sum - stake;
        return sum;
      }, 0);
  }, [placedBets]);

  const settled = placedBets.filter((bet) => bet.status === "success" || bet.status === "failed");
  const successful = settled.filter((bet) => bet.status === "success").length;
  const hitRate = settled.length ? (successful / settled.length) * 100 : 0;
  const recent = settled.slice(0, 6).map((bet) => (bet.status === "success" ? "W" : "L"));

  const activeBets = placedBets.filter((bet) => bet.status === "pending").slice(0, 3);
  const matchRows = games.slice(0, 5);

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
          <span className="text-xs text-emerald-300">{activeBets.length} pending</span>
        </div>
        <div className="space-y-2.5">
          {activeBets.length === 0 ? (
            <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/70 px-3 py-2.5 text-sm text-zinc-400">
              No pending bets.
            </div>
          ) : (
            activeBets.map((bet) => (
              <div key={bet.id} className="rounded-xl border border-zinc-700/60 bg-zinc-900/70 px-3 py-2.5 text-sm text-zinc-200">
                {bet.outcomeTitle} @ {bet.odds} <span className="float-right text-zinc-500">${bet.amount}</span>
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
        <p className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-400">Azuro Matches (Prematch)</p>
        <div className="space-y-3">
          {matchRows.map((game) => {
            const condition = (conditionsByGameId[game.gameId] ?? [])[0];
            const outcome = condition?.outcomes?.[0];

            return (
            <div key={game.gameId} className="flex items-center justify-between rounded-xl border border-zinc-700/50 bg-zinc-900/70 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-zinc-100">{game.title}</p>
                <p className="text-xs text-zinc-500">
                  {game.league.name} • {formatStartTime(game.startsAt)}
                </p>
              </div>
              <button
                disabled={!condition || !outcome}
                onClick={() =>
                  condition &&
                  outcome &&
                  onSelect({
                    gameTitle: game.title,
                    marketTitle: condition.title ?? `Market ${condition.conditionId}`,
                    outcomeTitle: outcome.title ?? `Outcome ${outcome.outcomeId}`,
                    conditionId: condition.conditionId,
                    outcomeId: outcome.outcomeId,
                    odds: outcome.odds,
                  })
                }
                className="rounded-lg border border-emerald-400/60 px-3 py-1.5 text-xs font-semibold text-emerald-300 shadow-[0_0_16px_rgba(0,255,163,0.25)] transition hover:bg-emerald-500/10 disabled:opacity-40"
              >
                Bet
              </button>
            </div>
          );
          })}
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">Showing {matchRows.length} of {total} Azuro events.</p>
      </GlassCard>

      <GlassCard>
        <p className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-400">Loading Pipeline</p>
        <div className="space-y-2.5">
          <div className="h-9 animate-pulse rounded-xl bg-zinc-800/80" />
          <div className="h-9 animate-pulse rounded-xl bg-zinc-800/70" />
          <div className="h-9 animate-pulse rounded-xl bg-zinc-800/60" />
        </div>
      </GlassCard>
    </div>
  );
}

type BetScreenProps = {
  games: GameData[];
  conditionsByGameId: ConditionsByGameId;
  selection: BetSlipSelection | null;
  onSelect: (selection: BetSlipSelection) => void;
  onClear: () => void;
  liveMatches: LiveMatch[];
  liveLoading: boolean;
  liveError: string | null;
  onSelectLive: (match: LiveMatch) => void;
  selectedLiveMatch: LiveMatch | null;
};

function BetScreen({
  games,
  conditionsByGameId,
  selection,
  onSelect,
  onClear,
  liveMatches,
  liveLoading,
  liveError,
  onSelectLive,
  selectedLiveMatch,
}: BetScreenProps) {
  const [stake, setStake] = useState("0");
  const [confidence, setConfidence] = useState(68);
  const odds = selection?.odds ?? "0";

  const payout = useMemo(() => {
    const stakeNum = Number.parseFloat(stake) || 0;
    const oddsNum = Number.parseFloat(odds) || 0;
    return (stakeNum * oddsNum).toFixed(2);
  }, [stake, odds]);

  return (
    <GlassCard className="space-y-3">
      <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Bet Slip</p>
      <input className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-400 focus:shadow-[0_0_20px_rgba(0,255,163,0.25)]" placeholder="Match" value={selection?.gameTitle ?? "Select from Azuro markets below"} readOnly />
      <input className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-400 focus:shadow-[0_0_20px_rgba(0,255,163,0.25)]" placeholder="Market" value={selection?.marketTitle ?? "-"} readOnly />
      <div className="grid grid-cols-2 gap-3">
        <input
          className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-400 focus:shadow-[0_0_20px_rgba(0,255,163,0.25)]"
          placeholder="Stake"
          value={stake}
          onChange={(event) => setStake(event.target.value)}
        />
        <input
          className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-400 focus:shadow-[0_0_20px_rgba(0,255,163,0.25)]"
          placeholder="Odds"
          value={odds}
          readOnly
        />
      </div>

      <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs uppercase tracking-[0.16em] text-zinc-400">Confidence</span>
          <span className="text-sm font-semibold text-emerald-300">{confidence}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={confidence}
          onChange={(event) => setConfidence(Number(event.target.value))}
          className="h-2 w-full accent-emerald-400"
        />
      </div>

      <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm">
        <span className="text-zinc-300">Potential payout:</span> <span className="font-semibold text-emerald-300">${payout}</span>
      </div>

      {selectedLiveMatch ? (
        <div className="rounded-xl border border-emerald-500/30 bg-zinc-900/70 p-3 text-xs text-zinc-300">
          Linked live fixture: <span className="text-emerald-300">{selectedLiveMatch.homeTeam}</span> vs{" "}
          <span className="text-emerald-300">{selectedLiveMatch.awayTeam}</span> ({selectedLiveMatch.score} at{" "}
          {selectedLiveMatch.minute ?? "-"}&apos;)
        </div>
      ) : null}

      <div className="space-y-2 rounded-xl border border-zinc-700 bg-zinc-900/70 p-3">
        <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">Azuro Quick Markets</p>
        {games.slice(0, 4).map((game) => {
          const condition = (conditionsByGameId[game.gameId] ?? [])[0];
          const outcome = condition?.outcomes?.[0];
          if (!condition || !outcome) return null;
          return (
            <button
              key={game.gameId}
              className="w-full rounded-lg border border-zinc-700 px-3 py-2 text-left text-xs transition hover:border-emerald-400/70 hover:bg-emerald-500/10"
              onClick={() =>
                onSelect({
                  gameTitle: game.title,
                  marketTitle: condition.title ?? `Market ${condition.conditionId}`,
                  outcomeTitle: outcome.title ?? `Outcome ${outcome.outcomeId}`,
                  conditionId: condition.conditionId,
                  outcomeId: outcome.outcomeId,
                  odds: outcome.odds,
                })
              }
            >
              <span className="block text-zinc-200">{game.title}</span>
              <span className="text-zinc-500">
                {outcome.title ?? "Outcome"} @ {outcome.odds}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2 rounded-xl border border-zinc-700 bg-zinc-900/70 p-3">
        <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">Live Matches Quick Select</p>
        <LiveMatchesPanel
          matches={liveMatches}
          loading={liveLoading}
          error={liveError}
          onBet={onSelectLive}
        />
      </div>

      <BetSlip selection={selection} onClear={onClear} />
    </GlassCard>
  );
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function WallScreen() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: balance } = useBalance({ address, chainId: targetChain.id, query: { enabled: Boolean(address) } });
  const onAzuroChain = chainId === targetChain.id;

  return (
    <div className="space-y-4">
      <GlassCard className="text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Wallet Balance ({targetChain.name})</p>
        <p className="mt-2 text-3xl font-semibold text-emerald-300">
          {isConnected && balance ? `${Number(balance.formatted).toFixed(4)} ${balance.symbol}` : "Connect wallet"}
        </p>
      </GlassCard>
      <GlassCard>
        <div className="flex items-center justify-between">
          <p className="font-medium text-zinc-100">Primary wallet</p>
          <div className="flex gap-2">
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${onAzuroChain ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border border-amber-500/50 bg-amber-500/10 text-amber-300"}`}>
              {onAzuroChain ? "on-chain" : "wrong-chain"}
            </span>
            <span className="rounded-md border border-zinc-600 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
              {isConnected ? "connected" : "disconnected"}
            </span>
          </div>
        </div>
        <p className="mt-1 text-xs text-zinc-500">{address ? shortenAddress(address) : "No wallet connected"}</p>
        <p className="mt-3 text-lg font-semibold text-zinc-100">{targetChain.name} / chain {targetChain.id}</p>
      </GlassCard>
      <div className="grid grid-cols-2 gap-3">
        <button className="rounded-xl border border-emerald-400/60 bg-emerald-500/10 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-40" disabled>
          Deposit (Azuro flow)
        </button>
        <button className="rounded-xl border border-zinc-600 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800/70 disabled:opacity-40" disabled>
          Withdraw (Azuro flow)
        </button>
      </div>
    </div>
  );
}

type MindScreenProps = {
  games: GameData[];
  conditionsByGameId: ConditionsByGameId;
  liveMatches: LiveMatch[];
  liveLoading: boolean;
  liveError: string | null;
};

function MindScreen({ games, conditionsByGameId, liveMatches, liveLoading, liveError }: MindScreenProps) {
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
  const engineDecisions = useMemo(() => {
    const refreshToken = learningRefresh;
    void refreshToken;
    if (liveMatches.length === 0) return [];
    const profile = readLearningProfile();
    const inputs = liveMatches.slice(0, 5).map(toAnalyticsInput);
    return evaluateMatches(inputs, profile);
  }, [liveMatches, learningRefresh]);

  function onRecordResult(decision: EngineDecision, result: "win" | "loss") {
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
        <p className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-400">Live Momentum Feed</p>
        <LiveMatchesPanel matches={liveMatches} loading={liveLoading} error={liveError} />
      </GlassCard>

      <GlassCard>
        <p className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-400">LAMBOR Strategy Engine</p>
        <div className="space-y-2.5">
          {engineDecisions.length === 0 ? (
            <p className="text-xs text-zinc-500">No live matches to evaluate.</p>
          ) : (
            engineDecisions.map((decision) => (
              <div key={decision.match} className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-zinc-100">{decision.match}</p>
                  <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                    {decision.decision}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">
                  {decision.strategyUsed} • {decision.confidence}% • {decision.tag} • Risk {decision.riskLevel}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">{decision.reasoning}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onRecordResult(decision, "win")}
                    className="rounded-md border border-emerald-500/50 px-2 py-1 text-[10px] font-semibold text-emerald-300"
                  >
                    Mark Win
                  </button>
                  <button
                    type="button"
                    onClick={() => onRecordResult(decision, "loss")}
                    className="rounded-md border border-red-500/50 px-2 py-1 text-[10px] font-semibold text-red-300"
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
        <div className="space-y-2">
          <div className="max-w-[86%] rounded-xl border border-zinc-700 bg-zinc-900/80 p-2.5 text-xs text-zinc-300">
            Should I hedge Arsenal +0.5 now?
          </div>
          <div className="ml-auto max-w-[86%] rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-200">
            Hedge 30% at 1.74. Volatility spike expected after minute 88.
          </div>
        </div>
        <input
          className="mt-3 h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-400 focus:shadow-[0_0_20px_rgba(0,255,163,0.25)]"
          placeholder="Ask LAMBOR Mind..."
        />
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
  const [selection, setSelection] = useState<BetSlipSelection | null>(null);
  const [selectedLiveMatch, setSelectedLiveMatch] = useState<LiveMatch | null>(null);
  const [placedBets, setPlacedBets] = useState<PlacedBetRecord[]>(
    () => (typeof window === "undefined" ? [] : readPlacedBets()),
  );
  const { matches: liveMatches, loading: liveLoading, error: liveError } = useLiveMatches();

  function handleSelectLiveMatch(match: LiveMatch) {
    setSelectedLiveMatch(match);
    const mappedSelection = pickSelectionFromLiveMatch(match, games, conditionsByGameId);
    if (mappedSelection) {
      setSelection(mappedSelection);
    }
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
              placedBets={placedBets}
              onSelect={setSelection}
              conditionsByGameId={conditionsByGameId}
              liveMatches={liveMatches}
              liveLoading={liveLoading}
              liveError={liveError}
              onSelectLive={handleSelectLiveMatch}
            />
          )}
          {activeTab === "bet" && (
            <BetScreen
              games={games}
              conditionsByGameId={conditionsByGameId}
              selection={selection}
              onSelect={setSelection}
              onClear={() => setSelection(null)}
              liveMatches={liveMatches}
              liveLoading={liveLoading}
              liveError={liveError}
              onSelectLive={handleSelectLiveMatch}
              selectedLiveMatch={selectedLiveMatch}
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
                  setPlacedBets(readPlacedBets());
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
