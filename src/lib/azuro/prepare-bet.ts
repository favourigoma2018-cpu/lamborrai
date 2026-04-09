import { getBetCalculation, getBetFee, getBetTypedData, type Address } from "@azuro-org/toolkit";

import { AZURO_CHAIN_ID } from "@/config/chain";

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
};

type PrepareBetInteractionArgs = {
  account: Address;
  selection: SlipSelection;
  amount: string;
  coreAddress: Address;
};

/**
 * Builds the pre-sign payload needed for Azuro bet execution.
 * This is preparation only; signing and relayer submission are separate steps.
 */
export async function prepareBetInteraction({
  account,
  selection,
  amount,
  coreAddress,
}: PrepareBetInteractionArgs): Promise<PreparedBetInteraction> {
  const [calculation, fee] = await Promise.all([
    getBetCalculation({
      chainId: AZURO_CHAIN_ID,
      account,
      selections: [{ conditionId: selection.conditionId, outcomeId: selection.outcomeId }],
    }),
    getBetFee(AZURO_CHAIN_ID),
  ]);

  const typedData = getBetTypedData({
    account,
    bet: {
      conditionId: selection.conditionId,
      outcomeId: selection.outcomeId,
      minOdds: selection.odds,
      amount,
      nonce: Date.now().toString(),
    },
    clientData: {
      attention: "Bet3 sportsbook",
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

  return { calculation, fee, typedData };
}
