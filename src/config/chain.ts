import { polygon } from "viem/chains";

/**
 * Polygon mainnet (chain id 137) — Azuro Protocol deployment.
 * Bet collateral follows `chainsData[137].betToken` from `@azuro-org/toolkit` (Polygon deployment uses the toolkit’s configured token; verify on gem.azuro.org).
 */
export const targetChain = polygon;

export const AZURO_CHAIN_ID = targetChain.id;
