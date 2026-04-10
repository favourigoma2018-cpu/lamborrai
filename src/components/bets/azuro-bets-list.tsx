"use client";

import type { BetOrderData } from "@azuro-org/toolkit";
import { BetOrderResult, BetOrderState } from "@azuro-org/toolkit";

import { formatAzuroBetTitle } from "@/lib/azuro/bet-helpers";

type AzuroBetsListProps = {
  orders: BetOrderData[];
  isLoading?: boolean;
};

function stateLabel(order: BetOrderData): string {
  if (order.state === BetOrderState.Settled) {
    if (order.result === BetOrderResult.Won) return "Won";
    if (order.result === BetOrderResult.Lost) return "Lost";
    if (order.result === BetOrderResult.Canceled) return "Canceled";
    return "Settled";
  }
  return order.state;
}

export function AzuroBetsList({ orders, isLoading }: AzuroBetsListProps) {
  if (isLoading) {
    return <p className="text-xs text-zinc-500">Loading bets from Azuro…</p>;
  }

  if (orders.length === 0) {
    return <p className="text-xs text-zinc-500">No orders yet. Connect wallet and place a bet on Polygon.</p>;
  }

  return (
    <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
      {orders.map((order) => (
        <div key={order.id} className="rounded-md border border-zinc-800 bg-zinc-950/50 p-2 text-xs">
          <p className="truncate font-medium text-zinc-200">{formatAzuroBetTitle(order)}</p>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            Stake {order.amount.toFixed(4)} • Odds {order.odds.toFixed(2)}
          </p>
          <p className="mt-1 text-[10px] text-emerald-500/90">{stateLabel(order)}</p>
          {order.txHash ? (
            <p className="mt-0.5 truncate text-[10px] text-zinc-600">tx {order.txHash}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
