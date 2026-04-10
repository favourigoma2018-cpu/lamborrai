import { createBet, createComboBet } from "@azuro-org/toolkit";
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

/** Submit signed ordinary bet to Azuro relayer API (on-chain settlement via protocol). */
export function submitOrdinaryBetOrder(args: {
  account: Address;
  signature: Hex;
  conditionId: string;
  outcomeId: string;
  minOdds: string;
  amount: string;
  nonce: string;
  coreAddress: Address;
  relayerFeeAmount: string;
}) {
  return createBet({
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

/** Submit signed combo (parlay) bet to Azuro relayer API. */
export function submitComboBetOrder(args: {
  account: Address;
  signature: Hex;
  bets: { conditionId: string; outcomeId: string }[];
  minOdds: string;
  amount: string;
  nonce: string;
  coreAddress: Address;
  relayerFeeAmount: string;
}) {
  return createComboBet({
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
