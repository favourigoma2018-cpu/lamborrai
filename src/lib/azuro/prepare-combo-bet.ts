import { calcMinOdds, getBetFee, getComboBetTypedData } from "@azuro-org/toolkit";
import type { Address } from "viem";

import { AZURO_CHAIN_ID } from "@/config/chain";

import { parseBetTokenAmountRaw } from "./bet-amount";
import { azuroOrderNonce } from "./order-nonce";
import type { SlipSelection } from "./prepare-bet";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export type PreparedComboBet = {
  typedData: ReturnType<typeof getComboBetTypedData>;
  fee: Awaited<ReturnType<typeof getBetFee>>;
  submitPayload: {
    bets: { conditionId: string; outcomeId: string }[];
    minOdds: string;
    amount: string;
    nonce: string;
  };
};

export async function prepareComboBetInteraction({
  account,
  legs,
  totalStakeHuman,
  coreAddress,
}: {
  account: Address;
  legs: SlipSelection[];
  totalStakeHuman: string;
  coreAddress: Address;
}): Promise<PreparedComboBet> {
  const odds = legs.map((l) => Number.parseFloat(l.odds)).filter((x) => Number.isFinite(x) && x > 0);
  if (odds.length !== legs.length) {
    throw new Error("Invalid odds on one or more legs.");
  }

  const [fee] = await Promise.all([getBetFee(AZURO_CHAIN_ID)]);

  const minOdds = calcMinOdds({ odds, slippage: 5 });
  const amount = parseBetTokenAmountRaw(totalStakeHuman);
  const nonce = azuroOrderNonce();

  const typedData = getComboBetTypedData({
    account,
    clientData: {
      attention: "Lambor combo",
      affiliate: ZERO_ADDRESS,
      core: coreAddress,
      expiresAt: Math.floor(Date.now() / 1000) + 60 * 10,
      chainId: AZURO_CHAIN_ID,
      relayerFeeAmount: fee.relayerFeeAmount,
      isBetSponsored: false,
      isFeeSponsored: false,
      isSponsoredBetReturnable: false,
    },
    bets: legs.map((l) => ({
      conditionId: l.conditionId,
      outcomeId: l.outcomeId,
    })),
    amount,
    minOdds,
    nonce,
  });

  return {
    typedData,
    fee,
    submitPayload: {
      bets: legs.map((l) => ({ conditionId: l.conditionId, outcomeId: l.outcomeId })),
      minOdds,
      amount,
      nonce,
    },
  };
}
