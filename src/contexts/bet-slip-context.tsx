"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { BetSlipSelection } from "@/components/bets/bet-slip";
import { isValidAzuroSlipSelection } from "@/lib/azuro/slip-selection-guards";
import { matchKeyFromLive } from "@/lib/lambor/match-key";
import type { LiveMatch } from "@/types/live-matches";

export type BetSlipRow = {
  id: string;
  matchKey: string;
  selection: BetSlipSelection;
  addedAt: number;
};

export type AddSelectionResult = "added" | "duplicate" | "invalid";

type BetSlipContextValue = {
  items: BetSlipRow[];
  activeId: string | null;
  stake: string;
  setStake: (v: string) => void;
  setActiveId: (id: string | null) => void;
  addSelection: (selection: BetSlipSelection) => AddSelectionResult;
  removeItem: (id: string) => void;
  clearAfterParlay: () => void;
  totalOdds: number;
  payoutPreview: number | null;
};

const BetSlipContext = createContext<BetSlipContextValue | null>(null);

function computeTotalOdds(items: BetSlipRow[]): number {
  if (items.length === 0) return 0;
  return items.reduce((acc, row) => {
    const o = Number.parseFloat(row.selection.odds);
    if (!Number.isFinite(o) || o <= 0) return acc;
    return acc * o;
  }, 1);
}

export function BetSlipProvider({ liveMatches, children }: { liveMatches: LiveMatch[]; children: ReactNode }) {
  const [items, setItems] = useState<BetSlipRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [stake, setStake] = useState("");

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const totalOdds = useMemo(() => computeTotalOdds(items), [items]);

  const payoutPreview = useMemo(() => {
    const stakeNum = Number.parseFloat(stake);
    if (!Number.isFinite(stakeNum) || stakeNum <= 0 || items.length === 0 || totalOdds <= 0) return null;
    return stakeNum * totalOdds;
  }, [stake, items.length, totalOdds]);

  const addSelection = useCallback(
    (selection: BetSlipSelection): AddSelectionResult => {
      if (!isValidAzuroSlipSelection(selection)) return "invalid";
      const matchId = selection.matchId;
      const gid = selection.gameId?.trim();
      let matchKey: string;
      if (matchId != null) {
        const match = liveMatches.find((m) => m.id === matchId);
        if (!match) return "invalid";
        matchKey = matchKeyFromLive(match);
      } else if (gid) {
        matchKey = `azuro:${gid}`;
      } else {
        return "invalid";
      }
      if (itemsRef.current.some((i) => i.matchKey === matchKey)) return "duplicate";
      const id = `${Date.now()}-${matchKey}-${selection.outcomeId}`;
      const row: BetSlipRow = { id, matchKey, selection, addedAt: Date.now() };
      setItems((prev) => [row, ...prev]);
      setActiveId(id);
      return "added";
    },
    [liveMatches],
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      queueMicrotask(() => {
        setActiveId((a) => (a === id ? next[0]?.id ?? null : a));
      });
      return next;
    });
  }, []);

  const clearAfterParlay = useCallback(() => {
    setItems([]);
    setActiveId(null);
  }, []);

  useEffect(() => {
    function onAddSlip(ev: Event) {
      const e = ev as CustomEvent<BetSlipSelection>;
      addSelection(e.detail);
    }
    window.addEventListener("lambor:add-slip", onAddSlip);
    return () => window.removeEventListener("lambor:add-slip", onAddSlip);
  }, [addSelection]);

  const value = useMemo(
    () => ({
      items,
      activeId,
      stake,
      setStake,
      setActiveId,
      addSelection,
      removeItem,
      clearAfterParlay,
      totalOdds,
      payoutPreview,
    }),
    [items, activeId, stake, addSelection, removeItem, clearAfterParlay, totalOdds, payoutPreview],
  );

  return <BetSlipContext.Provider value={value}>{children}</BetSlipContext.Provider>;
}

export function useBetSlip() {
  const ctx = useContext(BetSlipContext);
  if (!ctx) throw new Error("useBetSlip must be used within BetSlipProvider");
  return ctx;
}

/** Optional hook for components that may render outside the provider (e.g. games grid). */
export function useBetSlipOptional() {
  return useContext(BetSlipContext);
}
