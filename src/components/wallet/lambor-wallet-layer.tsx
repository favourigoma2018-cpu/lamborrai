"use client";

import type { BetOrderData } from "@azuro-org/toolkit";
import { BetOrderResult, BetOrderState } from "@azuro-org/toolkit";
import { AnimatePresence, motion } from "framer-motion";
import { formatUnits } from "ethers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BET_TOKEN } from "@/config/azuro-polygon-contracts";
import { useLamborWallet } from "@/contexts/lambor-wallet-context";
import { useAzuroBets } from "@/hooks/use-azuro-bets";
import { useEthersSigner } from "@/hooks/use-ethers-signer";
import { usePaymasterBalances } from "@/hooks/use-paymaster-balances";
import { isAzuroBetOpen, formatAzuroBetTitle } from "@/lib/azuro/bet-helpers";
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

/** USDT in wallet + full Paymaster balance (free + fee). */
function totalBalanceUsdLabel(walletWei: bigint, paymasterWei: bigint, decimals: number): string {
  const sum = walletWei + paymasterWei;
  try {
    const n = Number.parseFloat(formatUnits(sum, decimals));
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return "—";
  }
}

type ToastState = { kind: "success" | "error"; message: string } | null;

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

  const { data: orders = [], isLoading: ordersLoading } = useAzuroBets();
  const signer = useEthersSigner();

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawFree, setWithdrawFree] = useState("");
  const [withdrawFee, setWithdrawFee] = useState("0");
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, setPending] = useState<"deposit" | "withdraw" | "claim" | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const autoConnectDone = useRef(false);

  const claimIds = useMemo(() => claimableBetIds(orders), [orders]);
  const pendingSettlement = useMemo(() => orders.filter(isAzuroBetOpen), [orders]);
  const paymasterTotalWei = useMemo(() => freeBetsWei + feeWei, [freeBetsWei, feeWei]);

  /** Opens this dapp inside MetaMask mobile (injected provider + connect flow). */
  const openInMetaMaskUrl = useMemo(() => {
    if (typeof window === "undefined") return "https://metamask.io/download/";
    return `https://metamask.app.link/dapp/${encodeURIComponent(window.location.href)}`;
  }, []);

  const showToast = useCallback((kind: "success" | "error", message: string) => {
    setToast({ kind, message });
  }, []);

  const onConnect = useCallback(async () => {
    setLocalError(null);
    try {
      await connectWallet();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Connection failed.";
      setLocalError(msg);
      showToast("error", msg);
    }
  }, [connectWallet, showToast]);

  /** One-time auto connect when MetaMask is present (uses existing connectWallet). */
  useEffect(() => {
    if (autoConnectDone.current) return;
    if (!isMetaMaskAvailable || isConnected || isConnecting) return;
    autoConnectDone.current = true;
    void connectWallet().catch(() => {
      autoConnectDone.current = false;
    });
  }, [isMetaMaskAvailable, isConnected, isConnecting, connectWallet]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

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
      showToast("success", "Deposit submitted successfully.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Deposit failed.";
      setLocalError(msg);
      showToast("error", msg);
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
      showToast("success", "Withdrawal submitted.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Withdraw failed.";
      setLocalError(msg);
      showToast("error", msg);
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
      showToast("success", "Payout claim submitted.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Claim failed.";
      setLocalError(msg);
      showToast("error", msg);
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;
  const balLoading = walletNativeLoading || pmLoading;
  const networkBlocked = isConnected && !isPolygon;
  const actionsDisabled = busy || networkBlocked || !isPolygon;
  const totalBalanceDisplay = totalBalanceUsdLabel(walletTokenWei, paymasterTotalWei, BET_TOKEN.decimals);

  return (
    <div className="relative mx-auto w-full max-w-md space-y-6 pb-2">
      {/* Toast */}
      <AnimatePresence>
        {toast ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`fixed left-1/2 top-20 z-50 max-w-[min(100vw-2rem,24rem)] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-center text-sm font-medium shadow-lg ${
              toast.kind === "success"
                ? "border-emerald-500/50 bg-emerald-950/95 text-emerald-100"
                : "border-red-500/45 bg-red-950/95 text-red-100"
            }`}
          >
            {toast.message}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* MetaMask missing — desktop: extension; mobile: use MetaMask in-app browser or deep link */}
      {!isMetaMaskAvailable ? (
        <div className="rounded-2xl border border-red-500/35 bg-red-500/10 p-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <p className="text-sm font-medium text-red-100">MetaMask not detected in this browser</p>
          <p className="mt-1 text-xs text-red-200/80">
            On your phone, open this site from the Browser tab inside the MetaMask app, or use the button below to
            launch MetaMask with this page.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <a
              href={openInMetaMaskUrl}
              className="inline-flex justify-center rounded-xl bg-emerald-600/90 px-4 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(0,255,163,0.2)] transition hover:bg-emerald-500"
            >
              Open in MetaMask
            </a>
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex justify-center rounded-xl bg-red-500/20 px-4 py-3 text-sm font-semibold text-red-100 underline-offset-2 hover:bg-red-500/30"
            >
              Install MetaMask
            </a>
          </div>
        </div>
      ) : null}

      {/* Connect — primary CTA */}
      {isMetaMaskAvailable && !isConnected ? (
        <div className="space-y-3">
          {isConnecting ? (
            <p className="text-center text-sm text-emerald-200/90">Connecting…</p>
          ) : null}
          <button
            type="button"
            onClick={() => void onConnect()}
            disabled={isConnecting}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-4 text-base font-semibold text-white shadow-[0_0_32px_rgba(0,255,163,0.25)] transition hover:from-emerald-500 hover:to-emerald-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isConnecting ? "Connecting…" : "Connect Wallet (Polygon)"}
          </button>
          <p className="text-center text-[11px] text-zinc-500">Polygon Mainnet · chain 137</p>
        </div>
      ) : null}

      {/* Wrong network gate */}
      {isConnected && networkBlocked ? (
        <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-b from-amber-500/15 to-zinc-900/80 p-5 text-center shadow-[0_0_24px_rgba(245,158,11,0.12)]">
          <p className="text-sm font-semibold text-amber-100">Wrong network</p>
          <p className="mt-1 text-xs text-amber-200/80">Switch to Polygon Mainnet to use your wallet.</p>
          <button
            type="button"
            onClick={() => void switchToPolygon()}
            className="mt-4 w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-zinc-950 shadow-lg transition hover:bg-amber-400"
          >
            Switch to Polygon
          </button>
        </div>
      ) : null}

      {/* Dashboard — only when connected + Polygon */}
      {isConnected && isPolygon ? (
        <>
          {/* SECTION A — Total balance */}
          <div className="rounded-3xl border border-emerald-500/20 bg-gradient-to-b from-zinc-900/95 to-zinc-950 px-6 py-9 text-center shadow-[0_0_48px_rgba(0,255,163,0.06)]">
            {balLoading ? (
              <p className="text-sm text-emerald-200/80">Fetching balance…</p>
            ) : (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Total balance</p>
                <p className="mt-3 text-4xl font-bold tabular-nums tracking-tight text-white sm:text-5xl">
                  <span className="text-emerald-400/90">$</span>
                  {totalBalanceDisplay}
                </p>
              </>
            )}
          </div>

          {/* SECTION B — Wallet card */}
          <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/40 p-5 shadow-inner">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Wallet</p>
                <p className="mt-1 truncate font-mono text-sm text-zinc-200">
                  {depositAddress ? shortenAddress(depositAddress) : "—"}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest text-emerald-300">
                ON-CHAIN
              </span>
            </div>
            <div className="mt-6 border-t border-zinc-800/80 pt-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400/90">LAMBOR BALANCE</p>
              <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-emerald-300 sm:text-[2rem]">
                {balLoading ? "…" : formatToken(freeBetsWei, BET_TOKEN.decimals, BET_TOKEN.symbol)}
              </p>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-zinc-800/80 pt-6 text-[10px]">
              <div>
                <p className="font-medium uppercase tracking-wide text-zinc-500">Wallet balance</p>
                <p className="mt-1 tabular-nums text-sm text-zinc-400">
                  {balLoading ? "…" : formatToken(walletTokenWei, BET_TOKEN.decimals, BET_TOKEN.symbol)}
                </p>
              </div>
              <div>
                <p className="font-medium uppercase tracking-wide text-zinc-500">Fee pool</p>
                <p className="mt-1 tabular-nums text-sm text-zinc-400">
                  {balLoading ? "…" : formatToken(feeWei, BET_TOKEN.decimals, BET_TOKEN.symbol)}
                </p>
              </div>
            </div>
          </div>

          {/* Claim row */}
          {depositAddress && claimIds.length > 0 ? (
            <button
              type="button"
              disabled={busy || !signer || actionsDisabled}
              onClick={() => void onClaimPayouts()}
              className="w-full rounded-2xl border border-emerald-400/30 bg-emerald-500/10 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending === "claim" ? "Processing transaction…" : `Claim winnings (${claimIds.length})`}
            </button>
          ) : null}

          {/* SECTION C — Deposit / Withdraw */}
          <div className="overflow-hidden rounded-2xl border border-zinc-700/50 bg-zinc-900/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="grid grid-cols-2 gap-0 p-1.5">
              <button
                type="button"
                onClick={() => setWalletMode("deposit")}
                className={`relative rounded-xl py-3 text-sm font-semibold transition ${
                  walletMode === "deposit"
                    ? "bg-zinc-800 text-emerald-200 shadow-[0_0_20px_rgba(0,255,163,0.12)]"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Deposit
                {walletMode === "deposit" ? (
                  <motion.span
                    layoutId="walletTab"
                    className="absolute inset-0 -z-10 rounded-xl border border-emerald-500/20 bg-emerald-500/5"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setWalletMode("withdraw")}
                className={`relative rounded-xl py-3 text-sm font-semibold transition ${
                  walletMode === "withdraw"
                    ? "bg-zinc-800 text-emerald-200 shadow-[0_0_20px_rgba(0,255,163,0.12)]"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Withdraw
                {walletMode === "withdraw" ? (
                  <motion.span
                    layoutId="walletTab"
                    className="absolute inset-0 -z-10 rounded-xl border border-emerald-500/20 bg-emerald-500/5"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                ) : null}
              </button>
            </div>

            <AnimatePresence mode="wait">
              {walletMode === "deposit" ? (
                <motion.div
                  key="dep"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 6 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-4 border-t border-zinc-800/80 p-5"
                >
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    Amount
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="0.00"
                      disabled={actionsDisabled}
                      className="mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-zinc-100 outline-none ring-emerald-500/20 focus:ring-2 disabled:opacity-50"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={actionsDisabled || !signer || Number.parseFloat(depositAmount) <= 0}
                    onClick={() => void onDepositToPaymaster()}
                    className="w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(0,255,163,0.2)] transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {pending === "deposit" ? "Processing transaction…" : "Deposit"}
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="wdr"
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-4 border-t border-zinc-800/80 p-5"
                >
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    Free bet amount
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={withdrawFree}
                      onChange={(e) => setWithdrawFree(e.target.value)}
                      placeholder="0"
                      disabled={actionsDisabled}
                      className="mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500/25 disabled:opacity-50"
                    />
                  </label>
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                    Fee amount
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={withdrawFee}
                      onChange={(e) => setWithdrawFee(e.target.value)}
                      placeholder="0"
                      disabled={actionsDisabled}
                      className="mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500/25 disabled:opacity-50"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={
                      actionsDisabled ||
                      !signer ||
                      (Number.parseFloat(withdrawFree) <= 0 && Number.parseFloat(withdrawFee || "0") <= 0)
                    }
                    onClick={() => void onWithdrawFromPaymaster()}
                    className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-3.5 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {pending === "withdraw" ? "Processing transaction…" : "Withdraw"}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* SECTION D — Pending settlement */}
          <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/30 p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Awaiting settlement</p>
              {ordersLoading ? (
                <span className="text-[10px] text-zinc-500">Loading…</span>
              ) : null}
            </div>
            {pendingSettlement.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No open bets waiting for settlement.</p>
            ) : (
              <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                {pendingSettlement.map((order) => {
                  const title = formatAzuroBetTitle(order);
                  const potential = order.amount * order.odds;
                  return (
                    <li
                      key={order.id}
                      className="rounded-xl border border-zinc-800/90 bg-black/25 px-3 py-2.5 text-xs"
                    >
                      <p className="font-medium text-zinc-200">{title}</p>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-zinc-500">
                        <span>Stake {order.amount.toFixed(2)}</span>
                        <span>Odds {order.odds.toFixed(2)}</span>
                        <span className="text-emerald-400/90">~{potential.toFixed(2)} if win</span>
                      </div>
                      <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-200/90">
                        Awaiting settlement
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={() => disconnectWallet()}
            className="w-full rounded-xl border border-zinc-700 py-3 text-sm font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
          >
            Disconnect wallet
          </button>
        </>
      ) : null}

      {connectError ? <p className="text-center text-xs text-red-400">{connectError.message}</p> : null}
      {localError ? <p className="text-center text-xs text-red-400">{localError}</p> : null}
      {pmError ? <p className="text-center text-xs text-red-400">{pmError.message}</p> : null}
    </div>
  );
}
