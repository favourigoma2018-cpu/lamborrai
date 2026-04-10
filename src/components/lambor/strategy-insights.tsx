"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";

import { useAzuroBets } from "@/hooks/use-azuro-bets";
import { azuroBetPnl, isAzuroBetOpen } from "@/lib/azuro/bet-helpers";
import { STRATEGY_PACKAGES } from "@/lib/lambor/strategy-packages/metadata";
import { getPackageStats } from "@/lib/lambor/strategy-engine/package-learning";
import { readBankroll } from "@/lib/lambor/strategy-engine/bankroll";

export function StrategyInsightsStrip() {
  const bankroll = useMemo(() => readBankroll(), []);
  const { address } = useAccount();
  const { data: orders = [] } = useAzuroBets();

  const todayPnl = useMemo(() => {
    const day = new Date().toDateString();
    if (!address) return 0;
    return orders
      .filter((o) => new Date(o.createdAt).toDateString() === day)
      .reduce((sum, o) => sum + (azuroBetPnl(o) ?? 0), 0);
  }, [address, orders]);

  const openCount = useMemo(() => orders.filter(isAzuroBetOpen).length, [orders]);

  return (
    <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/50 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Engine & bankroll</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-zinc-500">Bankroll (local sim)</p>
          <p className="font-semibold text-zinc-100">${bankroll.balance.toFixed(0)}</p>
        </div>
        <div>
          <p className="text-zinc-500">Today P/L (Azuro)</p>
          <p className={`font-semibold ${todayPnl >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {todayPnl >= 0 ? "+" : ""}${todayPnl.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-zinc-500">Open orders</p>
          <p className="font-semibold text-zinc-200">{openCount}</p>
        </div>
        <div>
          <p className="text-zinc-500">Wallet</p>
          <p className="font-semibold text-zinc-200">{address ? "Connected" : "—"}</p>
        </div>
      </div>
      <div className="mt-3 max-h-24 space-y-1 overflow-y-auto border-t border-zinc-800 pt-2">
        <p className="text-[10px] uppercase tracking-wide text-zinc-600">Strategy packages (tracked)</p>
        {STRATEGY_PACKAGES.slice(0, 4).map((p) => {
          const s = getPackageStats(p.id);
          const n = s.wins + s.losses;
          const wr = n ? ((s.wins / n) * 100).toFixed(0) : "—";
          return (
            <div key={p.id} className="flex justify-between text-[10px] text-zinc-400">
              <span className="truncate pr-2">{p.name}</span>
              <span>
                {s.wins}W/{s.losses}L • {wr}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
