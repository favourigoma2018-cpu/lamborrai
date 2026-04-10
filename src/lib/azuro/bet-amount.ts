import { chainsData } from "@azuro-org/toolkit";
import { parseUnits } from "viem";

import { AZURO_CHAIN_ID } from "@/config/chain";

/** Human-readable bet token amount → integer string in bet token decimals (for EIP-712 + Azuro API). */
export function parseBetTokenAmountRaw(humanAmount: string): string {
  const d = chainsData[AZURO_CHAIN_ID].betToken.decimals;
  const n = humanAmount.trim() || "0";
  return parseUnits(n, d).toString();
}
