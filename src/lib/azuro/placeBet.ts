import type { CreateBetParams, CreateBetResult, CreateComboBetParams } from "@azuro-org/toolkit";
import type { Hex } from "viem";

const PLACE_PATH = "/api/azuro/place";

async function postPlace(body: unknown): Promise<CreateBetResult> {
  const res = await fetch(PLACE_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as CreateBetResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Bet relay failed (${res.status}).`);
  }
  if (data.error) {
    throw new Error(data.error);
  }
  return data;
}

/**
 * Azuro step 3 of 3 — relay signed ordinary bet.
 * `relayBody` must be the exact object from `prepareBet().relayBody` (same bytes as signed).
 */
export async function placeOrdinaryBet(
  relayBody: Omit<CreateBetParams, "signature">,
  signature: Hex,
): Promise<CreateBetResult> {
  const body: CreateBetParams = { ...relayBody, signature };
  return postPlace(body);
}

/**
 * Relay signed combo — `relayBody` must match the typed data that was signed.
 */
export async function placeComboBet(
  relayBody: Omit<CreateComboBetParams, "signature">,
  signature: Hex,
): Promise<CreateBetResult> {
  const body: CreateComboBetParams = { ...relayBody, signature };
  return postPlace(body);
}
