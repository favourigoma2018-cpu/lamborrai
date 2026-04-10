import { NextResponse } from "next/server";

import { getPrematchBundleCached } from "@/lib/server/prematch-bundle-cache";

/**
 * Cached Azuro prematch snapshot (games + conditions). All clients share one refresh window (~90s).
 */
export async function GET() {
  try {
    const bundle = await getPrematchBundleCached();
    return NextResponse.json(
      {
        games: bundle.games,
        total: bundle.total,
        page: bundle.page,
        perPage: bundle.perPage,
        conditionsByGameId: bundle.conditionsByGameId,
        fetchedAt: bundle.fetchedAt,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "Prematch feed unavailable." }, { status: 502 });
  }
}
