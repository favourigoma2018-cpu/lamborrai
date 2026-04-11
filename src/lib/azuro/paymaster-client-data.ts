import type { ChainId } from "@azuro-org/toolkit";
import type { Address } from "viem";

/**
 * EIP-712 `clientData` for bets funded from the bettor's PayMaster `freeBetsFund`
 * (`depositFor` credits the same address used as `affiliate`).
 *
 * @see https://gem.azuro.org/hub/blockchains/paymaster-funds
 */
export function clientDataPaymasterStake(args: {
  bettor: Address;
  core: Address;
  chainId: ChainId;
  expiresAt: number;
  relayerFeeAmount: string;
  attention: string;
  /** When the bettor's `feeFund` on PayMaster covers the relayer fee. */
  isFeeSponsored?: boolean;
}) {
  const { bettor, core, chainId, expiresAt, relayerFeeAmount, attention, isFeeSponsored = false } = args;
  return {
    attention,
    affiliate: bettor,
    core,
    expiresAt,
    chainId,
    relayerFeeAmount,
    isBetSponsored: true,
    isFeeSponsored,
    /** Stake returns to the bettor's PayMaster vault on win; aligns with self-deposited USDT. */
    isSponsoredBetReturnable: false,
  } as const;
}
