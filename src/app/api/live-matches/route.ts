import { NextResponse } from "next/server";

import type { LiveMatch } from "@/types/live-matches";

type ApiFootballFixtureResponse = {
  response?: Array<{
    fixture?: {
      id?: number;
      timestamp?: number;
      status?: {
        elapsed?: number | null;
        short?: string;
      };
    };
    league?: {
      name?: string;
    };
    teams?: {
      home?: { name?: string };
      away?: { name?: string };
    };
    goals?: {
      home?: number | null;
      away?: number | null;
    };
  }>;
};

type ApiFootballFixtureStatisticsResponse = {
  response?: Array<{
    team?: { name?: string };
    statistics?: Array<{ type?: string; value?: string | number | null }>;
  }>;
};

type GlobalCache = typeof globalThis & { __lamborLiveMatchesCache?: LiveMatch[] };

type FixtureStats = {
  possessionHome: number | null;
  possessionAway: number | null;
  shotsOnTargetHome: number | null;
  shotsOnTargetAway: number | null;
  totalShotsHome: number | null;
  totalShotsAway: number | null;
  attacksHome: number | null;
  attacksAway: number | null;
  dangerousAttacksHome: number | null;
  dangerousAttacksAway: number | null;
  redCardsHome: number | null;
  redCardsAway: number | null;
};

function emptyStats(): FixtureStats {
  return {
    possessionHome: null,
    possessionAway: null,
    shotsOnTargetHome: null,
    shotsOnTargetAway: null,
    totalShotsHome: null,
    totalShotsAway: null,
    attacksHome: null,
    attacksAway: null,
    dangerousAttacksHome: null,
    dangerousAttacksAway: null,
    redCardsHome: null,
    redCardsAway: null,
  };
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = value.replace("%", "").trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function statValue(
  stats: Array<{ type?: string; value?: string | number | null }> | undefined,
  candidates: string[],
): number | null {
  if (!stats || stats.length === 0) return null;
  const match = stats.find((item) => {
    const type = (item.type ?? "").toLowerCase();
    return candidates.some((candidate) => type === candidate.toLowerCase());
  });
  return toNumber(match?.value);
}

async function fetchFixtureStats(fixtureId: number, apiKey: string): Promise<FixtureStats> {
  let response: Response;
  try {
    response = await fetch(`https://v3.football.api-sports.io/fixtures/statistics?fixture=${fixtureId}`, {
      headers: { "x-apisports-key": apiKey },
      cache: "no-store",
      next: { revalidate: 0 },
    });
  } catch {
    return emptyStats();
  }

  if (!response.ok) return emptyStats();

  let payload: ApiFootballFixtureStatisticsResponse;
  try {
    payload = (await response.json()) as ApiFootballFixtureStatisticsResponse;
  } catch {
    return emptyStats();
  }

  const [home, away] = payload.response ?? [];
  const homeStats = home?.statistics;
  const awayStats = away?.statistics;
  return {
    possessionHome: statValue(homeStats, ["Ball Possession"]),
    possessionAway: statValue(awayStats, ["Ball Possession"]),
    shotsOnTargetHome: statValue(homeStats, ["Shots on Goal"]),
    shotsOnTargetAway: statValue(awayStats, ["Shots on Goal"]),
    totalShotsHome: statValue(homeStats, ["Total Shots"]),
    totalShotsAway: statValue(awayStats, ["Total Shots"]),
    attacksHome: statValue(homeStats, ["Attacks"]),
    attacksAway: statValue(awayStats, ["Attacks"]),
    dangerousAttacksHome: statValue(homeStats, ["Dangerous Attacks"]),
    dangerousAttacksAway: statValue(awayStats, ["Dangerous Attacks"]),
    redCardsHome: statValue(homeStats, ["Red Cards"]),
    redCardsAway: statValue(awayStats, ["Red Cards"]),
  };
}

function normalizeFixtures(payload: ApiFootballFixtureResponse): LiveMatch[] {
  const fixtures = payload.response ?? [];
  return fixtures
    .map((item) => {
      const id = item.fixture?.id;
      const home = item.teams?.home?.name;
      const away = item.teams?.away?.name;
      if (!id || !home || !away) return null;

      const homeGoals = item.goals?.home ?? 0;
      const awayGoals = item.goals?.away ?? 0;
      return {
        id,
        homeTeam: home,
        awayTeam: away,
        score: `${homeGoals} - ${awayGoals}`,
        minute: item.fixture?.status?.elapsed ?? null,
        status: item.fixture?.status?.short ?? "LIVE",
        league: item.league?.name ?? "Unknown League",
        timestamp: item.fixture?.timestamp ?? 0,
      } satisfies LiveMatch;
    })
    .filter((item): item is LiveMatch => Boolean(item));
}

export async function GET() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API_FOOTBALL_KEY is not configured." }, { status: 500 });
  }

  const cacheStore = globalThis as GlobalCache;

  let upstream: Response;
  try {
    upstream = await fetch("https://v3.football.api-sports.io/fixtures?live=all", {
      headers: {
        "x-apisports-key": apiKey,
      },
      cache: "no-store",
      next: { revalidate: 0 },
    });
  } catch {
    const fallback = cacheStore.__lamborLiveMatchesCache ?? [];
    return NextResponse.json(
      {
        matches: fallback,
        degraded: true,
        warning: "Live provider unreachable; returning last known snapshot.",
      },
      { status: 200 },
    );
  }

  if (!upstream.ok) {
    const fallback = cacheStore.__lamborLiveMatchesCache ?? [];
    return NextResponse.json(
      {
        matches: fallback,
        degraded: true,
        warning: `Live provider returned ${upstream.status}; using fallback snapshot.`,
      },
      { status: 200 },
    );
  }

  let payload: ApiFootballFixtureResponse;
  try {
    payload = (await upstream.json()) as ApiFootballFixtureResponse;
  } catch {
    const fallback = cacheStore.__lamborLiveMatchesCache ?? [];
    return NextResponse.json(
      {
        matches: fallback,
        degraded: true,
        warning: "Invalid live payload; using fallback snapshot.",
      },
      { status: 200 },
    );
  }

  const baseMatches = normalizeFixtures(payload);
  const statsByFixtureEntries = await Promise.all(
    baseMatches.map(async (match) => {
      const stats = await fetchFixtureStats(match.id, apiKey);
      return [match.id, stats] as const;
    }),
  );
  const statsByFixture = new Map(statsByFixtureEntries);

  const enriched = baseMatches.map((match) => ({
    ...match,
    ...(statsByFixture.get(match.id) ?? emptyStats()),
  }));

  cacheStore.__lamborLiveMatchesCache = enriched;
  return NextResponse.json({ matches: enriched, degraded: false }, { status: 200 });
}
