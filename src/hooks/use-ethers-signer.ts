"use client";

import { BrowserProvider, type JsonRpcSigner } from "ethers";
import { useEffect, useState } from "react";
import { useAccount, useChainId } from "wagmi";

import { AZURO_CHAIN_ID } from "@/config/chain";

/** MetaMask signer via ethers v6 `BrowserProvider` — Polygon only in UI. */
export function useEthersSigner(): JsonRpcSigner | null {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !isConnected || !address || chainId !== AZURO_CHAIN_ID) {
      setSigner(null);
      return;
    }
    const eth = (window as unknown as { ethereum?: import("ethers").Eip1193Provider }).ethereum;
    if (!eth) {
      setSigner(null);
      return;
    }
    let cancelled = false;
    const bp = new BrowserProvider(eth);
    bp.getSigner()
      .then((s) => {
        if (!cancelled) setSigner(s);
      })
      .catch(() => {
        if (!cancelled) setSigner(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address, chainId, isConnected]);

  return signer;
}
