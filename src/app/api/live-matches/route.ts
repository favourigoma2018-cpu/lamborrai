import { NextResponse } from "next/server";

import { getLiveMatchesWithCache } from "@/lib/server/lambor-live-cache";

export async function GET() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API_FOOTBALL_KEY is not configured." }, { status: 500 });
  }

  const result = await getLiveMatchesWithCache(apiKey);

  if (result.warning && result.matches.length === 0) {
    return NextResponse.json(
      {
        matches: [],
        degraded: true,
        warning: result.warning,
        lastUpdated: result.lastUpdated,
        refreshIntervalMs: 10 * 60 * 1000,
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      matches: result.matches,
      lastUpdated: result.lastUpdated,
      refreshIntervalMs: 10 * 60 * 1000,
      degraded: result.degraded,
      ...(result.warning ? { warning: result.warning } : {}),
    },
    { status: 200 },
  );
}
