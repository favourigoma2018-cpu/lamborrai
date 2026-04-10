"use client";

import { BrowserProvider } from "ethers";
import { formatUnits } from "ethers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useChainId } from "wagmi";

import { BET_TOKEN } from "@/config/azuro-polygon-contracts";
import { AZURO_CHAIN_ID } from "@/config/chain";
import { readErc20Balance, readPaymasterBalances } from "@/lib/azuro/paymaster-ethers";
import { getMetaMaskProvider } from "@/lib/wallet/metamask";
import { PAYMASTER_BALANCE_QUERY_KEY } from "@/lib/queries/keys";

export type PaymasterBalances = {
  walletTokenWei: bigint;
  freeBetsWei: bigint;
  feeWei: bigint;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
};

/** On-chain balances via ethers `BrowserProvider` — shared across components via React Query. */
export function usePaymasterBalances(): PaymasterBalances {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const queryClient = useQueryClient();

  const enabled = Boolean(address && isConnected && chainId === AZURO_CHAIN_ID);

  const q = useQuery({
    queryKey: [...PAYMASTER_BALANCE_QUERY_KEY, address, chainId],
    queryFn: async () => {
      if (typeof window === "undefined") throw new Error("SSR");
      const raw =
        getMetaMaskProvider() ??
        (window as unknown as { ethereum?: import("ethers").Eip1193Provider }).ethereum;
      if (!raw || typeof raw.request !== "function" || !address) throw new Error("No provider");
      const eth = raw as import("ethers").Eip1193Provider;
      const provider = new BrowserProvider(eth);
      const [wallet, pm] = await Promise.all([
        readErc20Balance(provider, BET_TOKEN.address, address),
        readPaymasterBalances(provider, address),
      ]);
      return { wallet, ...pm };
    },
    enabled,
    staleTime: 15_000,
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: PAYMASTER_BALANCE_QUERY_KEY });

  return {
    walletTokenWei: q.data?.wallet ?? BigInt(0),
    freeBetsWei: q.data?.freeBetsWei ?? BigInt(0),
    feeWei: q.data?.feeWei ?? BigInt(0),
    loading: q.isLoading || q.isFetching,
    error: q.error instanceof Error ? q.error : null,
    refetch,
  };
}

/** Human-readable Azuro free-bet balance (for display helpers). */
export function useAzuroStakeableAmount(): { stakeable: number; decimals: number; symbol: string; loading: boolean } {
  const { freeBetsWei, loading } = usePaymasterBalances();
  const decimals = BET_TOKEN.decimals;
  const symbol = BET_TOKEN.symbol;
  const stakeable = Number.parseFloat(formatUnits(freeBetsWei, decimals));
  return { stakeable: Number.isFinite(stakeable) ? stakeable : 0, decimals, symbol, loading };
}
