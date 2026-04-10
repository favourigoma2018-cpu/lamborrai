"use client";

import { useAutoWithdrawOnWin } from "@/hooks/use-auto-withdraw-on-win";

/** Mount once under `LamborWalletProvider` to queue ERC-20 transfers to the saved withdraw address on Azuro wins. */
export function AutoWithdrawOnWinListener() {
  useAutoWithdrawOnWin();
  return null;
}
