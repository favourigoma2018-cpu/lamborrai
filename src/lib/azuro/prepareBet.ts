import {
  calcMinOdds,
  getBetCalculation,
  getBetFee,
  getBetTypedData,
  type CreateBetParams,
} from "@azuro-org/toolkit";
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

/** Everything after `prepareBet` except the wallet `signature` — must be relayed unchanged. */
export type PreparedOrdinaryBet = {
  calculation: Awaited<ReturnType<typeof getBetCalculation>>;
  fee: Awaited<ReturnType<typeof getBetFee>>;
  typedData: ReturnType<typeof getBetTypedData>;
  relayBody: Omit<CreateBetParams, "signature">;
};

type PrepareBetArgs = {
  account: Address;
  selection: SlipSelection;
  amount: string;
  coreAddress: Address;
};

/**
 * Azuro ordinary bet — step 1 of 3 (prepare → sign → relay).
 * Builds EIP-712 typed data and freezes `clientData` + `bet` for the relay step.
 */
export async function prepareBet(args: PrepareBetArgs): Promise<PreparedOrdinaryBet> {
  const { account, selection, amount, coreAddress } = args;
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

  const bet = {
    conditionId: selection.conditionId,
    outcomeId: selection.outcomeId,
    minOdds,
    amount: amountRaw,
    nonce,
  } as const;

  const clientData = {
    attention: "Lambor",
    affiliate: ZERO_ADDRESS,
    core: coreAddress,
    expiresAt: Math.floor(Date.now() / 1000) + 60 * 10,
    chainId: AZURO_CHAIN_ID,
    relayerFeeAmount: fee.relayerFeeAmount,
    isBetSponsored: false,
    isFeeSponsored: false,
    isSponsoredBetReturnable: false,
  } as const;

  const typedData = getBetTypedData({
    account,
    bet,
    clientData,
  });

  const relayBody: Omit<CreateBetParams, "signature"> = {
    account,
    bet,
    clientData,
  };

  return {
    calculation,
    fee,
    typedData,
    relayBody,
  };
}

/** @deprecated Use `prepareBet` — alias for searchability. */
export const prepareBetInteraction = prepareBet;

/** @deprecated Use `PreparedOrdinaryBet` */
export type PreparedBetInteraction = PreparedOrdinaryBet;
