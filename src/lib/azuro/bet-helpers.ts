import type { BetOrderData } from "@azuro-org/toolkit";
import { BetOrderResult, BetOrderState } from "@azuro-org/toolkit";

export function isAzuroBetOpen(order: BetOrderData): boolean {
  return (
    order.state === BetOrderState.Created ||
    order.state === BetOrderState.Placed ||
    order.state === BetOrderState.Sent ||
    order.state === BetOrderState.Accepted ||
    order.state === BetOrderState.PendingCancel
  );
}

export function formatAzuroBetTitle(order: BetOrderData): string {
  const c0 = order.conditions[0];
  if (c0) return `Game ${c0.gameId} • ${c0.conditionId}`;
  return order.id.slice(0, 12) + "…";
}

export function azuroBetPnl(order: BetOrderData): number | null {
  if (order.state !== BetOrderState.Settled || order.result == null) return null;
  if (order.result === BetOrderResult.Won) return (order.payout ?? 0) - order.amount;
  if (order.result === BetOrderResult.Lost) return -order.amount;
  return 0;
}
