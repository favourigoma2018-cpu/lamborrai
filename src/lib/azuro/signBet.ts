import type { Hex } from "viem";
import type { SignTypedDataParameters } from "viem";

/**
 * Azuro step 2 of 3 — EIP-712 signature (e.g. wagmi `signTypedDataAsync`).
 * Must sign the exact `typedData` returned from `prepareBet` / combo prepare.
 */
export async function signBet(
  typedData: SignTypedDataParameters,
  signTypedDataAsync: (args: SignTypedDataParameters) => Promise<Hex>,
): Promise<Hex> {
  return signTypedDataAsync(typedData);
}
