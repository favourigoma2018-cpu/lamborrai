"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { BetSlipSelection } from "@/components/bets/bet-slip";
import { BetSlip } from "@/components/bets/bet-slip";
import type { LiveMatch } from "@/types/live-matches";
import type { PlacedBetRecord } from "@/types/bets";

type BetPageProps = {
  liveMatches: LiveMatch[];
  liveLoading: boolean;
  liveError: string | null;
  placedBets: PlacedBetRecord[];
  onRefreshPlacedBets: () => void;
  recommendSelection: (match: LiveMatch) => BetSlipSelection | null;
};

type BetTabKey = "slip" | "history";

type SlipItem = {
  id: string;
  matchKey: string;
  selection: BetSlipSelection;
  addedAt: number;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function parseScore(score: string) {
  const [homeRaw, awayRaw] = score.split("-").map((part) => Number.parseInt(part.trim(), 10));
  return {
    homeGoals: Number.isFinite(homeRaw) ? homeRaw : 0,
    awayGoals: Number.isFinite(awayRaw) ? awayRaw : 0,
  };
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(fc|cf|sc|ac|club|deportivo|sporting)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchKeyFromLive(match: LiveMatch) {
  return `${normalizeName(match.homeTeam)}__${normalizeName(match.awayTeam)}`;
}

function guessLiveForBet(bet: PlacedBetRecord, liveMatches: LiveMatch[]): LiveMatch | null {
  const title = normalizeName(bet.gameTitle);
  if (!title) return null;
  return (
    liveMatches.find((m) => {
      const home = normalizeName(m.homeTeam);
      const away = normalizeName(m.awayTeam);
      return title.includes(home) && title.includes(away);
    }) ?? null
  );
}

function activeStatusFromLive(bet: PlacedBetRecord, live: LiveMatch | null): "winning" | "losing" | "pending" {
  if (!live) return "pending";
  const { homeGoals, awayGoals } = parseScore(live.score);
  const outcome = normalizeName(bet.outcomeTitle);
  const home = normalizeName(live.homeTeam);
  const away = normalizeName(live.awayTeam);

  if (outcome.includes("draw")) return homeGoals === awayGoals ? "winning" : "pending";
  if (outcome.includes(home)) return homeGoals > awayGoals ? "winning" : "pending";
  if (outcome.includes(away)) return awayGoals > homeGoals ? "winning" : "pending";

  // Unknown bet type → neutral.
  return "pending";
}

function money(value: number) {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function formatShortDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ToggleTabs({ value, onChange }: { value: BetTabKey; onChange: (key: BetTabKey) => void }) {
  return (
    <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/55 p-1 backdrop-blur-xl">
      <div className="grid grid-cols-2 gap-1">
        {(["slip", "history"] as const).map((key) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                active ? "bg-emerald-500/20 text-emerald-300 shadow-[0_0_18px_rgba(0,255,163,0.2)]" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {key === "slip" ? "Slip" : "History"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LiveMatchList({
  matches,
  loading,
  error,
  selectedKeys,
  onBet,
}: {
  matches: LiveMatch[];
  loading: boolean;
  error: string | null;
  selectedKeys: Set<string>;
  onBet: (match: LiveMatch) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2.5">
        <div className="h-12 animate-pulse rounded-xl bg-zinc-800/80" />
        <div className="h-12 animate-pulse rounded-xl bg-zinc-800/70" />
        <div className="h-12 animate-pulse rounded-xl bg-zinc-800/60" />
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-red-300">{error}</p>;
  }

  if (matches.length === 0) {
    return <p className="text-xs text-zinc-500">No live fixtures at the moment.</p>;
  }

  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {matches.slice(0, 8).map((match) => {
          const key = matchKeyFromLive(match);
          const alreadySelected = selectedKeys.has(key);
          return (
            <motion.div
              key={match.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl border border-emerald-500/20 bg-zinc-900/60 px-3 py-3 shadow-[0_0_18px_rgba(0,255,163,0.06)]"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-100">
                    {match.homeTeam} vs {match.awayTeam}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {match.league} • {match.status} {match.minute ? `• ${match.minute}'` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-emerald-400/35 bg-emerald-500/10 px-2 py-1 text-sm font-semibold text-emerald-300">
                    {match.score}
                  </span>
                  <button
                    type="button"
                    disabled={alreadySelected}
                    onClick={() => onBet(match)}
                    className="rounded-xl border border-emerald-400/60 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {alreadySelected ? "Added" : "Bet"}
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function SlipBuilder({
  items,
  activeId,
  onActivate,
  onRemove,
  stake,
  onStakeChange,
}: {
  items: SlipItem[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onRemove: (id: string) => void;
  stake: string;
  onStakeChange: (value: string) => void;
}) {
  const totalOdds = useMemo(() => {
    // UI-only: show combined odds as product for a multi-slip (parlay-like).
    // Execution still happens on the active single selection below.
    const product = items.reduce((acc, item) => acc * (Number.parseFloat(item.selection.odds) || 1), 1);
    return Number.isFinite(product) ? product : 0;
  }, [items]);

  const payout = useMemo(() => {
    const stakeNum = Number.parseFloat(stake);
    if (!Number.isFinite(stakeNum) || stakeNum <= 0) return null;
    if (!Number.isFinite(totalOdds) || totalOdds <= 0) return null;
    return stakeNum * totalOdds;
  }, [stake, totalOdds]);

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">Add a live match above to start your slip.</p>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {items.map((item) => {
              const active = item.id === activeId;
              const recentlyAdded = Date.now() - item.addedAt < 2500;
              return (
                <motion.button
                  key={item.id}
                  layout
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  onClick={() => onActivate(item.id)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    active
                      ? "border-emerald-400/60 bg-emerald-500/10 shadow-[0_0_18px_rgba(0,255,163,0.18)]"
                      : "border-zinc-700/70 bg-zinc-900/60 hover:border-zinc-600"
                  } ${recentlyAdded ? "ring-1 ring-emerald-400/40" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-100">{item.selection.gameTitle}</p>
                      <p className="mt-1 truncate text-[11px] text-zinc-500">{item.selection.marketTitle}</p>
                      <p className="mt-1 truncate text-[11px] text-zinc-400">{item.selection.outcomeTitle}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-300">
                        {item.selection.odds}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(item.id);
                        }}
                        className="rounded-lg border border-zinc-700 p-2 text-zinc-300 transition hover:bg-zinc-800/70"
                        aria-label="Remove bet"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs uppercase tracking-[0.16em] text-zinc-400">Stake ($)</span>
          <input
            inputMode="decimal"
            value={stake}
            onChange={(e) => onStakeChange(e.target.value)}
            placeholder="0.00"
            className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-400 focus:shadow-[0_0_20px_rgba(0,255,163,0.25)]"
          />
        </label>
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Slip odds</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">{totalOdds.toFixed(2)}x</p>
        </div>
      </div>

      <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm">
        <span className="text-zinc-300">Potential payout:</span>{" "}
        <span className="font-semibold text-emerald-300">{payout ? `$${payout.toFixed(2)}` : "-"}</span>
      </div>
    </div>
  );
}

function ActiveBets({
  bets,
  liveMatches,
}: {
  bets: PlacedBetRecord[];
  liveMatches: LiveMatch[];
}) {
  if (bets.length === 0) {
    return <p className="text-sm text-zinc-500">No active bets.</p>;
  }

  return (
    <div className="space-y-2.5">
      {bets.map((bet) => {
        const live = guessLiveForBet(bet, liveMatches);
        const status = activeStatusFromLive(bet, live);
        const statusClass =
          status === "winning"
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            : status === "losing"
              ? "border-red-500/40 bg-red-500/10 text-red-300"
              : "border-zinc-600 bg-zinc-800/60 text-zinc-300";

        return (
          <div key={bet.id} className="rounded-2xl border border-zinc-700/70 bg-zinc-900/60 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-100">{bet.gameTitle}</p>
                <p className="mt-1 truncate text-[11px] text-zinc-500">
                  {live ? `${live.score}${live.minute ? ` • ${live.minute}'` : ""}` : "Live score: -"}
                </p>
                <p className="mt-1 truncate text-[11px] text-zinc-400">{bet.outcomeTitle}</p>
              </div>
              <span className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] font-semibold ${statusClass}`}>
                {status.toUpperCase()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoryList({ bets }: { bets: PlacedBetRecord[] }) {
  if (bets.length === 0) {
    return <p className="text-sm text-zinc-500">No history yet.</p>;
  }

  return (
    <div className="space-y-2.5">
      {bets.map((bet) => {
        const stake = Number.parseFloat(bet.amount) || 0;
        const payout = Number.parseFloat(bet.potentialPayout) || 0;
        const pnl = bet.status === "success" ? payout - stake : -stake;
        const isWin = bet.status === "success";
        const badgeClass = isWin
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-red-500/40 bg-red-500/10 text-red-300";
        const pnlClass = isWin ? "text-emerald-300" : "text-red-300";

        return (
          <div key={bet.id} className="rounded-2xl border border-zinc-700/70 bg-zinc-900/60 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-semibold text-zinc-100">{bet.gameTitle}</p>
              <div className="flex items-center gap-2">
                <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
                  {isWin ? "W" : "L"}
                </span>
                <span className={`text-sm font-semibold ${pnlClass}`}>{money(pnl)}</span>
              </div>
            </div>
            <p className="mt-1 truncate text-[11px] text-zinc-500">
              ${stake.toFixed(2)} @ {clamp(Number.parseFloat(bet.odds) || 0, 0, 999).toFixed(2)}x • {formatShortDate(bet.createdAt)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function SlipView({
  liveMatches,
  liveLoading,
  liveError,
  slipItems,
  activeId,
  stake,
  placedBets,
  onAddMatch,
  onActivate,
  onRemove,
  onStakeChange,
  onClearActive,
  onPlaced,
}: {
  liveMatches: LiveMatch[];
  liveLoading: boolean;
  liveError: string | null;
  slipItems: SlipItem[];
  activeId: string | null;
  stake: string;
  placedBets: PlacedBetRecord[];
  onAddMatch: (match: LiveMatch) => void;
  onActivate: (id: string) => void;
  onRemove: (id: string) => void;
  onStakeChange: (value: string) => void;
  onClearActive: () => void;
  onPlaced: () => void;
}) {
  const selectedKeys = useMemo(() => new Set(slipItems.map((i) => i.matchKey)), [slipItems]);
  const activeSelection = useMemo(() => slipItems.find((i) => i.id === activeId)?.selection ?? null, [activeId, slipItems]);
  const activeBets = useMemo(() => placedBets.filter((b) => b.status === "pending"), [placedBets]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/55 p-4 backdrop-blur-xl">
        <p className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-400">Live match quick select</p>
        <LiveMatchList
          matches={liveMatches}
          loading={liveLoading}
          error={liveError}
          selectedKeys={selectedKeys}
          onBet={onAddMatch}
        />
      </div>

      <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/55 p-4 backdrop-blur-xl">
        <p className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-400">Bet slip</p>
        <SlipBuilder
          items={slipItems}
          activeId={activeId}
          onActivate={onActivate}
          onRemove={onRemove}
          stake={stake}
          onStakeChange={onStakeChange}
        />

        <div className="mt-4">
          <BetSlip selection={activeSelection} onClear={onClearActive} onPlaced={onPlaced} />
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/55 p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Active bets</p>
          <span className="text-xs text-emerald-300">{activeBets.length} pending</span>
        </div>
        <ActiveBets bets={activeBets} liveMatches={liveMatches} />
      </div>
    </div>
  );
}

function HistoryView({ bets }: { bets: PlacedBetRecord[] }) {
  const settled = useMemo(() => bets.filter((b) => b.status === "success" || b.status === "failed"), [bets]);
  return (
    <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/55 p-4 backdrop-blur-xl">
      <p className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-400">Bet history</p>
      <HistoryList bets={settled} />
    </div>
  );
}

export function BetPage({
  liveMatches,
  liveLoading,
  liveError,
  placedBets,
  onRefreshPlacedBets,
  recommendSelection,
}: BetPageProps) {
  const [tab, setTab] = useState<BetTabKey>("slip");
  const [stake, setStake] = useState("0");
  const [slipItems, setSlipItems] = useState<SlipItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const lastAddedIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Keep the screen fresh when user opens it.
    onRefreshPlacedBets();
  }, [onRefreshPlacedBets]);

  function addFromLive(match: LiveMatch) {
    const selection = recommendSelection(match);
    if (!selection) return;

    const matchKey = matchKeyFromLive(match);
    const exists = slipItems.some((i) => i.matchKey === matchKey);
    if (exists) return;

    const id = `${Date.now()}-${match.id}`;
    lastAddedIdRef.current = id;
    const newItem: SlipItem = { id, matchKey, selection, addedAt: Date.now() };
    setSlipItems((prev) => [newItem, ...prev]);
    setActiveId(id);
  }

  function removeItem(id: string) {
    setSlipItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      return next;
    });
    setActiveId((prevActive) => {
      if (prevActive !== id) return prevActive;
      const remaining = slipItems.filter((i) => i.id !== id);
      return remaining[0]?.id ?? null;
    });
  }

  function clearActive() {
    if (!activeId) return;
    removeItem(activeId);
  }

  return (
    <div className="space-y-4">
      <ToggleTabs value={tab} onChange={setTab} />

      <AnimatePresence mode="wait">
        {tab === "slip" ? (
          <motion.div
            key="slip"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <SlipView
              liveMatches={liveMatches}
              liveLoading={liveLoading}
              liveError={liveError}
              slipItems={slipItems}
              activeId={activeId}
              stake={stake}
              placedBets={placedBets}
              onAddMatch={addFromLive}
              onActivate={setActiveId}
              onRemove={removeItem}
              onStakeChange={setStake}
              onClearActive={clearActive}
              onPlaced={onRefreshPlacedBets}
            />
          </motion.div>
        ) : (
          <motion.div
            key="history"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <HistoryView bets={placedBets} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

