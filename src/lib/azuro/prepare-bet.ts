import { calcMinOdds, getBetCalculation, getBetFee, getBetTypedData } from "@azuro-org/toolkit";
import type { Address } from "viem";

import { AZURO_CHAIN_ID } from "@/config/chain";

import { parseBetTokenAmountRaw } from "./bet-amount";
import { azuroOrderNonce } from "./order-nonce";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export type SlipSelection = {
  conditionId: string;
  outcomeId: string;
  odds: string;
};

export type PreparedBetInteraction = {
  calculation: Awaited<ReturnType<typeof getBetCalculation>>;
  fee: Awaited<ReturnType<typeof getBetFee>>;
  typedData: ReturnType<typeof getBetTypedData>;
  submitPayload: {
    conditionId: string;
    outcomeId: string;
    minOdds: string;
    amount: string;
    nonce: string;
  };
};

type PrepareBetInteractionArgs = {
  account: Address;
  selection: SlipSelection;
  amount: string;
  coreAddress: Address;
};

/**
 * Builds EIP-712 typed data + raw fields for `createBet` (Azuro relayer → Core contract).
 */
export async function prepareBetInteraction({
  account,
  selection,
  amount,
  coreAddress,
}: PrepareBetInteractionArgs): Promise<PreparedBetInteraction> {
  const oddsNum = Number.parseFloat(selection.odds);
  if (!Number.isFinite(oddsNum) || oddsNum <= 0) {
    throw new Error("Invalid selection odds.");
  }

  const [calculation, fee] = await Promise.all([
    getBetCalculation({
      chainId: AZURO_CHAIN_ID,
      account,
      selections: [{ conditionId: selection.conditionId, outcomeId: selection.outcomeId }],
    }),
    getBetFee(AZURO_CHAIN_ID),
  ]);

  const minOdds = calcMinOdds({ odds: oddsNum, slippage: 5 });
  const amountRaw = parseBetTokenAmountRaw(amount);
  const nonce = azuroOrderNonce();

  const typedData = getBetTypedData({
    account,
    bet: {
      conditionId: selection.conditionId,
      outcomeId: selection.outcomeId,
      minOdds,
      amount: amountRaw,
      nonce,
    },
    clientData: {
      attention: "Lambor",
      affiliate: ZERO_ADDRESS,
      core: coreAddress,
      expiresAt: Math.floor(Date.now() / 1000) + 60 * 10,
      chainId: AZURO_CHAIN_ID,
      relayerFeeAmount: fee.relayerFeeAmount,
      isBetSponsored: false,
      isFeeSponsored: false,
      isSponsoredBetReturnable: false,
    },
  });

  return {
    calculation,
    fee,
    typedData,
    submitPayload: {
      conditionId: selection.conditionId,
      outcomeId: selection.outcomeId,
      minOdds,
      amount: amountRaw,
      nonce,
    },
  };
}
