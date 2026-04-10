"use client";

import type { BetOrderData } from "@azuro-org/toolkit";
import { BetOrderResult, BetOrderState } from "@azuro-org/toolkit";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { useLamborWallet } from "@/contexts/lambor-wallet-context";
import { withdrawPayoutsFromPaymaster } from "@/lib/azuro/paymaster-ethers";
import { useAzuroBets } from "@/hooks/use-azuro-bets";
import { AZURO_BETS_QUERY_KEY } from "@/hooks/use-azuro-bets";
import { useEthersSigner } from "@/hooks/use-ethers-signer";

const PROCESSED_KEY = "lambor.withdrawPayouts.processed.v1";

function loadProcessed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(PROCESSED_KEY);
    if (!raw) return new Set();
    const a = JSON.parse(raw) as string[];
    return new Set(Array.isArray(a) ? a : []);
  } catch {
    return new Set();
  }
}

function saveProcessed(ids: Set<string>) {
  sessionStorage.setItem(PROCESSED_KEY, JSON.stringify([...ids]));
}

function isRedeemed(order: BetOrderData): boolean {
  return order.meta?.isRedeemed === true;
}

function claimableIds(orders: BetOrderData[]): bigint[] {
  const ids: bigint[] = [];
  for (const o of orders) {
    if (o.state !== BetOrderState.Settled || o.result !== BetOrderResult.Won) continue;
    if (o.betId == null) continue;
    if (isRedeemed(o)) continue;
    ids.push(BigInt(o.betId));
  }
  return ids;
}

/**
 * After a winning bet, calls PayMaster `withdrawPayouts(freeBetIds)` via MetaMask (ethers signer).
 * Batches one claim per effect cycle; marks processed order ids to avoid repeats.
 */
export function useAutoWithdrawOnWin() {
  const { data: orders = [] } = useAzuroBets();
  const queryClient = useQueryClient();
  const signer = useEthersSigner();
  const { isConnected, isPolygon, refetchBalances } = useLamborWallet();
  const busy = useRef(false);

  const tryClaim = useCallback(async () => {
    if (!isConnected || !isPolygon || !signer) return;
    const ids = claimableIds(orders);
    if (ids.length === 0) return;
    if (busy.current) return;

    const processed = loadProcessed();
    const pending = ids.filter((id) => !processed.has(id.toString()));
    if (pending.length === 0) return;

    busy.current = true;
    try {
      await withdrawPayoutsFromPaymaster(signer, pending);
      for (const id of pending) processed.add(id.toString());
      saveProcessed(processed);
      await queryClient.invalidateQueries({ queryKey: AZURO_BETS_QUERY_KEY });
      await refetchBalances();
    } catch {
      /* user rejected or chain error */
    } finally {
      busy.current = false;
    }
  }, [isConnected, isPolygon, orders, queryClient, refetchBalances, signer]);

  useEffect(() => {
    const t = window.setTimeout(() => void tryClaim(), 1500);
    return () => window.clearTimeout(t);
  }, [tryClaim]);
}
