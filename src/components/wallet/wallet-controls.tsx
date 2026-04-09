"use client";

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";

import { targetChain } from "@/config/chain";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletControls() {
  const { address, isConnected, isConnecting } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const wrongNetwork = isConnected && chainId !== targetChain.id;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {connectError ? (
        <p className="max-w-xs text-xs text-red-400" role="alert">
          {connectError.message}
        </p>
      ) : null}

      {isConnected && address ? (
        <>
          <span className="rounded-md bg-zinc-800 px-3 py-1.5 font-mono text-sm text-zinc-200">
            {shortenAddress(address)}
          </span>
          {wrongNetwork ? (
            <button
              type="button"
              onClick={() => switchChain?.({ chainId: targetChain.id })}
              disabled={isSwitching || !switchChain}
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
            >
              {isSwitching ? "Switching…" : `Switch to ${targetChain.name}`}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => disconnect()}
            className="rounded-md border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            Disconnect
          </button>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              type="button"
              onClick={() => connect({ connector, chainId: targetChain.id })}
              disabled={isPending || isConnecting}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending || isConnecting ? "Connecting…" : `Connect ${connector.name}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
