"use client";

import { chainsData } from "@azuro-org/toolkit";
import { useMemo } from "react";
import { formatUnits } from "viem";
import { useAccount, useBalance, useConnect, useDisconnect, useReadContract } from "wagmi";

import { AZURO_CHAIN_ID } from "@/config/chain";

const erc20Abi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function LamborWalletLayer() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();

  const betToken = chainsData[AZURO_CHAIN_ID]?.betToken;

  const { data: nativeBal, isLoading: loadingNative } = useBalance({
    address,
    chainId: AZURO_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  const tokenAddress = betToken?.address;
  const { data: tokenBal, isLoading: loadingToken } = useReadContract({
    address: tokenAddress as `0x${string}` | undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address && tokenAddress ? [address] : undefined,
    chainId: AZURO_CHAIN_ID,
    query: {
      enabled: Boolean(
        address && tokenAddress && typeof tokenAddress === "string" && tokenAddress.startsWith("0x"),
      ),
    },
  });

  const displayToken = useMemo(() => {
    if (tokenBal == null || betToken == null) return "—";
    return `${formatUnits(tokenBal, betToken.decimals)} ${betToken.symbol}`;
  }, [betToken, tokenBal]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-500/35 bg-zinc-900/60 p-4 shadow-[0_0_28px_rgba(0,255,163,0.14)]">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Wallet (Polygon)</p>
        <p className="mt-2 text-sm text-zinc-500">
          Real balances only — no custodial ledger. Azuro uses the bet token below on Polygon mainnet.
        </p>
      </div>

      {!isConnected ? (
        <div className="flex flex-wrap gap-2">
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              type="button"
              onClick={() => connect({ connector, chainId: AZURO_CHAIN_ID })}
              disabled={isConnecting}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
            >
              {isConnecting ? "Connecting…" : `Connect ${connector.name}`}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-zinc-700/70 bg-zinc-900/55 p-4">
          <p className="font-mono text-sm text-emerald-300">{address ? shortenAddress(address) : "-"}</p>
          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex justify-between border-b border-zinc-800 pb-2">
              <span className="text-zinc-500">MATIC</span>
              <span className="font-semibold text-zinc-100">
                {loadingNative ? "…" : `${nativeBal?.formatted ?? "0"} ${nativeBal?.symbol ?? ""}`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Bet token (Azuro)</span>
              <span className="font-semibold text-zinc-100">{loadingToken ? "…" : displayToken}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => disconnect()}
            className="rounded-xl border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800/70"
          >
            Disconnect
          </button>
        </div>
      )}

      {connectError ? <p className="text-xs text-red-300">{connectError.message}</p> : null}
    </div>
  );
}
