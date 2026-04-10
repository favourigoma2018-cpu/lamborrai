import { LamborDashboard } from "@/components/lambor/lambor-dashboard";
import { getPrematchBundleCached } from "@/lib/server/prematch-bundle-cache";

/** Page can be static; prematch bundle is refreshed in-memory on the server (~90s TTL). */
export const revalidate = 120;

export default async function HomePage() {
  const bundle = await getPrematchBundleCached();

  return (
    <LamborDashboard
      games={bundle.games}
      conditionsByGameId={bundle.conditionsByGameId}
      total={bundle.total}
      page={bundle.page}
      perPage={bundle.perPage}
    />
  );
}
