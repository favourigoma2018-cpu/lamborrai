import type { CreateBetResult } from "@azuro-org/toolkit";
import type { Address, Hex } from "viem";

import { AZURO_CHAIN_ID } from "@/config/chain";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

function clientData(core: Address, relayerFeeAmount: string) {
  return {
    attention: "Lambor",
    affiliate: ZERO,
    core,
    expiresAt: Math.floor(Date.now() / 1000) + 60 * 10,
    chainId: AZURO_CHAIN_ID,
    relayerFeeAmount,
    isBetSponsored: false,
    isFeeSponsored: false,
    isSponsoredBetReturnable: false,
  } as const;
}

async function postPlaceBet(body: unknown): Promise<CreateBetResult> {
  const res = await fetch("/api/azuro/place-bet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as CreateBetResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Bet relay failed (${res.status}).`);
  }
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
}

/** Submit signed ordinary bet via Lambor API relay → Azuro relayer → Core. */
export async function submitOrdinaryBetOrder(args: {
  account: Address;
  signature: Hex;
  conditionId: string;
  outcomeId: string;
  minOdds: string;
  amount: string;
  nonce: string;
  coreAddress: Address;
  relayerFeeAmount: string;
}): Promise<CreateBetResult> {
  return postPlaceBet({
    account: args.account,
    signature: args.signature,
    bet: {
      conditionId: args.conditionId,
      outcomeId: args.outcomeId,
      minOdds: args.minOdds,
      amount: args.amount,
      nonce: args.nonce,
    },
    clientData: clientData(args.coreAddress, args.relayerFeeAmount),
  });
}

/** Submit signed combo (parlay) bet via Lambor API relay → Azuro. */
export async function submitComboBetOrder(args: {
  account: Address;
  signature: Hex;
  bets: { conditionId: string; outcomeId: string }[];
  minOdds: string;
  amount: string;
  nonce: string;
  coreAddress: Address;
  relayerFeeAmount: string;
}): Promise<CreateBetResult> {
  return postPlaceBet({
    account: args.account,
    signature: args.signature,
    bets: args.bets.map((b) => ({
      conditionId: b.conditionId,
      outcomeId: b.outcomeId,
    })),
    amount: args.amount,
    minOdds: args.minOdds,
    nonce: args.nonce,
    clientData: clientData(args.coreAddress, args.relayerFeeAmount),
  });
}
