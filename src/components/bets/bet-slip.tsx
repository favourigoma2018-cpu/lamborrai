"use client";

import { chainsData } from "@azuro-org/toolkit";
import { useMemo, useState } from "react";
import type { Address } from "viem";
import { useAccount, useChainId, useSignTypedData, useSwitchChain } from "wagmi";

import { AzuroBetsList } from "@/components/bets/azuro-bets-list";
import { useLamborWallet } from "@/contexts/lambor-wallet-context";
import { AZURO_CHAIN_ID, targetChain } from "@/config/chain";
import { BET_TOKEN } from "@/config/azuro-polygon-contracts";
import { formatUnits } from "ethers";
import { usePaymasterBalances } from "@/hooks/use-paymaster-balances";
import { useAzuroBets, useInvalidateAzuroBets } from "@/hooks/use-azuro-bets";
import { useAzuroNewBetListener } from "@/hooks/use-azuro-new-bet-event";
import {
  prepareBetInteraction,
  type PreparedBetInteraction,
  type SlipSelection,
} from "@/lib/azuro/prepare-bet";
import { prepareComboBetInteraction } from "@/lib/azuro/prepare-combo-bet";
import { submitComboBetOrder, submitOrdinaryBetOrder } from "@/lib/azuro/submit-azuro-order";
import { ensurePolygonWallet } from "@/lib/wallet/ensure-polygon";

export type BetSlipSelection = SlipSelection & {
  gameTitle: string;
  marketTitle: string;
  outcomeTitle: string;
  executable?: boolean;
  matchId?: number;
  strategyPackageId?: string;
};

type BetSlipProps = {
  selection: BetSlipSelection | null;
  onClear: () => void;
  onPlaced?: () => void;
  slipLegCount?: number;
  parlaySelections?: BetSlipSelection[] | null;
  onParlayComplete?: () => void;
  className?: string;
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

export function BetSlip({
  selection,
  onClear,
  onPlaced,
  slipLegCount = 0,
  parlaySelections = null,
  onParlayComplete,
  className = "",
}: BetSlipProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const {
    betTokenSymbol,
    isPolygon: walletOnPolygon,
    balanceLoading: walletBalanceLoading,
    refetchBalances: refetchWalletBalances,
  } = useLamborWallet();
  const { freeBetsWei, refetch: refetchPmBalances, loading: pmLoading } = usePaymasterBalances();
  const stakingBalanceNumber = Number.parseFloat(formatUnits(freeBetsWei, BET_TOKEN.decimals));
  const invalidateAzuro = useInvalidateAzuroBets();
  const { data: azuroOrders = [], isLoading: isLoadingBets } = useAzuroBets();
  useAzuroNewBetListener();

  const [amount, setAmount] = useState("");
  const [txState, setTxState] = useState<"idle" | "pending" | "success" | "failed">("idle");
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedBetInteraction | null>(null);
  const [parlayRunning, setParlayRunning] = useState(false);
  const { signTypedDataAsync } = useSignTypedData();

  const potentialPayout = useMemo(() => {
    if (!selection) return null;
    const stake = Number.parseFloat(amount);
    const odds = Number.parseFloat(selection.odds);
    if (!Number.isFinite(stake) || stake <= 0 || !Number.isFinite(odds) || odds <= 0) return null;
    return stake * odds;
  }, [amount, selection]);

  const isExecutable = selection?.executable !== false;

  const stakeNum = Number.parseFloat(amount);
  const stakeOk = Number.isFinite(stakeNum) && stakeNum > 0;
  const pendingReserve = txState === "pending" || parlayRunning ? stakeNum : 0;
  const effectiveStakeBalance = Math.max(0, stakingBalanceNumber - (Number.isFinite(pendingReserve) ? pendingReserve : 0));
  const balanceLoading = walletBalanceLoading || pmLoading;
  const insufficientStake =
    stakeOk && !balanceLoading && walletOnPolygon && stakeNum > stakingBalanceNumber;

  const canPrepare = Boolean(
    selection &&
      address &&
      stakeOk &&
      isExecutable &&
      walletOnPolygon &&
      !insufficientStake &&
      !balanceLoading,
  );
  const canPlaceBet = Boolean(canPrepare && prepared && !isPreparing && txState !== "pending");

  async function ensureAzuroChain() {
    await ensurePolygonWallet();
    if (chainId === targetChain.id) return;
    if (!switchChain) {
      throw new Error(`Switch your wallet to ${targetChain.name} (chain ${targetChain.id}) for Azuro.`);
    }
    await switchChain({ chainId: targetChain.id });
  }

  async function onPrepareTransaction() {
    if (!selection || !address || selection.executable === false) return;
    const coreAddress = resolveCoreAddress();
    if (!coreAddress) {
      setError("Could not resolve Azuro core contract address for this chain.");
      return;
    }

    setError(null);
    setPrepared(null);
    setIsPreparing(true);
    try {
      await ensureAzuroChain();
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
    if (!selection || !address || !prepared || selection.executable === false) return;

    setTxState("pending");
    setError(null);
    setSuccessMessage(null);

    try {
      await ensureAzuroChain();
      const coreAddress = resolveCoreAddress();
      if (!coreAddress) {
        throw new Error("Could not resolve Azuro Core contract for this chain.");
      }

      const signature = await signTypedDataAsync(prepared.typedData);
      await submitOrdinaryBetOrder({
        account: address,
        signature,
        coreAddress,
        relayerFeeAmount: prepared.fee.relayerFeeAmount,
        ...prepared.submitPayload,
      });

      await invalidateAzuro();
      await refetchWalletBalances();
      await refetchPmBalances();
      onPlaced?.();
      setTxState("success");
      setSuccessMessage("Order sent to Azuro. Relayer submits to Polygon — status updates below.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bet execution failed.";
      setTxState("failed");
      setError(message);
    }
  }

  const parlayLegs = parlaySelections?.filter((x) => x.executable !== false) ?? [];
  const parlayEligible =
    parlayLegs.length >= 2 &&
    stakeOk &&
    Boolean(address) &&
    !parlayRunning &&
    walletOnPolygon &&
    !insufficientStake &&
    !balanceLoading;

  async function onPlaceParlay() {
    if (!address || !parlayEligible) return;
    const coreAddress = resolveCoreAddress();
    if (!coreAddress) {
      setError("Could not resolve Azuro core contract address for this chain.");
      return;
    }

    setParlayRunning(true);
    setTxState("pending");
    setError(null);
    setSuccessMessage(null);

    const n = parlayLegs.length;

    try {
      await ensureAzuroChain();
      const prep = await prepareComboBetInteraction({
        account: address,
        legs: parlayLegs,
        totalStakeHuman: amount,
        coreAddress,
      });
      const signature = await signTypedDataAsync(prep.typedData);
      await submitComboBetOrder({
        account: address,
        signature,
        coreAddress,
        relayerFeeAmount: prep.fee.relayerFeeAmount,
        ...prep.submitPayload,
      });
      await invalidateAzuro();
      await refetchWalletBalances();
      await refetchPmBalances();
      setTxState("success");
      setSuccessMessage(`Combo order submitted (${n} legs, one signature).`);
      onParlayComplete?.();
      onPlaced?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Parlay placement failed.";
      setTxState("failed");
      setError(message);
    } finally {
      setParlayRunning(false);
    }
  }

  return (
    <aside className={`h-fit rounded-xl border border-zinc-800 bg-zinc-900/90 p-4 ${className}`}>
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
            {selection.executable === false ? (
              <p className="mt-2 text-[11px] text-amber-300">
                Display-only line (no Azuro market id). Pick a highlighted on-chain odd to prepare a transaction.
              </p>
            ) : null}
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-zinc-300">Bet amount (bet token)</span>
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
              <span>PayMaster stake ({betTokenSymbol})</span>
              <span className="font-semibold text-zinc-200">
                {balanceLoading ? "…" : effectiveStakeBalance.toFixed(4)}
              </span>
            </p>
            <p className="mt-1 flex items-center justify-between text-zinc-400">
              <span>Potential payout</span>
              <span className="font-semibold text-zinc-200">
                {potentialPayout ? potentialPayout.toFixed(4) : "-"}
              </span>
            </p>
          </div>

          {insufficientStake ? (
            <p className="text-xs text-red-300">
              Stake exceeds your PayMaster free balance. Deposit USDT to PayMaster on the Wall tab first.
            </p>
          ) : null}
          {!walletOnPolygon && address ? (
            <p className="text-xs text-amber-300">Switch MetaMask to Polygon to bet.</p>
          ) : null}

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
            disabled={!canPlaceBet || parlayRunning}
            className="w-full rounded-md border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-900/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {txState === "pending" && !parlayRunning ? "Submitting…" : "Sign & place bet"}
          </button>

          {parlayEligible ? (
            <button
              type="button"
              onClick={() => void onPlaceParlay()}
              disabled={parlayRunning}
              className="w-full rounded-md bg-emerald-700/40 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-600/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {parlayRunning
                ? `Submitting combo… (${parlayLegs.length} legs)`
                : `Place combo (${parlayLegs.length} legs, one signature)`}
            </button>
          ) : null}

          {chainId !== targetChain.id ? (
            <p className="text-[11px] text-amber-300">
              Azuro orders are signed on Polygon {targetChain.id}. Approve the network switch when prompted.
            </p>
          ) : null}

          {slipLegCount > 1 ? (
            <p className="text-[11px] text-zinc-500">
              Acca odds shown in the slip are approximate. Use “Place combo” for an Azuro combo order (single EIP-712 signature, relayer executes on Polygon).
            </p>
          ) : null}

          {!address ? <p className="text-xs text-amber-300">Connect wallet to prepare order data.</p> : null}
          {txState === "pending" ? (
            <p className="text-xs text-amber-300">Waiting for signature and relayer submission…</p>
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
            </div>
          ) : null}

          <div className="space-y-2 border-t border-zinc-800 pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Your orders (Azuro API)</p>
            <AzuroBetsList orders={azuroOrders} isLoading={isLoadingBets} />
          </div>
        </div>
      )}
    </aside>
  );
}
