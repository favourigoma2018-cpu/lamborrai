"use client";

import type { PlacedBetRecord } from "@/types/bets";

type PlacedBetsListProps = {
  bets: PlacedBetRecord[];
};

function statusClass(status: PlacedBetRecord["status"]) {
  if (status === "success") return "text-emerald-300";
  if (status === "failed") return "text-red-300";
  return "text-amber-300";
}

export function PlacedBetsList({ bets }: PlacedBetsListProps) {
  if (bets.length === 0) {
    return <p className="text-xs text-zinc-500">No bets placed in this browser session yet.</p>;
  }

  return (
    <div className="space-y-2">
      {bets.map((bet) => (
        <div key={bet.id} className="rounded-md border border-zinc-800 bg-zinc-950/50 p-2 text-xs">
          <p className="truncate font-medium text-zinc-200">{bet.gameTitle}</p>
          <p className="truncate text-zinc-400">{bet.outcomeTitle}</p>
          <div className="mt-1 flex items-center justify-between text-zinc-400">
            <span>
              {bet.amount} @ {bet.odds}
            </span>
            <span className={statusClass(bet.status)}>{bet.status}</span>
          </div>
          {bet.txHash ? <p className="mt-1 truncate text-zinc-500">tx: {bet.txHash}</p> : null}
          {bet.orderId ? <p className="truncate text-zinc-500">order: {bet.orderId}</p> : null}
          {bet.errorMessage ? <p className="mt-1 text-red-300">{bet.errorMessage}</p> : null}
        </div>
      ))}
    </div>
  );
}
