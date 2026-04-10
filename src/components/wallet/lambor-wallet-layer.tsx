"use client";

import type { BetOrderData } from "@azuro-org/toolkit";
import { BetOrderResult, BetOrderState } from "@azuro-org/toolkit";
import { formatUnits } from "ethers";
import { useMemo, useState } from "react";

import { BET_TOKEN } from "@/config/azuro-polygon-contracts";
import { useLamborWallet } from "@/contexts/lambor-wallet-context";
import { useAzuroBets } from "@/hooks/use-azuro-bets";
import { useEthersSigner } from "@/hooks/use-ethers-signer";
import { usePaymasterBalances } from "@/hooks/use-paymaster-balances";
import {
  depositForPaymaster,
  formatToken,
  withdrawFromPaymaster,
  withdrawPayoutsFromPaymaster,
} from "@/lib/azuro/paymaster-ethers";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function claimableBetIds(orders: BetOrderData[]): bigint[] {
  const ids: bigint[] = [];
  for (const o of orders) {
    if (o.state !== BetOrderState.Settled || o.result !== BetOrderResult.Won) continue;
    if (o.betId == null) continue;
    if (o.meta?.isRedeemed === true) continue;
    ids.push(BigInt(o.betId));
  }
  return ids;
}

export function LamborWalletLayer() {
  const {
    isMetaMaskAvailable,
    depositAddress,
    walletMode,
    setWalletMode,
    isPolygon,
    isConnected,
    connectWallet,
    disconnectWallet,
    isConnecting,
    connectError,
    switchToPolygon,
    nativeBalanceFormatted,
    balanceLoading: walletNativeLoading,
    refetchBalances: refetchWalletContext,
  } = useLamborWallet();

  const {
    walletTokenWei,
    freeBetsWei,
    feeWei,
    loading: pmLoading,
    error: pmError,
    refetch: refetchPm,
  } = usePaymasterBalances();

  const { data: orders = [] } = useAzuroBets();
  const signer = useEthersSigner();

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawFree, setWithdrawFree] = useState("");
  const [withdrawFee, setWithdrawFee] = useState("0");
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, setPending] = useState<"deposit" | "withdraw" | "claim" | null>(null);

  const claimIds = useMemo(() => claimableBetIds(orders), [orders]);

  async function onConnect() {
    setLocalError(null);
    try {
      await connectWallet();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Connection failed.");
    }
  }

  async function refreshAll() {
    await refetchPm();
    await refetchWalletContext();
  }

  async function onDepositToPaymaster() {
    if (!signer || !depositAddress) return;
    setLocalError(null);
    setPending("deposit");
    try {
      await depositForPaymaster(
        signer,
        depositAddress,
        BET_TOKEN.address,
        BET_TOKEN.decimals,
        depositAmount,
        "0",
      );
      setDepositAmount("");
      await refreshAll();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Deposit failed.");
    } finally {
      setPending(null);
    }
  }

  async function onWithdrawFromPaymaster() {
    if (!signer) return;
    setLocalError(null);
    setPending("withdraw");
    try {
      await withdrawFromPaymaster(signer, BET_TOKEN.decimals, withdrawFree, withdrawFee || "0");
      setWithdrawFree("");
      setWithdrawFee("0");
      await refreshAll();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Withdraw failed.");
    } finally {
      setPending(null);
    }
  }

  async function onClaimPayouts() {
    if (!signer || claimIds.length === 0) return;
    setLocalError(null);
    setPending("claim");
    try {
      await withdrawPayoutsFromPaymaster(signer, claimIds);
      await refreshAll();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Claim failed.");
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;
  const balLoading = walletNativeLoading || pmLoading;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-500/35 bg-zinc-900/60 p-4 shadow-[0_0_28px_rgba(0,255,163,0.14)]">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Lambor · Azuro PayMaster</p>
        <p className="mt-2 text-sm text-zinc-500">
          MetaMask + Polygon (137) only. Deposits use <code className="text-zinc-400">depositFor</code>, claims use{" "}
          <code className="text-zinc-400">withdrawPayouts</code> — all signed in MetaMask (ethers.js).
        </p>
      </div>

      {!isMetaMaskAvailable ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          MetaMask is required.{" "}
          <a href="https://metamask.io" target="_blank" rel="noreferrer" className="underline">
            Install MetaMask
          </a>
        </p>
      ) : null}

      {!isConnected ? (
        <button
          type="button"
          onClick={() => void onConnect()}
          disabled={!isMetaMaskAvailable || isConnecting}
          className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isConnecting ? "Connecting…" : "Connect MetaMask (Polygon)"}
        </button>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setWalletMode("deposit")}
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                walletMode === "deposit"
                  ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
                  : "border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              Deposit
            </button>
            <button
              type="button"
              onClick={() => setWalletMode("withdraw")}
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                walletMode === "withdraw"
                  ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
                  : "border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              Withdraw
            </button>
          </div>

          {!isPolygon ? (
            <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-sm text-amber-200">Switch to Polygon Mainnet (chain 137).</p>
              <button
                type="button"
                onClick={() => void switchToPolygon()}
                className="w-full rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-500"
              >
                Switch network
              </button>
            </div>
          ) : null}

          <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/55 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Wallet</p>
            <p className="mt-1 font-mono text-sm text-emerald-300">{depositAddress ? shortenAddress(depositAddress) : "—"}</p>

            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2 border-b border-zinc-800 pb-2">
                <span className="text-zinc-500">MATIC</span>
                <span className="font-semibold text-zinc-100">{balLoading ? "…" : nativeBalanceFormatted}</span>
              </div>
              <div className="flex justify-between gap-2 border-b border-zinc-800 pb-2">
                <span className="text-zinc-500">{BET_TOKEN.symbol} (wallet)</span>
                <span className="font-semibold text-zinc-100">
                  {balLoading ? "…" : formatToken(walletTokenWei, BET_TOKEN.decimals, BET_TOKEN.symbol)}
                </span>
              </div>
              <div className="flex justify-between gap-2 border-b border-zinc-800 pb-2">
                <span className="text-zinc-500">PayMaster free</span>
                <span className="font-semibold text-emerald-200/90">
                  {balLoading ? "…" : formatToken(freeBetsWei, BET_TOKEN.decimals, BET_TOKEN.symbol)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-zinc-500">PayMaster fee</span>
                <span className="font-semibold text-zinc-100">
                  {balLoading ? "…" : formatToken(feeWei, BET_TOKEN.decimals, BET_TOKEN.symbol)}
                </span>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-zinc-600">
              Stake from <span className="text-zinc-400">PayMaster free</span> balance. Deposit wallet USDT first, then deposit
              into PayMaster.
            </p>
          </div>

          {isPolygon && depositAddress ? (
            <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Claim winnings</p>
              <p className="text-[11px] text-zinc-500">
                Pending on-chain claims: {claimIds.length}. Auto-claim runs in background; you can also claim manually.
              </p>
              <button
                type="button"
                disabled={busy || claimIds.length === 0 || !signer}
                onClick={() => void onClaimPayouts()}
                className="w-full rounded-xl border border-emerald-500/50 bg-emerald-500/10 py-2.5 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending === "claim" ? "Confirm in MetaMask…" : `Claim payouts (${claimIds.length})`}
              </button>
            </div>
          ) : null}

          {walletMode === "deposit" && isPolygon ? (
            <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <p className="text-sm text-zinc-400">
                Approve + <code className="text-zinc-500">depositFor</code>(your address, amount, 0 fee) on PayMaster.
              </p>
              <label className="block text-xs text-zinc-500">
                Amount ({BET_TOKEN.symbol})
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-emerald-600/30 focus:ring"
                />
              </label>
              <button
                type="button"
                disabled={busy || !signer || Number.parseFloat(depositAmount) <= 0}
                onClick={() => void onDepositToPaymaster()}
                className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending === "deposit" ? "Depositing…" : "Deposit to PayMaster"}
              </button>
            </div>
          ) : null}

          {walletMode === "withdraw" && isPolygon ? (
            <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <p className="text-sm text-zinc-400">
                <code className="text-zinc-500">withdraw</code>(freeBetAmount, feeAmount) — pulls USDT from PayMaster to your
                wallet.
              </p>
              <label className="block text-xs text-zinc-500">
                Free bet fund ({BET_TOKEN.symbol})
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={withdrawFree}
                  onChange={(e) => setWithdrawFree(e.target.value)}
                  placeholder="0"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-emerald-600/30 focus:ring"
                />
              </label>
              <label className="block text-xs text-zinc-500">
                Fee fund ({BET_TOKEN.symbol})
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={withdrawFee}
                  onChange={(e) => setWithdrawFee(e.target.value)}
                  placeholder="0"
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-emerald-600/30 focus:ring"
                />
              </label>
              <p className="text-[10px] text-zinc-600">
                Max free: {formatUnits(freeBetsWei, BET_TOKEN.decimals)} · Max fee: {formatUnits(feeWei, BET_TOKEN.decimals)}
              </p>
              <button
                type="button"
                disabled={
                  busy ||
                  !signer ||
                  (Number.parseFloat(withdrawFree) <= 0 && Number.parseFloat(withdrawFee || "0") <= 0)
                }
                onClick={() => void onWithdrawFromPaymaster()}
                className="w-full rounded-xl bg-emerald-700/50 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-600/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending === "withdraw" ? "Withdrawing…" : "Withdraw from PayMaster"}
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => disconnectWallet()}
            className="w-full rounded-xl border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800/70"
          >
            Disconnect
          </button>
        </div>
      )}

      {connectError ? <p className="text-xs text-red-300">{connectError.message}</p> : null}
      {localError ? <p className="text-xs text-red-300">{localError}</p> : null}
      {pmError ? <p className="text-xs text-red-300">{pmError.message}</p> : null}
    </div>
  );
}
