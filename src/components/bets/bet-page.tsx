"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useBetSlip } from "@/contexts/bet-slip-context";
import { isValidAzuroSlipSelection } from "@/lib/azuro/slip-selection-guards";
import { matchKeyFromLive } from "@/lib/lambor/match-key";
import { drainSlipQueue } from "@/lib/lambor/slip-queue";

import type { BetSlipSelection } from "@/components/bets/bet-slip";
import { BetSlip } from "@/components/bets/bet-slip";
import { evaluateMatch } from "@/lib/lambor-ai/engine";
import { liveMatchToAnalyticsInput } from "@/lib/lambor/live-match-analytics";
import { hintsForStrategy, optionMatchesHint } from "@/lib/lambor-ai/strategy-market-map";
import type { BetOrderData } from "@azuro-org/toolkit";
import { BetOrderResult, BetOrderState } from "@azuro-org/toolkit";

import type { LiveMatch } from "@/types/live-matches";
import type { LamborMarketGroup, MatchMarketsPayload } from "@/types/betting-markets";
import { BET_TOKEN } from "@/config/azuro-polygon-contracts";
import { useAzuroBets } from "@/hooks/use-azuro-bets";
import { azuroBetPnl, formatAzuroBetTitle, isAzuroBetOpen } from "@/lib/azuro/bet-helpers";

type BetPageProps = {
  liveMatches: LiveMatch[];
  liveLoading: boolean;
  liveError: string | null;
  recommendSelection: (match: LiveMatch) => BetSlipSelection | null;
};

type BetTabKey = "slip" | "history";

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function guessLiveForOrder(order: BetOrderData, liveMatches: LiveMatch[]): LiveMatch | null {
  const gid = order.conditions[0]?.gameId;
  if (gid == null) return null;
  return liveMatches.find((m) => String(m.id) === String(gid)) ?? null;
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

function formatMarketGroupTitle(g: LamborMarketGroup): string {
  const label = g.type.replace(/_/g, " ");
  if (g.line != null) return `${label} • ${g.line}`;
  return label;
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

function MarketGroupBlock({
  group,
  match,
  hints,
  azuroGameId,
}: {
  group: LamborMarketGroup;
  match: LiveMatch;
  hints: ReturnType<typeof hintsForStrategy>;
  azuroGameId?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-950/50 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{formatMarketGroupTitle(group)}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {group.options.map((opt) => {
          const recommended = hints.some((h) => optionMatchesHint(h, group.type, group.line, opt.label));
          return (
            <MarketOptionButton
              key={`${opt.marketId}-${opt.outcomeId}`}
              opt={opt}
              group={group}
              match={match}
              recommended={recommended}
              azuroGameId={azuroGameId}
            />
          );
        })}
      </div>
    </div>
  );
}

function MarketOptionButton({
  opt,
  group,
  match,
  recommended,
  azuroGameId,
}: {
  opt: LamborMarketGroup["options"][number];
  group: LamborMarketGroup;
  match: LiveMatch;
  recommended: boolean;
  azuroGameId?: string;
}) {
  const canAdd =
    opt.executable !== false &&
    Boolean(azuroGameId) &&
    isValidAzuroSlipSelection({
      gameId: azuroGameId,
      conditionId: opt.marketId,
      outcomeId: opt.outcomeId,
      odds: opt.odds,
      executable: opt.executable,
    });

  return (
    <button
      type="button"
      disabled={!canAdd}
      title={
        !azuroGameId
          ? "No Azuro game linked — cannot place this bet on-chain."
          : !canAdd
            ? "Missing on-chain market data for this selection."
            : undefined
      }
      className={`rounded-lg border px-2 py-2 text-left text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        recommended
          ? "border-emerald-400/70 bg-emerald-500/15 text-emerald-200 shadow-[0_0_14px_rgba(0,255,163,0.12)]"
          : "border-zinc-700/80 bg-zinc-900/70 text-zinc-200 hover:border-zinc-500"
      }`}
      onClick={() => {
        if (!azuroGameId || !canAdd) return;
        const detail = new CustomEvent<BetSlipSelection>("lambor:add-slip", {
          detail: {
            gameTitle: `${match.homeTeam} vs ${match.awayTeam}`,
            marketTitle: formatMarketGroupTitle(group),
            outcomeTitle: opt.label,
            conditionId: opt.marketId,
            outcomeId: opt.outcomeId,
            odds: opt.odds,
            executable: opt.executable,
            matchId: match.id,
            gameId: azuroGameId,
            conditionKind: "LIVE",
          },
        });
        window.dispatchEvent(detail);
      }}
    >
      <span className="line-clamp-2">{opt.label}</span>
      <span className="mt-1 block text-emerald-300">{opt.odds}</span>
      {recommended ? (
        <span className="mt-1 inline-flex items-center gap-0.5 text-[9px] font-semibold text-emerald-400/90">
          <Sparkles className="h-3 w-3" /> Engine
        </span>
      ) : null}
    </button>
  );
}

function LiveMatchMarketsSection({
  matches,
  loading,
  error,
  marketsByMatchId,
  loadingMarketId,
  expandedId,
  onToggleExpand,
  onQuickBet,
  selectedKeys,
}: {
  matches: LiveMatch[];
  loading: boolean;
  error: string | null;
  marketsByMatchId: Record<number, MatchMarketsPayload>;
  loadingMarketId: number | null;
  expandedId: number | null;
  onToggleExpand: (id: number) => void;
  onQuickBet: (match: LiveMatch) => void;
  selectedKeys: Set<string>;
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
        {matches.slice(0, 12).map((match) => {
          const key = matchKeyFromLive(match);
          const alreadySelected = selectedKeys.has(key);
          const expanded = expandedId === match.id;
          const payload = marketsByMatchId[match.id];
          const engine = evaluateMatch(liveMatchToAnalyticsInput(match));
          const hints = hintsForStrategy(engine.strategyUsed);

          return (
            <motion.div
              key={match.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-zinc-900/60 shadow-[0_0_18px_rgba(0,255,163,0.06)]"
            >
              <div className="flex items-center justify-between gap-2 px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-100">
                    {match.homeTeam} vs {match.awayTeam}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {match.league} • {match.status} {match.minute ? `• ${match.minute}'` : ""}
                  </p>
                  <p className="mt-1 text-[10px] text-zinc-500">
                    Engine: <span className="text-zinc-300">{engine.strategyUsed.replace(/_/g, " ")}</span> •{" "}
                    <span className="text-emerald-300/90">{engine.decision}</span> @ {engine.confidence.toFixed(0)}%
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="rounded-md border border-emerald-400/35 bg-emerald-500/10 px-2 py-1 text-sm font-semibold text-emerald-300">
                    {match.score}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={alreadySelected}
                      onClick={() => onQuickBet(match)}
                      className="rounded-lg border border-emerald-400/50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {alreadySelected ? "Added" : "Quick"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleExpand(match.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-600 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 transition hover:bg-zinc-800/70"
                    >
                      Markets
                      {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {expanded ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-zinc-800/80 bg-zinc-950/40 px-3 pb-3 pt-2"
                  >
                    {loadingMarketId === match.id && !payload ? (
                      <p className="text-xs text-zinc-500">Loading markets…</p>
                    ) : null}
                    {payload ? (
                      <div className="space-y-3">
                        {payload.azuroGameId ? (
                          <p className="text-[10px] text-zinc-500">
                            Linked Azuro game <span className="text-zinc-400">{payload.azuroGameId}</span> — only prices backed by Azuro conditions are shown.
                          </p>
                        ) : (
                          <p className="text-[10px] text-amber-300/90">
                            No Azuro game linked for this fixture yet — on-chain betting is unavailable until the feed matches this match.
                          </p>
                        )}
                        {payload.markets.length === 0 ? (
                          <p className="text-xs text-zinc-500">No Azuro conditions matched the supported market types for this game.</p>
                        ) : (
                          payload.markets.map((group) => (
                            <MarketGroupBlock
                              key={`${group.type}-${group.line ?? "x"}`}
                              group={group}
                              match={match}
                              hints={hints}
                              azuroGameId={payload.azuroGameId}
                            />
                          ))
                        )}
                      </div>
                    ) : loadingMarketId !== match.id ? (
                      <p className="text-xs text-zinc-500">Open markets to load prices.</p>
                    ) : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function ActiveBets({ orders, liveMatches }: { orders: BetOrderData[]; liveMatches: LiveMatch[] }) {
  const open = orders.filter(isAzuroBetOpen);
  if (open.length === 0) {
    return <p className="text-sm text-zinc-500">No open Azuro orders.</p>;
  }

  return (
    <div className="space-y-2.5">
      {open.map((order) => {
        const live = guessLiveForOrder(order, liveMatches);
        return (
          <div key={order.id} className="rounded-2xl border border-zinc-700/70 bg-zinc-900/60 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-100">{formatAzuroBetTitle(order)}</p>
                <p className="mt-1 truncate text-[11px] text-zinc-500">
                  {live ? `${live.score}${live.minute ? ` • ${live.minute}'` : ""}` : "Live score: -"}
                </p>
                <p className="mt-1 truncate text-[11px] text-zinc-400">{order.state}</p>
              </div>
              <span className="shrink-0 rounded-lg border border-zinc-600 bg-zinc-800/60 px-2 py-1 text-[10px] font-semibold text-zinc-300">
                {order.state}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoryList({ orders }: { orders: BetOrderData[] }) {
  if (orders.length === 0) {
    return <p className="text-sm text-zinc-500">No history yet.</p>;
  }

  return (
    <div className="space-y-2.5">
      {orders.map((order) => {
        const pnl = azuroBetPnl(order);
        const settled = order.state === BetOrderState.Settled;
        const isWin = settled && order.result === BetOrderResult.Won;
        const isLost = settled && order.result === BetOrderResult.Lost;
        const badgeLabel = !settled ? "OPEN" : isWin ? "W" : isLost ? "L" : "—";
        const badgeClass = !settled
          ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
          : isWin
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            : "border-red-500/40 bg-red-500/10 text-red-300";
        const pnlClass =
          pnl == null ? "text-zinc-300" : pnl >= 0 ? "text-emerald-300" : "text-red-300";

        return (
          <div key={order.id} className="rounded-2xl border border-zinc-700/70 bg-zinc-900/60 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-semibold text-zinc-100">{formatAzuroBetTitle(order)}</p>
              <div className="flex items-center gap-2">
                <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
                  {badgeLabel}
                </span>
                <span className={`text-sm font-semibold ${pnlClass}`}>
                  {pnl == null ? "—" : money(pnl)}
                </span>
              </div>
            </div>
            <p className="mt-1 truncate text-[11px] text-zinc-500">
              {order.amount.toFixed(2)} stake @ {order.odds.toFixed(2)}x • {formatShortDate(order.createdAt)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function SlipTabContent({
  liveMatches,
  liveLoading,
  liveError,
  azuroOrders,
  marketsByMatchId,
  loadingMarketId,
  expandedId,
  setExpandedId,
  loadMarketsForMatch,
  onQuickBet,
  onPlaced,
  onAfterParlay,
}: {
  liveMatches: LiveMatch[];
  liveLoading: boolean;
  liveError: string | null;
  azuroOrders: BetOrderData[];
  marketsByMatchId: Record<number, MatchMarketsPayload>;
  loadingMarketId: number | null;
  expandedId: number | null;
  setExpandedId: (id: number | null) => void;
  loadMarketsForMatch: (id: number) => void;
  onQuickBet: (match: LiveMatch) => void;
  onPlaced: () => void;
  onAfterParlay: () => void;
}) {
  const {
    items: slipItems,
    activeId,
    setActiveId,
    stake,
    setStake,
    removeItem,
    totalOdds,
    payoutPreview,
    clearAfterParlay,
  } = useBetSlip();

  const selectedKeys = useMemo(() => new Set(slipItems.map((i) => i.matchKey)), [slipItems]);
  const activeSelection = useMemo(() => slipItems.find((i) => i.id === activeId)?.selection ?? null, [activeId, slipItems]);
  const openCount = useMemo(() => azuroOrders.filter(isAzuroBetOpen).length, [azuroOrders]);
  const allLegsValid = useMemo(
    () => slipItems.length > 0 && slipItems.every((i) => isValidAzuroSlipSelection(i.selection)),
    [slipItems],
  );

  function onToggleExpand(id: number) {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (next != null) loadMarketsForMatch(next);
  }

  function onClearActive() {
    if (!activeId) return;
    removeItem(activeId);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/55 p-4 backdrop-blur-xl">
        <p className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-400">Live matches & markets</p>
        <LiveMatchMarketsSection
          matches={liveMatches}
          loading={liveLoading}
          error={liveError}
          marketsByMatchId={marketsByMatchId}
          loadingMarketId={loadingMarketId}
          expandedId={expandedId}
          onToggleExpand={onToggleExpand}
          onQuickBet={onQuickBet}
          selectedKeys={selectedKeys}
        />
      </div>

      <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/55 p-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Active bets</p>
          <span className="text-xs text-emerald-300">{openCount} open</span>
        </div>
        <ActiveBets orders={azuroOrders} liveMatches={liveMatches} />
      </div>

      <div className="relative rounded-2xl border border-emerald-500/25 bg-zinc-950/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="mb-3 flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-400/95">Bet slip</h2>
          {slipItems.length > 0 ? (
            <span className="text-[11px] text-zinc-500">
              {slipItems.length} leg{slipItems.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        {slipItems.length === 0 ? (
          <p className="text-sm text-zinc-500">Tap a price, Quick, or add from Strategy to build your slip.</p>
        ) : (
          <>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Selections</p>
            <div className="max-h-52 space-y-2 overflow-y-auto pr-0.5">
            <AnimatePresence initial={false}>
              {slipItems.map((item) => {
                const active = item.id === activeId;
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className={`rounded-xl border p-2.5 transition ${
                      active
                        ? "border-emerald-400/55 bg-emerald-500/10 shadow-[0_0_16px_rgba(0,255,163,0.12)]"
                        : "border-zinc-700/70 bg-zinc-900/65"
                    }`}
                  >
                    <button type="button" onClick={() => setActiveId(item.id)} className="w-full text-left">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-zinc-100">{item.selection.gameTitle}</p>
                          <p className="mt-0.5 truncate text-[10px] text-zinc-500">{item.selection.marketTitle}</p>
                          <p className="mt-0.5 truncate text-[10px] text-zinc-400">{item.selection.outcomeTitle}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                            {item.selection.odds}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeItem(item.id);
                            }}
                            className="rounded-lg border border-zinc-600 p-1.5 text-zinc-300 transition hover:bg-zinc-800/80"
                            aria-label="Remove bet"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            </div>
          </>
        )}

        <div className={`mt-4 space-y-4 border-t border-zinc-800/80 pt-4 ${slipItems.length === 0 ? "opacity-50" : ""}`}>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Stake (bet token)</span>
            <input
              inputMode="decimal"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              placeholder="0.00"
              disabled={slipItems.length === 0}
              className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 text-base font-medium text-zinc-100 outline-none transition focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 disabled:cursor-not-allowed"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/70 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Acca odds</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-zinc-100">{slipItems.length ? `${totalOdds.toFixed(2)}x` : "—"}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200/90">Potential payout</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-emerald-200">
                {payoutPreview != null ? `${payoutPreview.toFixed(4)} ${BET_TOKEN.symbol}` : "—"}
              </p>
            </div>
          </div>

          <p
            key={payoutPreview ?? "none"}
            className="text-center text-sm font-semibold text-emerald-200/95 transition-all duration-200"
          >
            {payoutPreview != null
              ? `Potential payout: ${payoutPreview.toFixed(4)} ${BET_TOKEN.symbol}`
              : slipItems.length > 0
                ? "Enter a stake to see potential payout."
                : "Add selections to calculate payout."}
          </p>

          {!allLegsValid && slipItems.length > 0 ? (
            <p className="text-xs text-amber-300">One or more legs are missing Azuro data — remove them or pick on-chain markets.</p>
          ) : null}
        </div>

        <div className="mt-4 border-t border-zinc-800/80 pt-4">
          <BetSlip
            selection={activeSelection}
            onClear={onClearActive}
            onPlaced={onPlaced}
            slipLegCount={slipItems.length}
            parlaySelections={slipItems.length >= 2 ? slipItems.map((i) => i.selection) : null}
            onParlayComplete={() => {
              clearAfterParlay();
              onAfterParlay();
            }}
            variant="embedded"
            className="border-0 bg-transparent p-0"
          />
        </div>
      </div>
    </div>
  );
}

function HistoryView({ orders }: { orders: BetOrderData[] }) {
  return (
    <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/55 p-4 backdrop-blur-xl">
      <p className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-400">Bet history</p>
      <HistoryList orders={orders} />
    </div>
  );
}

export function BetPage({
  liveMatches,
  liveLoading,
  liveError,
  recommendSelection,
}: BetPageProps) {
  const [tab, setTab] = useState<BetTabKey>("slip");
  const [marketsByMatchId, setMarketsByMatchId] = useState<Record<number, MatchMarketsPayload>>({});
  const [loadingMarketId, setLoadingMarketId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { data: azuroOrders = [], refetch } = useAzuroBets();
  const { addSelection, items: slipItems } = useBetSlip();

  useEffect(() => {
    const queued = drainSlipQueue();
    for (const selection of queued) {
      addSelection(selection);
    }
  }, [liveMatches, addSelection]);

  async function loadMarketsForMatch(id: number) {
    if (marketsByMatchId[id]) return;
    setLoadingMarketId(id);
    try {
      const res = await fetch(`/api/match/${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as MatchMarketsPayload;
      setMarketsByMatchId((prev) => ({ ...prev, [id]: data }));
    } finally {
      setLoadingMarketId(null);
    }
  }

  function addFromQuick(match: LiveMatch) {
    const selection = recommendSelection(match);
    if (!selection || !isValidAzuroSlipSelection(selection)) return;
    if (slipItems.some((i) => i.matchKey === matchKeyFromLive(match))) return;
    addSelection(selection);
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
            <SlipTabContent
              liveMatches={liveMatches}
              liveLoading={liveLoading}
              liveError={liveError}
              azuroOrders={azuroOrders}
              marketsByMatchId={marketsByMatchId}
              loadingMarketId={loadingMarketId}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              loadMarketsForMatch={loadMarketsForMatch}
              onQuickBet={addFromQuick}
              onPlaced={() => void refetch()}
              onAfterParlay={() => void refetch()}
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
            <HistoryView orders={azuroOrders} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
