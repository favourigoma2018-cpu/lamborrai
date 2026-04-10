"use client";

import { chainsData } from "@azuro-org/toolkit";
import { formatUnits, parseUnits } from "ethers";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useBalance, useChainId, useConnect, useDisconnect, useReadContract, useSwitchChain } from "wagmi";

import { AZURO_CHAIN_ID, targetChain } from "@/config/chain";
import { erc20BalanceAbi } from "@/lib/wallet/erc20-abi";
import { ensurePolygonWallet } from "@/lib/wallet/ensure-polygon";
import { isMetaMaskAvailable } from "@/lib/wallet/metamask";
import { PAYMASTER_BALANCE_QUERY_KEY } from "@/lib/queries/keys";
import { readWithdrawAddress, writeWithdrawAddress } from "@/lib/wallet/withdraw-storage";

export type WalletMode = "deposit" | "withdraw";

export type LamborWalletContextValue = {
  isMetaMaskAvailable: boolean;
  depositAddress: `0x${string}` | undefined;
  withdrawAddress: string;
  setWithdrawAddress: (value: string) => void;
  walletMode: WalletMode;
  setWalletMode: (mode: WalletMode) => void;
  chainId: number | undefined;
  isPolygon: boolean;
  isConnected: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  isConnecting: boolean;
  connectError: Error | null;
  switchToPolygon: () => Promise<void>;
  nativeBalanceWei: bigint | undefined;
  nativeBalanceFormatted: string;
  betTokenAddress: `0x${string}` | undefined;
  betTokenBalanceWei: bigint | undefined;
  betTokenBalanceFormatted: string;
  betTokenSymbol: string;
  betTokenDecimals: number;
  /** Parsed bet token balance for comparisons (Azuro stake token). */
  stakingBalanceNumber: number;
  balanceLoading: boolean;
  refetchBalances: () => Promise<void>;
};

const LamborWalletContext = createContext<LamborWalletContextValue | null>(null);

export function LamborWalletProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { connectAsync, connectors, isPending: isConnecting, error: connectError, reset } = useConnect();
  const { disconnect } = useDisconnect();

  const [walletMode, setWalletMode] = useState<WalletMode>("deposit");
  const [withdrawAddress, setWithdrawAddressState] = useState("");

  useEffect(() => {
    setWithdrawAddressState(readWithdrawAddress());
  }, []);

  const setWithdrawAddress = useCallback((value: string) => {
    const v = value.trim();
    setWithdrawAddressState(v);
    writeWithdrawAddress(v);
  }, []);

  const metaMaskConnector = connectors[0];

  const switchToPolygon = useCallback(async () => {
    await ensurePolygonWallet();
    if (chainId !== targetChain.id && switchChainAsync) {
      await switchChainAsync({ chainId: targetChain.id });
    }
  }, [chainId, switchChainAsync]);

  const connectWallet = useCallback(async () => {
    reset?.();
    if (!isMetaMaskAvailable()) {
      throw new Error("MetaMask is not available. Install MetaMask for Polygon (chain 137) only.");
    }
    if (!metaMaskConnector) {
      throw new Error("MetaMask connector is not configured.");
    }
    await connectAsync({ connector: metaMaskConnector, chainId: AZURO_CHAIN_ID });
    await ensurePolygonWallet();
    if (switchChainAsync) {
      try {
        await switchChainAsync({ chainId: targetChain.id });
      } catch {
        /* user may reject */
      }
    }
    await queryClient.invalidateQueries();
  }, [connectAsync, metaMaskConnector, queryClient, reset, switchChainAsync]);

  const disconnectWallet = useCallback(() => {
    disconnect();
  }, [disconnect]);

  const isPolygon = chainId === targetChain.id;

  const betToken = chainsData[AZURO_CHAIN_ID]?.betToken;
  const betTokenAddress =
    betToken?.address && typeof betToken.address === "string" && betToken.address.startsWith("0x")
      ? (betToken.address as `0x${string}`)
      : undefined;
  const betTokenDecimals = betToken?.decimals ?? 18;
  const betTokenSymbol = betToken?.symbol ?? "BET";

  const {
    data: nativeBal,
    isLoading: loadingNative,
    refetch: refetchNative,
  } = useBalance({
    address,
    chainId: AZURO_CHAIN_ID,
    query: { enabled: Boolean(address && isPolygon) },
  });

  const {
    data: tokenBal,
    isLoading: loadingToken,
    refetch: refetchToken,
  } = useReadContract({
    address: betTokenAddress,
    abi: erc20BalanceAbi,
    functionName: "balanceOf",
    args: address && betTokenAddress ? [address] : undefined,
    chainId: AZURO_CHAIN_ID,
    query: {
      enabled: Boolean(address && betTokenAddress && isPolygon),
    },
  });

  const refetchBalances = useCallback(async () => {
    await Promise.all([
      refetchNative(),
      refetchToken(),
      queryClient.invalidateQueries({ queryKey: PAYMASTER_BALANCE_QUERY_KEY }),
    ]);
  }, [queryClient, refetchNative, refetchToken]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const eth = (window as unknown as { ethereum?: { on?: (e: string, h: () => void) => void; removeListener?: (e: string, h: () => void) => void } })
      .ethereum;
    if (!eth?.on) return;

    const onAccounts = () => {
      void refetchBalances();
    };
    const onChain = () => {
      void ensurePolygonWallet().catch(() => {});
      void refetchBalances();
    };

    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [refetchBalances]);

  const nativeBalanceWei = nativeBal?.value;
  const nativeBalanceFormatted = nativeBal ? `${nativeBal.formatted} ${nativeBal.symbol}` : "—";

  const betTokenBalanceWei = tokenBal as bigint | undefined;
  const betTokenBalanceFormatted = useMemo(() => {
    if (betTokenBalanceWei == null || !betToken) return "—";
    try {
      return `${formatUnits(betTokenBalanceWei, betTokenDecimals)} ${betTokenSymbol}`;
    } catch {
      return "—";
    }
  }, [betToken, betTokenBalanceWei, betTokenDecimals, betTokenSymbol]);

  const stakingBalanceNumber = useMemo(() => {
    if (betTokenBalanceWei == null) return 0;
    try {
      return Number.parseFloat(formatUnits(betTokenBalanceWei, betTokenDecimals));
    } catch {
      return 0;
    }
  }, [betTokenBalanceWei, betTokenDecimals]);

  const balanceLoading = loadingNative || loadingToken;

  const value = useMemo<LamborWalletContextValue>(
    () => ({
      isMetaMaskAvailable: isMetaMaskAvailable(),
      depositAddress: address,
      withdrawAddress,
      setWithdrawAddress,
      walletMode,
      setWalletMode,
      chainId,
      isPolygon,
      isConnected,
      connectWallet,
      disconnectWallet,
      isConnecting,
      connectError: connectError ?? null,
      switchToPolygon,
      nativeBalanceWei,
      nativeBalanceFormatted,
      betTokenAddress,
      betTokenBalanceWei,
      betTokenBalanceFormatted,
      betTokenSymbol,
      betTokenDecimals,
      stakingBalanceNumber,
      balanceLoading,
      refetchBalances,
    }),
    [
      address,
      withdrawAddress,
      setWithdrawAddress,
      walletMode,
      chainId,
      isPolygon,
      isConnected,
      connectWallet,
      disconnectWallet,
      isConnecting,
      connectError,
      switchToPolygon,
      nativeBalanceWei,
      nativeBalanceFormatted,
      betTokenAddress,
      betTokenBalanceWei,
      betTokenBalanceFormatted,
      betTokenSymbol,
      betTokenDecimals,
      stakingBalanceNumber,
      balanceLoading,
      refetchBalances,
    ],
  );

  return <LamborWalletContext.Provider value={value}>{children}</LamborWalletContext.Provider>;
}

export function useLamborWallet() {
  const ctx = useContext(LamborWalletContext);
  if (!ctx) {
    throw new Error("useLamborWallet must be used within LamborWalletProvider");
  }
  return ctx;
}

/** Optional: use in components that may render outside the provider (e.g. tests). */
export function useLamborWalletOptional(): LamborWalletContextValue | null {
  return useContext(LamborWalletContext);
}

export function parseStakeToWei(humanAmount: string, decimals: number): bigint {
  const n = Number.parseFloat(humanAmount);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid amount");
  const s = n.toFixed(Math.min(decimals, 8));
  return parseUnits(s, decimals);
}
