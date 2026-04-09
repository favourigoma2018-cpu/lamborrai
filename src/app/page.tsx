import { LamborDashboard } from "@/components/lambor/lambor-dashboard";
import { fetchConditionsByGameIds } from "@/lib/azuro/fetch-conditions";
import { fetchPrematchGames } from "@/lib/azuro/fetch-games";

/** Refresh Azuro data periodically (ISR). */
export const revalidate = 60;

export default async function HomePage() {
  const gamesPayload = await fetchPrematchGames({ page: 1, perPage: 24 });
  const conditionsByGameId = await fetchConditionsByGameIds(gamesPayload.games.map((game) => game.gameId));

  return (
    <LamborDashboard
      games={gamesPayload.games}
      conditionsByGameId={conditionsByGameId}
      total={gamesPayload.total}
      page={gamesPayload.page}
      perPage={gamesPayload.perPage}
    />
  );
}
