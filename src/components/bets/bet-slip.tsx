"use client";

import { chainsData, type Address } from "@azuro-org/toolkit";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";

import { AZURO_CHAIN_ID } from "@/config/chain";
import { pushPlacedBet, readPlacedBets } from "@/lib/bets/local-bets";
import {
  prepareBetInteraction,
  type PreparedBetInteraction,
  type SlipSelection,
} from "@/lib/azuro/prepare-bet";
import { PlacedBetsList } from "@/components/bets/placed-bets-list";
import type { PlacedBetRecord } from "@/types/bets";

export type BetSlipSelection = SlipSelection & {
  gameTitle: string;
  marketTitle: string;
  outcomeTitle: string;
};

type BetSlipProps = {
  selection: BetSlipSelection | null;
  onClear: () => void;
};

function resolveCoreAddress(): Address | null {
  const chainData = chainsData[AZURO_CHAIN_ID];
  const maybeCore = chainData?.contracts?.core;
  if (!maybeCore) return null;
  if (typeof maybeCore === "string") return maybeCore as Address;
  if (typeof maybeCore === "object" && "address" in maybeCore) {
    return maybeCore.address as Address;
  }
  return null;
}

export function BetSlip({ selection, onClear }: BetSlipProps) {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [placedBets, setPlacedBets] = useState<PlacedBetRecord[]>([]);
  const [txState, setTxState] = useState<"idle" | "pending" | "success" | "failed">("idle");
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedBetInteraction | null>(null);
  const { signTypedDataAsync } = useSignTypedData();

  const potentialPayout = useMemo(() => {
    if (!selection) return null;
    const stake = Number.parseFloat(amount);
    const odds = Number.parseFloat(selection.odds);
    if (!Number.isFinite(stake) || stake <= 0 || !Number.isFinite(odds) || odds <= 0) return null;
    return stake * odds;
  }, [amount, selection]);

  const canPrepare = Boolean(selection && address && Number.parseFloat(amount) > 0);
  const canPlaceBet = Boolean(canPrepare && prepared && !isPreparing && txState !== "pending");

  useEffect(() => {
    setPlacedBets(readPlacedBets());
  }, []);

  async function onPrepareTransaction() {
    if (!selection || !address) return;
    const coreAddress = resolveCoreAddress();
    if (!coreAddress) {
      setError("Could not resolve Azuro core contract address for this chain.");
      return;
    }

    setError(null);
    setPrepared(null);
    setIsPreparing(true);
    try {
      const result = await prepareBetInteraction({
        account: address,
        selection,
        amount,
        coreAddress,
      });
      setPrepared(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prepare bet interaction.");
    } finally {
      setIsPreparing(false);
    }
  }

  async function onPlaceBet() {
    if (!selection || !address || !prepared) return;

    setTxState("pending");
    setError(null);
    setSuccessMessage(null);

    const betId = `${Date.now()}-${selection.conditionId}-${selection.outcomeId}`;
    const baseRecord: PlacedBetRecord = {
      id: betId,
      createdAt: new Date().toISOString(),
      gameTitle: selection.gameTitle,
      marketTitle: selection.marketTitle,
      outcomeTitle: selection.outcomeTitle,
      amount,
      odds: selection.odds,
      potentialPayout: potentialPayout?.toFixed(6) ?? "0",
      status: "pending",
    };
    pushPlacedBet(baseRecord);
    setPlacedBets(readPlacedBets());

    try {
      const signature = await signTypedDataAsync(prepared.typedData);

      const response = await fetch("/api/azuro/place-bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typedData: prepared.typedData,
          signature,
          amount,
          selection: {
            conditionId: selection.conditionId,
            outcomeId: selection.outcomeId,
            odds: selection.odds,
          },
        }),
      });

      const payload = (await response.json()) as {
        id?: string;
        orderId?: string;
        txHash?: string;
        error?: string;
        details?: unknown;
      };

      if (!response.ok) {
        throw new Error(payload?.error ?? "Order submission failed.");
      }

      const successRecord: PlacedBetRecord = {
        ...baseRecord,
        status: "success",
        orderId: payload.orderId ?? payload.id,
        txHash: payload.txHash,
      };
      pushPlacedBet(successRecord);
      setPlacedBets(readPlacedBets());
      setTxState("success");
      setSuccessMessage("Bet order submitted successfully.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bet execution failed.";
      const failedRecord: PlacedBetRecord = {
        ...baseRecord,
        status: "failed",
        errorMessage: message,
      };
      pushPlacedBet(failedRecord);
      setPlacedBets(readPlacedBets());
      setTxState("failed");
      setError(message);
    }
  }

  return (
    <aside className="sticky top-4 h-fit rounded-xl border border-zinc-800 bg-zinc-900/90 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-zinc-100">Bet slip</h3>
        {selection ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-zinc-400 transition hover:text-zinc-200"
          >
            Clear
          </button>
        ) : null}
      </div>

      {!selection ? (
        <p className="text-sm text-zinc-500">Select an odd from any market to build your bet.</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
            <p className="text-sm font-medium text-zinc-100">{selection.gameTitle}</p>
            <p className="mt-1 text-xs text-zinc-400">{selection.marketTitle}</p>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-zinc-300">{selection.outcomeTitle}</span>
              <span className="font-semibold text-emerald-400">{selection.odds}</span>
            </div>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-zinc-300">Bet amount</span>
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none ring-emerald-600/50 transition focus:ring"
            />
          </label>

          <div className="rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-sm">
            <p className="flex items-center justify-between text-zinc-400">
              <span>Potential payout</span>
              <span className="font-semibold text-zinc-200">
                {potentialPayout ? potentialPayout.toFixed(4) : "-"}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={onPrepareTransaction}
            disabled={!canPrepare || isPreparing}
            className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPreparing ? "Preparing…" : "Prepare transaction"}
          </button>

          <button
            type="button"
            onClick={onPlaceBet}
            disabled={!canPlaceBet}
            className="w-full rounded-md border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-900/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {txState === "pending" ? "Submitting…" : "Sign & place bet"}
          </button>

          {!address ? <p className="text-xs text-amber-300">Connect wallet to prepare order data.</p> : null}
          {txState === "pending" ? (
            <p className="text-xs text-amber-300">Transaction pending: waiting for signature and order acceptance.</p>
          ) : null}
          {txState === "success" && successMessage ? <p className="text-xs text-emerald-300">{successMessage}</p> : null}
          {error ? <p className="text-xs text-red-300">{error}</p> : null}

          {prepared ? (
            <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300">
              <p className="font-medium text-zinc-100">Prepared interaction</p>
              <p>Min bet: {prepared.calculation.minBet ?? "none"}</p>
              <p>Max bet: {prepared.calculation.maxBet}</p>
              <p>Max payout: {prepared.calculation.maxPayout}</p>
              <p>Relayer fee: {prepared.fee.beautyRelayerFeeAmount}</p>
              <p className="break-all text-zinc-500">
                Typed data ready for wallet signing (EIP-712): {JSON.stringify(prepared.typedData).slice(0, 240)}…
              </p>
            </div>
          ) : null}

          <div className="space-y-2 border-t border-zinc-800 pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Placed bets</p>
            <PlacedBetsList bets={placedBets} />
          </div>
        </div>
      )}
    </aside>
  );
}
