"use client";

import { useLamborWallet } from "@/contexts/lambor-wallet-context";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletControls() {
  const {
    isMetaMaskAvailable,
    isConnected,
    depositAddress,
    isPolygon,
    connectWallet,
    disconnectWallet,
    isConnecting,
    connectError,
    switchToPolygon,
    betTokenBalanceFormatted,
    balanceLoading,
  } = useLamborWallet();

  async function onConnect() {
    try {
      await connectWallet();
    } catch {
      /* surfaced via connectError */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      {connectError ? (
        <p className="max-w-xs text-xs text-red-400" role="alert">
          {connectError.message}
        </p>
      ) : null}

      {!isMetaMaskAvailable ? (
        <span className="text-xs text-amber-400">MetaMask required</span>
      ) : isConnected && depositAddress ? (
        <>
          <span className="max-w-[10rem] truncate rounded-md bg-zinc-800 px-2 py-1.5 font-mono text-xs text-zinc-200 sm:max-w-none sm:px-3 sm:text-sm">
            {shortenAddress(depositAddress)}
          </span>
          {!isPolygon ? (
            <button
              type="button"
              onClick={() => void switchToPolygon()}
              className="rounded-md bg-amber-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-amber-500 sm:text-sm"
            >
              Polygon only
            </button>
          ) : (
            <span className="hidden text-xs text-zinc-500 sm:inline">
              {balanceLoading ? "…" : betTokenBalanceFormatted}
            </span>
          )}
          <button
            type="button"
            onClick={() => disconnectWallet()}
            className="rounded-md border border-zinc-600 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 sm:text-sm"
          >
            Disconnect
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => void onConnect()}
          disabled={isConnecting}
          className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
        >
          {isConnecting ? "…" : "MetaMask"}
        </button>
      )}
    </div>
  );
}
