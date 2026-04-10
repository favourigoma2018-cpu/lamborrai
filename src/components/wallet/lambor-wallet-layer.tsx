"use client";

import { useEffect, useMemo, useState } from "react";
import { isAddress, parseEther } from "viem";
import { useAccount, useBalance, useConnect, useDisconnect, useSendTransaction } from "wagmi";

import { readPlacedBets } from "@/lib/bets/local-bets";
import { POLYGON_CHAIN_HEX, POLYGON_CHAIN_ID, POLYGON_CHAIN_PARAMS } from "@/lib/wallet/polygon";
import type { PlacedBetRecord } from "@/types/bets";

type WalletMode = "connected" | "manual";
type WalletActionTab = "deposit" | "withdraw";
type TxStatus = "idle" | "pending" | "completed" | "failed";

type WalletSummary = {
  address: string;
  network: "polygon";
  balance: { raw: string; formatted: string; symbol: "MATIC" };
  betHistory: Array<{
    id: string;
    match: string;
    market: string;
    stake: string;
    odds: string;
    status: "pending" | "won" | "lost";
    createdAt: string;
  }>;
};

const STORAGE_MANUAL_ADDRESS = "lambor.wallet.manualAddress.v1";
const STORAGE_WITHDRAW_ADDRESS = "lambor.wallet.withdrawAddress.v1";
const STORAGE_USE_PRIMARY_WITHDRAW = "lambor.wallet.usePrimaryWithdraw.v1";

const platformDepositAddress =
  process.env.NEXT_PUBLIC_PLATFORM_DEPOSIT_ADDRESS || "0x000000000000000000000000000000000000dEaD";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function txBadge(status: TxStatus) {
  if (status === "pending") return "border border-amber-500/40 bg-amber-500/10 text-amber-200";
  if (status === "completed") return "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (status === "failed") return "border border-red-500/40 bg-red-500/10 text-red-300";
  return "border border-zinc-600 bg-zinc-800/80 text-zinc-300";
}

async function ensurePolygonNetwork() {
  const eth = (window as Window & { ethereum?: { request: (payload: { method: string; params?: unknown[] }) => Promise<unknown> } })
    .ethereum;
  if (!eth) throw new Error("No wallet provider found. Install MetaMask or WalletConnect.");

  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: POLYGON_CHAIN_HEX }],
    });
  } catch {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [POLYGON_CHAIN_PARAMS],
    });
  }
}

export function LamborWalletLayer() {
  const { address: connectedAddress, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending: isConnecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { sendTransactionAsync } = useSendTransaction();

  const [walletMode, setWalletMode] = useState<WalletMode>("connected");
  const [manualInput, setManualInput] = useState("");
  const [manualAddress, setManualAddress] = useState<string | null>(null);
  const [manualSummary, setManualSummary] = useState<WalletSummary | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [tab, setTab] = useState<WalletActionTab>("deposit");

  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [usePrimaryForWithdraw, setUsePrimaryForWithdraw] = useState(true);
  const [isEditingWithdrawAddress, setIsEditingWithdrawAddress] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txMessage, setTxMessage] = useState<string | null>(null);
  const [showConfirmWithdraw, setShowConfirmWithdraw] = useState(false);
  const [placedBets, setPlacedBets] = useState<PlacedBetRecord[]>([]);

  const primaryWalletAddress = connectedAddress ?? null;
  const activeAddress = walletMode === "connected" ? primaryWalletAddress : manualAddress;
  const connectedOnPolygon = isConnected && chainId === POLYGON_CHAIN_ID;
  const effectiveWithdrawAddress =
    usePrimaryForWithdraw || !withdrawAddress
      ? primaryWalletAddress
      : isAddress(withdrawAddress)
        ? withdrawAddress
        : null;

  const { data: connectedBalance } = useBalance({
    address: connectedAddress,
    chainId: POLYGON_CHAIN_ID,
    query: { enabled: Boolean(isConnected && connectedAddress && chainId === POLYGON_CHAIN_ID) },
  });

  const displayBalance = useMemo(() => {
    if (walletMode === "manual") {
      if (!manualSummary) return "-";
      return `${manualSummary.balance.formatted} ${manualSummary.balance.symbol}`;
    }
    if (!connectedBalance) return "-";
    return `${Number(connectedBalance.formatted).toFixed(6)} ${connectedBalance.symbol}`;
  }, [connectedBalance, manualSummary, walletMode]);

  const baseBalance = useMemo(() => {
    if (walletMode === "manual") {
      return Number.parseFloat(manualSummary?.balance.formatted ?? "0") || 0;
    }
    return Number.parseFloat(connectedBalance?.formatted ?? "0") || 0;
  }, [connectedBalance?.formatted, manualSummary?.balance.formatted, walletMode]);

  const inBetsBalance = useMemo(
    () =>
      placedBets
        .filter((b) => b.status === "pending")
        .reduce((sum, b) => sum + (Number.parseFloat(b.amount) || 0), 0),
    [placedBets],
  );
  const pendingBalance = useMemo(
    () =>
      placedBets
        .filter((b) => b.status === "pending")
        .reduce((sum, b) => {
          const potential = Number.parseFloat(b.potentialPayout) || 0;
          const stake = Number.parseFloat(b.amount) || 0;
          return sum + Math.max(0, potential - stake);
        }, 0),
    [placedBets],
  );
  const availableBalance = Math.max(0, baseBalance - inBetsBalance);
  const totalBalance = availableBalance + inBetsBalance + pendingBalance;

  useEffect(() => {
    const savedManual = window.localStorage.getItem(STORAGE_MANUAL_ADDRESS);
    const savedWithdraw = window.localStorage.getItem(STORAGE_WITHDRAW_ADDRESS);
    const savedUsePrimary = window.localStorage.getItem(STORAGE_USE_PRIMARY_WITHDRAW);
    if (savedManual && isAddress(savedManual)) {
      setManualInput(savedManual);
      setManualAddress(savedManual);
      setWalletMode("manual");
      void loadManualSummary(savedManual);
    }
    if (savedWithdraw && isAddress(savedWithdraw)) {
      setWithdrawAddress(savedWithdraw);
    }
    if (savedUsePrimary === "false") {
      setUsePrimaryForWithdraw(false);
    }
    setPlacedBets(readPlacedBets());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setPlacedBets(readPlacedBets()), 4000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (walletMode === "connected" && isConnected && chainId !== POLYGON_CHAIN_ID) {
      void ensurePolygonNetwork().catch((err) => {
        setWalletError(err instanceof Error ? err.message : "Failed to switch to Polygon.");
      });
    }
  }, [chainId, isConnected, walletMode]);

  async function loadManualSummary(addr: string) {
    const res = await fetch(`/api/wallet/summary?address=${encodeURIComponent(addr)}`, { cache: "no-store" });
    const payload = (await res.json()) as WalletSummary | { error?: string };
    if (!res.ok) throw new Error("error" in payload ? payload.error || "Failed to load wallet." : "Failed to load wallet.");
    setManualSummary(payload as WalletSummary);
  }

  async function onLoadManualWallet() {
    const addr = manualInput.trim();
    if (!isAddress(addr)) {
      setWalletError("Enter a valid Polygon address (0x...).");
      return;
    }
    setWalletError(null);
    setWalletMode("manual");
    setManualAddress(addr);
    window.localStorage.setItem(STORAGE_MANUAL_ADDRESS, addr);
    try {
      await loadManualSummary(addr);
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : "Failed to fetch manual wallet data.");
    }
  }

  function onSaveWithdrawalAddress() {
    if (usePrimaryForWithdraw) {
      window.localStorage.setItem(STORAGE_USE_PRIMARY_WITHDRAW, "true");
      setIsEditingWithdrawAddress(false);
      setWalletError(null);
      return;
    }
    const addr = withdrawAddress.trim();
    if (!isAddress(addr)) {
      setWalletError("Withdrawal address must be a valid Polygon address.");
      return;
    }
    window.localStorage.setItem(STORAGE_WITHDRAW_ADDRESS, addr);
    window.localStorage.setItem(STORAGE_USE_PRIMARY_WITHDRAW, "false");
    setWalletError(null);
    setIsEditingWithdrawAddress(false);
  }

  function onResetWithdrawalToPrimary() {
    setUsePrimaryForWithdraw(true);
    window.localStorage.setItem(STORAGE_USE_PRIMARY_WITHDRAW, "true");
    setIsEditingWithdrawAddress(false);
  }

  async function onConnectedDeposit() {
    if (!connectedAddress) return;
    if (!connectedOnPolygon) {
      await ensurePolygonNetwork();
    }
    const amountNum = Number.parseFloat(depositAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setWalletError("Enter a valid deposit amount.");
      return;
    }
    setTxStatus("pending");
    setTxMessage("Deposit transaction pending...");
    try {
      const hash = await sendTransactionAsync({
        to: platformDepositAddress as `0x${string}`,
        value: parseEther(depositAmount),
      });
      setTxStatus("completed");
      setTxMessage(`Deposit confirmed: ${hash.slice(0, 10)}...`);
    } catch (err) {
      setTxStatus("failed");
      setTxMessage(err instanceof Error ? err.message : "Deposit failed.");
    }
  }

  async function onConnectedWithdraw() {
    if (!connectedAddress) return;
    const destination = effectiveWithdrawAddress;
    if (!destination || !isAddress(destination)) {
      setWalletError("Set a valid withdrawal destination first.");
      return;
    }
    const amountNum = Number.parseFloat(withdrawAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setWalletError("Enter a valid withdraw amount.");
      return;
    }
    if (!usePrimaryForWithdraw) {
      window.localStorage.setItem(STORAGE_WITHDRAW_ADDRESS, destination);
      window.localStorage.setItem(STORAGE_USE_PRIMARY_WITHDRAW, "false");
    }
    setTxStatus("pending");
    setTxMessage("Withdraw transaction pending...");
    try {
      const hash = await sendTransactionAsync({
        to: destination as `0x${string}`,
        value: parseEther(withdrawAmount),
      });
      setTxStatus("completed");
      setTxMessage(`Withdraw completed: ${hash.slice(0, 10)}...`);
    } catch (err) {
      setTxStatus("failed");
      setTxMessage(err instanceof Error ? err.message : "Withdraw failed.");
    }
  }

  async function onManualWithdraw() {
    if (!manualAddress) return;
    const destination = effectiveWithdrawAddress;
    if (!destination || !isAddress(destination)) {
      setWalletError("Set a valid withdrawal destination first.");
      return;
    }
    const amountNum = Number.parseFloat(withdrawAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setWalletError("Enter a valid withdraw amount.");
      return;
    }
    if (!usePrimaryForWithdraw) {
      window.localStorage.setItem(STORAGE_WITHDRAW_ADDRESS, destination);
      window.localStorage.setItem(STORAGE_USE_PRIMARY_WITHDRAW, "false");
    }
    setTxStatus("pending");
    setTxMessage("Manual withdrawal request submitted...");
    try {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: manualAddress,
          withdrawAddress: destination,
          amount: withdrawAmount,
        }),
      });
      const payload = (await res.json()) as { status?: string; id?: string; error?: string };
      if (!res.ok) throw new Error(payload.error || "Withdrawal request failed.");
      setTxStatus(payload.status === "pending" ? "pending" : "completed");
      setTxMessage(payload.status === "pending" ? `Withdrawal pending (${payload.id ?? "queued"}).` : "Withdrawal completed.");
    } catch (err) {
      setTxStatus("failed");
      setTxMessage(err instanceof Error ? err.message : "Withdrawal failed.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-500/35 bg-zinc-900/60 p-4 shadow-[0_0_28px_rgba(0,255,163,0.14)]">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Total Balance</p>
        <p className="mt-1 text-3xl font-semibold text-emerald-300">${totalBalance.toFixed(2)}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 px-2.5 py-2">
            <p className="text-zinc-500">Available</p>
            <p className="mt-1 font-semibold text-zinc-200">${availableBalance.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 px-2.5 py-2">
            <p className="text-zinc-500">In Bets</p>
            <p className="mt-1 font-semibold text-zinc-200">${inBetsBalance.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 px-2.5 py-2">
            <p className="text-zinc-500">Pending</p>
            <p className="mt-1 font-semibold text-zinc-200">${pendingBalance.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/55 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Primary Wallet (Connected)</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setWalletMode("connected")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${walletMode === "connected" ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border border-zinc-600 text-zinc-300"}`}
          >
            Connected Wallet
          </button>
          <button
            type="button"
            onClick={() => setWalletMode("manual")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${walletMode === "manual" ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border border-zinc-600 text-zinc-300"}`}
          >
            Manual Address
          </button>
        </div>

        {walletMode === "connected" ? (
          <div className="mt-3 space-y-2">
            {!isConnected ? (
              <div className="flex flex-wrap gap-2">
                {connectors.map((connector) => (
                  <button
                    key={connector.uid}
                    type="button"
                    onClick={() => connect({ connector })}
                    disabled={isConnecting}
                    className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
                  >
                    {isConnecting ? "Connecting..." : `Connect ${connector.name}`}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-zinc-800 px-2.5 py-1 text-xs font-mono text-zinc-200">
                  {primaryWalletAddress ? shortenAddress(primaryWalletAddress) : "-"}
                </span>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${connectedOnPolygon ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border border-amber-500/40 bg-amber-500/10 text-amber-200"}`}>
                  {connectedOnPolygon ? "Polygon" : "Wrong network"}
                </span>
                <button
                  type="button"
                  onClick={() => disconnect()}
                  className="rounded-md border border-zinc-600 px-2.5 py-1 text-xs text-zinc-300"
                >
                  Disconnect
                </button>
              </div>
            )}
            {connectError ? <p className="text-xs text-red-300">{connectError.message}</p> : null}
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Paste Polygon Wallet Address"
              className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 text-sm text-zinc-100 outline-none focus:border-emerald-400"
            />
            <button
              type="button"
              onClick={onLoadManualWallet}
              className="rounded-xl border border-emerald-500/45 bg-emerald-500/10 px-3 text-sm font-semibold text-emerald-300"
            >
              Load Wallet
            </button>
          </div>
        )}
        <p className="mt-2 text-xs text-zinc-500">
          Active wallet: {activeAddress ? shortenAddress(activeAddress) : "No wallet loaded"} ({displayBalance})
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/55 p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Withdrawal Settings</p>
          <button
            type="button"
            onClick={() => setIsEditingWithdrawAddress((v) => !v)}
            className="rounded-md border border-zinc-600 px-2.5 py-1 text-[11px] text-zinc-300"
          >
            {isEditingWithdrawAddress ? "Close" : "Change Address"}
          </button>
        </div>
        <p className="text-xs text-zinc-500">Current withdrawal address:</p>
        <p className="mt-1 font-mono text-sm text-emerald-300">
          {effectiveWithdrawAddress ? shortenAddress(effectiveWithdrawAddress) : "Not set"}
        </p>
        {isEditingWithdrawAddress ? (
          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={usePrimaryForWithdraw}
                onChange={(e) => setUsePrimaryForWithdraw(e.target.checked)}
              />
              Use connected primary wallet
            </label>
            {!usePrimaryForWithdraw ? (
              <input
                value={withdrawAddress}
                onChange={(e) => setWithdrawAddress(e.target.value)}
                placeholder="Withdrawal Address"
                className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 text-sm text-zinc-100 outline-none focus:border-emerald-400"
              />
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onSaveWithdrawalAddress}
                className="flex-1 rounded-xl border border-emerald-500/45 bg-emerald-500/10 py-2 text-sm font-semibold text-emerald-300"
              >
                Save Address
              </button>
              <button
                type="button"
                onClick={onResetWithdrawalToPrimary}
                className="flex-1 rounded-xl border border-zinc-600 py-2 text-sm font-medium text-zinc-300"
              >
                Reset to Primary
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/55 p-4">
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("deposit")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold ${tab === "deposit" ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border border-zinc-600 text-zinc-300"}`}
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={() => setTab("withdraw")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold ${tab === "withdraw" ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border border-zinc-600 text-zinc-300"}`}
          >
            Withdraw
          </button>
        </div>

        {tab === "deposit" ? (
          walletMode === "connected" ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-300">Deposit from connected wallet on Polygon.</p>
              <input
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="Amount (MATIC)"
                className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 text-sm text-zinc-100 outline-none focus:border-emerald-400"
              />
              <button
                type="button"
                onClick={() => void onConnectedDeposit()}
                disabled={!isConnected}
                className="w-full rounded-xl border border-emerald-400/60 bg-emerald-500/10 py-2.5 text-sm font-semibold text-emerald-300 shadow-[0_0_18px_rgba(0,255,163,0.2)] disabled:opacity-40"
              >
                Deposit from wallet
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-zinc-300">Send MATIC/USDC to this Polygon address.</p>
              <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-3">
                <p className="break-all font-mono text-xs text-emerald-300">{platformDepositAddress}</p>
              </div>
              <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-4 text-center text-xs text-zinc-500">
                QR placeholder: use wallet scanner with the address above.
              </div>
              <p className="text-[11px] text-zinc-500">Backend will credit your balance after on-chain confirmation.</p>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <input
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="Amount (MATIC)"
              className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 text-sm text-zinc-100 outline-none focus:border-emerald-400"
            />
            <p className="text-xs text-zinc-500">
              Destination: {effectiveWithdrawAddress ? shortenAddress(effectiveWithdrawAddress) : "No destination set"}
            </p>
            <button
              type="button"
              disabled={!activeAddress || !effectiveWithdrawAddress}
              onClick={() => setShowConfirmWithdraw(true)}
              className="w-full rounded-xl border border-zinc-600 py-2.5 text-sm font-semibold text-zinc-200 disabled:opacity-40"
            >
              Withdraw
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/55 p-4">
        <p className="mb-2 text-xs uppercase tracking-[0.18em] text-zinc-400">Bet History (wallet)</p>
        {walletMode === "manual" && manualSummary ? (
          manualSummary.betHistory.length === 0 ? (
            <p className="text-xs text-zinc-500">No indexed bets yet for this address.</p>
          ) : (
            <div className="space-y-2">
              {manualSummary.betHistory.map((item) => (
                <div key={item.id} className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-2.5 text-xs">
                  <p className="text-zinc-200">{item.match}</p>
                  <p className="text-zinc-500">{item.market}</p>
                </div>
              ))}
            </div>
          )
        ) : (
          <p className="text-xs text-zinc-500">Connect or load a manual address to view indexed history.</p>
        )}
      </div>

      <div className={`rounded-xl px-3 py-2 text-xs font-medium ${txBadge(txStatus)}`}>
        <span className="uppercase tracking-[0.14em]">{txStatus}</span>
        <p className="mt-1 normal-case">{txMessage ?? "No transaction yet."}</p>
      </div>

      {walletError ? <p className="text-xs text-red-300">{walletError}</p> : null}

      {showConfirmWithdraw ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-4">
            <p className="text-sm font-semibold text-zinc-100">Confirm withdrawal</p>
            <p className="mt-2 text-xs text-zinc-400">
              Withdraw to {effectiveWithdrawAddress ? shortenAddress(effectiveWithdrawAddress) : "-"}?
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmWithdraw(false)}
                className="flex-1 rounded-xl border border-zinc-600 py-2 text-sm text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmWithdraw(false);
                  if (walletMode === "connected") {
                    void onConnectedWithdraw();
                  } else {
                    void onManualWithdraw();
                  }
                }}
                className="flex-1 rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-2 text-sm font-semibold text-emerald-300"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

