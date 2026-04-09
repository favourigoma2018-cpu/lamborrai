import { getConditionsByGameIds } from "@azuro-org/toolkit";

import { AZURO_CHAIN_ID } from "@/config/chain";

export type GameCondition = Awaited<ReturnType<typeof getConditionsByGameIds>>[number];

export type ConditionsByGameId = Record<string, GameCondition[]>;

/**
 * Loads condition markets for a list of game ids and groups them by game id.
 */
export async function fetchConditionsByGameIds(gameIds: string[]): Promise<ConditionsByGameId> {
  if (gameIds.length === 0) return {};

  const conditions = await getConditionsByGameIds({
    chainId: AZURO_CHAIN_ID,
    gameIds,
  });

  return conditions.reduce<ConditionsByGameId>((acc, condition) => {
    const gameId = condition.game.gameId;
    if (!acc[gameId]) acc[gameId] = [];
    acc[gameId].push(condition);
    return acc;
  }, {});
}
