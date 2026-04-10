"use client";

import { getBetsByBettor } from "@azuro-org/toolkit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";

import { AZURO_CHAIN_ID } from "@/config/chain";

export const AZURO_BETS_QUERY_KEY = ["azuro-bets"] as const;

export function useAzuroBets() {
  const { address } = useAccount();

  return useQuery({
    queryKey: [...AZURO_BETS_QUERY_KEY, address],
    queryFn: async () => {
      if (!address) return [];
      const rows = await getBetsByBettor({
        chainId: AZURO_CHAIN_ID,
        bettor: address,
        limit: 100,
      });
      return rows ?? [];
    },
    enabled: Boolean(address),
    refetchInterval: 15_000,
  });
}

export function useInvalidateAzuroBets() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: AZURO_BETS_QUERY_KEY });
}
