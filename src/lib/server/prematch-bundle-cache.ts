import { fetchConditionsByGameIds, type ConditionsByGameId } from "@/lib/azuro/fetch-conditions";
import { fetchPrematchGames } from "@/lib/azuro/fetch-games";
import type { GameData } from "@azuro-org/toolkit";

export type PrematchBundle = {
  games: GameData[];
  total: number;
  page: number;
  perPage: number;
  conditionsByGameId: ConditionsByGameId;
  fetchedAt: number;
};

const TTL_MS = 90_000;

type GlobalPrematch = typeof globalThis & {
  __lamborPrematchBundle?: PrematchBundle;
  __lamborPrematchInflight?: Promise<PrematchBundle>;
};

/**
 * Shared prematch + Azuro conditions snapshot for RSC and /api/prematch.
 * One refresh per TTL across all users.
 */
export async function getPrematchBundleCached(): Promise<PrematchBundle> {
  const g = globalThis as GlobalPrematch;
  const now = Date.now();
  if (g.__lamborPrematchBundle && now - g.__lamborPrematchBundle.fetchedAt < TTL_MS) {
    return g.__lamborPrematchBundle;
  }
  if (g.__lamborPrematchInflight) return g.__lamborPrematchInflight;

  g.__lamborPrematchInflight = (async () => {
    /** Larger pool improves linking live API-Football fixtures to Azuro prematch rows. */
    const payload = await fetchPrematchGames({ page: 1, perPage: 80 });
    const conditionsByGameId = await fetchConditionsByGameIds(payload.games.map((game) => game.gameId));
    const bundle: PrematchBundle = {
      games: payload.games,
      total: payload.total,
      page: payload.page,
      perPage: payload.perPage,
      conditionsByGameId,
      fetchedAt: Date.now(),
    };
    g.__lamborPrematchBundle = bundle;
    g.__lamborPrematchInflight = undefined;
    return bundle;
  })();

  return g.__lamborPrematchInflight;
}
