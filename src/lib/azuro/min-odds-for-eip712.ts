import { parseUnits } from "viem";

/** Matches `ODDS_DECIMALS` in `@azuro-org/toolkit` (used by `calcMinOdds` / on-chain odds). */
export const AZURO_ODDS_DECIMALS = 12;

/**
 * `calcMinOdds` returns a human-readable decimal odds string (e.g. `"1.425000000000"`).
 * EIP-712 and relay payloads expect the fixed-point integer string (same as toolkit examples).
 */
export function minOddsHumanToEip712(minOddsHuman: string): string {
  return parseUnits(minOddsHuman.trim(), AZURO_ODDS_DECIMALS).toString();
}
