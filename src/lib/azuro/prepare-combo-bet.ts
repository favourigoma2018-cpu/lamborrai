import {
  calcMinOdds,
  getBetFee,
  getComboBetTypedData,
  type CreateComboBetParams,
  type GetComboBetTypedDataParams,
} from "@azuro-org/toolkit";
import type { Address } from "viem";

import { AZURO_CHAIN_ID } from "@/config/chain";

import { parseBetTokenAmountRaw } from "./bet-amount";
import { minOddsHumanToEip712 } from "./min-odds-for-eip712";
import { azuroOrderNonce } from "./order-nonce";
import type { SlipSelection } from "./prepareBet";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export type PreparedComboBet = {
  typedData: ReturnType<typeof getComboBetTypedData>;
  fee: Awaited<ReturnType<typeof getBetFee>>;
  relayBody: Omit<CreateComboBetParams, "signature">;
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

  const minOddsHuman = calcMinOdds({ odds, slippage: 5 });
  const minOdds = minOddsHumanToEip712(minOddsHuman);
  const amount = parseBetTokenAmountRaw(totalStakeHuman);
  const nonce = azuroOrderNonce();

  const bets = legs.map((l) => ({
    conditionId: l.conditionId,
    outcomeId: l.outcomeId,
  }));

  const clientData = {
    attention: "Lambor combo",
    affiliate: ZERO_ADDRESS,
    core: coreAddress,
    expiresAt: Math.floor(Date.now() / 1000) + 60 * 10,
    chainId: AZURO_CHAIN_ID,
    relayerFeeAmount: fee.relayerFeeAmount,
    isBetSponsored: false,
    isFeeSponsored: false,
    isSponsoredBetReturnable: false,
  } as const;

  const relayBody: Omit<CreateComboBetParams, "signature"> = {
    account,
    clientData,
    bets,
    amount,
    minOdds,
    nonce,
  };

  const typedData = getComboBetTypedData(relayBody as GetComboBetTypedDataParams);

  return {
    typedData,
    fee,
    relayBody,
  };
}
