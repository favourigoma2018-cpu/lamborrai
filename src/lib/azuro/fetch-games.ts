import { GameState, getGamesByFilters } from "@azuro-org/toolkit";

import { AZURO_CHAIN_ID } from "@/config/chain";

export type PrematchGamesResult = Awaited<ReturnType<typeof getGamesByFilters>>;

/**
 * Loads prematch games from Azuro’s REST feed (Toolkit v6).
 * Runs on the server (RSC) — no wallet required.
 */
export async function fetchPrematchGames(options?: {
  page?: number;
  perPage?: number;
}): Promise<PrematchGamesResult> {
  const { page = 1, perPage = 24 } = options ?? {};

  return getGamesByFilters({
    chainId: AZURO_CHAIN_ID,
    state: GameState.Prematch,
    sportHub: "sports",
    page,
    perPage,
    orderBy: undefined,
    orderDir: undefined,
  });
}
