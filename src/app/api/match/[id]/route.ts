import { NextResponse } from "next/server";

import { fetchConditionsByGameIds } from "@/lib/azuro/fetch-conditions";
import { findBestAzuroGameForLive } from "@/lib/lambor/match-azuro-game";
import { buildMatchMarkets } from "@/lib/lambor/markets/build-match-markets";
import { fetchSingleLiveMatch, getLiveMatchFromWarmCache } from "@/lib/server/lambor-live-cache";
import { getPrematchBundleCached } from "@/lib/server/prematch-bundle-cache";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteParams) {
  const { id } = await context.params;
  const fixtureId = Number.parseInt(id, 10);
  if (!Number.isFinite(fixtureId)) {
    return NextResponse.json({ error: "Invalid match id." }, { status: 400 });
  }

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API_FOOTBALL_KEY is not configured." }, { status: 500 });
  }

  let match = getLiveMatchFromWarmCache(fixtureId);
  if (!match) {
    match = await fetchSingleLiveMatch(apiKey, fixtureId);
  }
  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  const bundle = await getPrematchBundleCached();
  const azuroGame = findBestAzuroGameForLive(match, bundle.games);
  let conditions = azuroGame ? bundle.conditionsByGameId[azuroGame.gameId] ?? [] : [];

  if (azuroGame && conditions.length === 0) {
    try {
      const fresh = await fetchConditionsByGameIds([azuroGame.gameId]);
      conditions = fresh[azuroGame.gameId] ?? [];
    } catch {
      /* keep empty */
    }
  }

  const payload = buildMatchMarkets(match, azuroGame?.gameId, conditions);
  return NextResponse.json(payload, { status: 200 });
}
