"use client";

import { BetOrderState, chainsData } from "@azuro-org/toolkit";
import { useMemo, useState } from "react";
import type { Address } from "viem";
import { useAccount, useChainId, useSignTypedData, useSwitchChain } from "wagmi";

import { AzuroBetsList } from "@/components/bets/azuro-bets-list";
import { BetExecutionButton } from "@/components/bets/BetExecutionButton";
import { useBetSlipOptional } from "@/contexts/bet-slip-context";
import { useLamborWallet } from "@/contexts/lambor-wallet-context";
import { AZURO_CHAIN_ID, targetChain } from "@/config/chain";
import { BET_TOKEN } from "@/config/azuro-polygon-contracts";
import { formatUnits } from "ethers";
import { usePaymasterBalances } from "@/hooks/use-paymaster-balances";
import { useAzuroBets, useInvalidateAzuroBets } from "@/hooks/use-azuro-bets";
import { useAzuroNewBetListener } from "@/hooks/use-azuro-new-bet-event";
import { placeComboBet, placeOrdinaryBet } from "@/lib/azuro/placeBet";
import { prepareBet, type PreparedOrdinaryBet, type SlipSelection } from "@/lib/azuro/prepareBet";
import { prepareComboBetInteraction } from "@/lib/azuro/prepare-combo-bet";
import { azuroSlipSelectionInvalidReason, isValidAzuroSlipSelection } from "@/lib/azuro/slip-selection-guards";
import { signBet } from "@/lib/azuro/signBet";
import { ensurePolygonWallet } from "@/lib/wallet/ensure-polygon";

export type BetSlipSelection = SlipSelection & {
  gameTitle: string;
  marketTitle: string;
  outcomeTitle: string;
  executable?: boolean;
  matchId?: number;
  /** Azuro graph / toolkit game id — required for a valid on-chain leg. */
  gameId?: string;
  conditionKind?: "LIVE";
  strategyPackageId?: string;
};

type BetSlipProps = {
  selection: BetSlipSelection | null;
  onClear: () => void;
  onPlaced?: () => void;
  slipLegCount?: number;
  parlaySelections?: BetSlipSelection[] | null;
  onParlayComplete?: () => void;
  /** When set, stake and acca payout come from global slip; list is shown in the parent. */
  variant?: "default" | "embedded";
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
  variant = "default",
  className = "",
}: BetSlipProps) {
  const slipCtx = useBetSlipOptional();
  const isEmbedded = variant === "embedded";

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

  const [fallbackStake, setFallbackStake] = useState("");
  const amount = slipCtx?.stake ?? fallbackStake;
  const setStakeValue = (v: string) => {
    if (slipCtx) slipCtx.setStake(v);
    else setFallbackStake(v);
  };

  const [txState, setTxState] = useState<"idle" | "pending" | "success" | "failed">("idle");
  const [isPreparing, setIsPreparing] = useState(false);
  const [awaitingSignature, setAwaitingSignature] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedOrdinaryBet | null>(null);
  const [parlayRunning, setParlayRunning] = useState(false);
  const { signTypedDataAsync } = useSignTypedData();

  const potentialPayout = useMemo(() => {
    if (slipCtx && slipCtx.items.length > 0 && slipCtx.payoutPreview != null) {
      return slipCtx.payoutPreview;
    }
    if (!selection) return null;
    const stake = Number.parseFloat(amount);
    const odds = Number.parseFloat(selection.odds);
    if (!Number.isFinite(stake) || stake <= 0 || !Number.isFinite(odds) || odds <= 0) return null;
    return stake * odds;
  }, [amount, selection, slipCtx]);

  const selectionValid = selection ? isValidAzuroSlipSelection(selection) : false;
  const selectionReason = selection ? azuroSlipSelectionInvalidReason(selection) : null;

  const stakeNum = Number.parseFloat(amount);
  const stakeOk = Number.isFinite(stakeNum) && stakeNum > 0;
  const pendingReserve = txState === "pending" || parlayRunning || awaitingSignature ? stakeNum : 0;
  const effectiveStakeBalance = Math.max(0, stakingBalanceNumber - (Number.isFinite(pendingReserve) ? pendingReserve : 0));
  const balanceLoading = walletBalanceLoading || pmLoading;
  const insufficientStake =
    stakeOk && !balanceLoading && walletOnPolygon && stakeNum > stakingBalanceNumber;

  const chainOk = chainId === AZURO_CHAIN_ID;
  const canPrepare = Boolean(
    selection &&
      address &&
      stakeOk &&
      selectionValid &&
      walletOnPolygon &&
      chainOk &&
      !insufficientStake &&
      !balanceLoading,
  );
  const canPlaceBet = Boolean(
    canPrepare && prepared && !isPreparing && !awaitingSignature && txState !== "pending" && !parlayRunning,
  );

  async function ensureAzuroChain() {
    await ensurePolygonWallet();
    if (chainId === targetChain.id) return;
    if (!switchChain) {
      throw new Error(`Switch your wallet to ${targetChain.name} (chain ${targetChain.id}) for Azuro.`);
    }
    await switchChain({ chainId: targetChain.id });
  }

  async function onPrepareTransaction() {
    if (!selection || !address || !isValidAzuroSlipSelection(selection)) return;
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
      const result = await prepareBet({
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
    if (!selection || !address || !prepared || !isValidAzuroSlipSelection(selection)) return;

    setTxState("pending");
    setError(null);
    setSuccessMessage(null);

    try {
      await ensureAzuroChain();
      const coreAddress = resolveCoreAddress();
      if (!coreAddress) {
        throw new Error("Could not resolve Azuro Core contract for this chain.");
      }

      setAwaitingSignature(true);
      const signature = await signBet(prepared.typedData, signTypedDataAsync);
      setAwaitingSignature(false);

      const result = await placeOrdinaryBet(prepared.relayBody, signature);

      if (result.state === BetOrderState.Rejected || result.errorMessage || result.error) {
        throw new Error(result.errorMessage ?? result.error ?? "Order was rejected.");
      }

      await invalidateAzuro();
      await refetchWalletBalances();
      await refetchPmBalances();
      onPlaced?.();
      setTxState("success");
      setSuccessMessage(
        `Order accepted (id ${result.id}). Relayer submits on Polygon — watch for Core NewLiveBet; Azuro bet token appears in your orders below.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bet execution failed.";
      setTxState("failed");
      setError(message);
    } finally {
      setAwaitingSignature(false);
    }
  }

  const parlayLegs = parlaySelections?.filter((x) => isValidAzuroSlipSelection(x)) ?? [];
  const parlayEligible =
    slipLegCount >= 2 &&
    parlayLegs.length >= 2 &&
    parlayLegs.length === slipLegCount &&
    stakeOk &&
    Boolean(address) &&
    !parlayRunning &&
    walletOnPolygon &&
    chainOk &&
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
      setAwaitingSignature(true);
      const signature = await signBet(prep.typedData, signTypedDataAsync);
      setAwaitingSignature(false);

      const comboResult = await placeComboBet(prep.relayBody, signature);
      if (comboResult.state === BetOrderState.Rejected || comboResult.errorMessage || comboResult.error) {
        throw new Error(comboResult.errorMessage ?? comboResult.error ?? "Combo order was rejected.");
      }
      await invalidateAzuro();
      await refetchWalletBalances();
      await refetchPmBalances();
      setTxState("success");
      setSuccessMessage(`Combo order accepted (id ${comboResult.id}, ${n} legs). Relayer submits on Polygon.`);
      onParlayComplete?.();
      onPlaced?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Parlay placement failed.";
      setTxState("failed");
      setError(message);
    } finally {
      setAwaitingSignature(false);
      setParlayRunning(false);
    }
  }

  return (
    <aside
      className={`h-fit rounded-xl border border-zinc-800 bg-zinc-900/90 p-4 ${isEmbedded ? "border-0 bg-transparent" : ""} ${className}`}
    >
      {!isEmbedded ? (
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-100">Bet slip</h3>
          {selection ? (
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-zinc-400 transition hover:text-zinc-200"
            >
              Remove active leg
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">{"Sign & place"}</h3>
          {selection ? (
            <button type="button" onClick={onClear} className="text-[11px] text-zinc-500 transition hover:text-zinc-300">
              Remove active leg
            </button>
          ) : null}
        </div>
      )}

      {!selection ? (
        <p className="text-sm text-zinc-500">
          {isEmbedded ? "Tap a leg in the list above to activate it, then prepare and sign below." : "Select an odd from any market to build your bet."}
        </p>
      ) : (
        <div className="space-y-4">
          {!isEmbedded ? (
            <>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                <p className="text-sm font-medium text-zinc-100">{selection.gameTitle}</p>
                <p className="mt-1 text-xs text-zinc-400">{selection.marketTitle}</p>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{selection.outcomeTitle}</span>
                  <span className="font-semibold text-emerald-400">{selection.odds}</span>
                </div>
                {selectionReason ? (
                  <p className="mt-2 text-[11px] text-amber-300">{selectionReason} On-chain betting is disabled for this leg.</p>
                ) : selection.gameId ? (
                  <p className="mt-2 text-[10px] text-zinc-500">
                    Azuro game <span className="font-mono text-zinc-400">{selection.gameId}</span> • LIVE
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
                  onChange={(event) => setStakeValue(event.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none ring-emerald-600/50 transition focus:ring"
                />
              </label>
            </>
          ) : (
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Active leg</p>
              <p className="mt-1 truncate text-sm text-zinc-100">{selection.gameTitle}</p>
              <p className="truncate text-[11px] text-zinc-500">
                {selection.marketTitle} · {selection.outcomeTitle} @ {selection.odds}
              </p>
              {selectionReason ? (
                <p className="mt-2 text-[11px] text-amber-300">{selectionReason}</p>
              ) : null}
            </div>
          )}

          <div className="rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-sm">
            <p className="flex items-center justify-between text-zinc-400">
              <span>Lambor balance — PayMaster ({betTokenSymbol})</span>
              <span className="font-semibold text-zinc-200">
                {balanceLoading ? "…" : effectiveStakeBalance.toFixed(4)}
              </span>
            </p>
            {!isEmbedded ? (
              <p className="mt-1 flex items-center justify-between text-zinc-400">
                <span>Potential payout</span>
                <span className="font-semibold text-zinc-200">
                  {potentialPayout != null ? potentialPayout.toFixed(4) : "-"}
                </span>
              </p>
            ) : (
              <p className="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
                <span>Return at stake × acca</span>
                <span className="font-semibold text-emerald-200/90 tabular-nums">
                  {potentialPayout != null ? potentialPayout.toFixed(4) : "—"}
                </span>
              </p>
            )}
          </div>

          {insufficientStake ? (
            <p className="text-xs text-red-300">
              Stake exceeds your Lambor (PayMaster) balance. Deposit USDT on the Wall tab — bets use that vault, not wallet USDT.
            </p>
          ) : null}
          {!walletOnPolygon && address ? (
            <p className="text-xs text-amber-300">Switch MetaMask to Polygon to bet.</p>
          ) : null}

          <BetExecutionButton
            isEmbedded={isEmbedded}
            canPrepare={canPrepare}
            canPlace={canPlaceBet}
            isPreparing={isPreparing}
            awaitingSignature={awaitingSignature}
            isPlacing={txState === "pending"}
            parlayRunning={parlayRunning}
            onPrepare={() => void onPrepareTransaction()}
            onPlace={() => void onPlaceBet()}
            showCombo={parlayEligible}
            comboDisabled={parlayRunning}
            comboLabel={
              parlayRunning
                ? `Placing combo… (${parlayLegs.length} legs)`
                : `Sign & place combo (${parlayLegs.length} legs)`
            }
            onPlaceCombo={() => void onPlaceParlay()}
          />

          {!chainOk && address ? (
            <p className="text-[11px] text-amber-300">
              Wrong chain — switch to Polygon ({AZURO_CHAIN_ID}) to sign and place Azuro bets.
            </p>
          ) : null}

          {slipLegCount > 1 ? (
            <p className="text-[11px] text-zinc-500">
              Acca odds shown in the slip are approximate. Use “Place combo” for an Azuro combo order (single EIP-712 signature, relayer executes on Polygon).
            </p>
          ) : null}

          {!address ? <p className="text-xs text-amber-300">Connect wallet to prepare order data.</p> : null}
          {awaitingSignature ? (
            <p className="text-xs text-amber-300">Confirm the EIP-712 bet order in your wallet.</p>
          ) : null}
          {txState === "pending" && !awaitingSignature ? (
            <p className="text-xs text-amber-300">Submitting signed order to Azuro relayer…</p>
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
