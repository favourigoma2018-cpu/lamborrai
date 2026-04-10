"use client";

import { chainsData, coreAbi } from "@azuro-org/toolkit";
import { useAccount, useWatchContractEvent } from "wagmi";

import { AZURO_CHAIN_ID } from "@/config/chain";

import { useInvalidateAzuroBets } from "./use-azuro-bets";

function coreAddress(): `0x${string}` | undefined {
  const c = chainsData[AZURO_CHAIN_ID]?.contracts?.core;
  if (!c) return undefined;
  if (typeof c === "string") return c as `0x${string}`;
  if (typeof c === "object" && c !== null && "address" in c) {
    return (c as { address: `0x${string}` }).address;
  }
  return undefined;
}

/** Refetch Azuro orders when Core emits `NewLiveBet` for this wallet. */
export function useAzuroNewBetListener() {
  const { address } = useAccount();
  const invalidate = useInvalidateAzuroBets();
  const addr = coreAddress();

  useWatchContractEvent({
    address: addr,
    abi: coreAbi,
    chainId: AZURO_CHAIN_ID,
    eventName: "NewLiveBet",
    args: address ? { bettor: address } : undefined,
    enabled: Boolean(addr && address),
    onLogs: () => {
      void invalidate();
    },
  });
}
