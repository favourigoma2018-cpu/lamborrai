import type { LiveMatch } from "@/types/live-matches";

export type FixtureStats = {
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
  cornersHome: number | null;
  cornersAway: number | null;
  redCardsHome: number | null;
  redCardsAway: number | null;
};

export function emptyStats(): FixtureStats {
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
    cornersHome: null,
    cornersAway: null,
    redCardsHome: null,
    redCardsAway: null,
  };
}

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
      id?: number;
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

export async function fetchFixtureStats(fixtureId: number, apiKey: string): Promise<FixtureStats> {
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
    cornersHome: statValue(homeStats, ["Corner Kicks", "Corners"]),
    cornersAway: statValue(awayStats, ["Corner Kicks", "Corners"]),
    redCardsHome: statValue(homeStats, ["Red Cards"]),
    redCardsAway: statValue(awayStats, ["Red Cards"]),
  };
}

export function normalizeLiveFixtures(payload: ApiFootballFixtureResponse): LiveMatch[] {
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
        leagueId: item.league?.id,
        goalsHome: Number.isFinite(Number(homeGoals)) ? Number(homeGoals) : 0,
        goalsAway: Number.isFinite(Number(awayGoals)) ? Number(awayGoals) : 0,
        timestamp: item.fixture?.timestamp ?? 0,
      } satisfies LiveMatch;
    })
    .filter((item): item is LiveMatch => Boolean(item));
}

export async function fetchLiveFixturesPayload(apiKey: string): Promise<ApiFootballFixtureResponse | null> {
  try {
    const upstream = await fetch("https://v3.football.api-sports.io/fixtures?live=all", {
      headers: { "x-apisports-key": apiKey },
      cache: "no-store",
      next: { revalidate: 0 },
    });
    if (!upstream.ok) return null;
    return (await upstream.json()) as ApiFootballFixtureResponse;
  } catch {
    return null;
  }
}

const STAT_BATCH = 5;

/**
 * Fetches detailed stats for a rotating subset of fixtures to cap API usage.
 * Merges with previous stats map so teams keep last known stats between rotations.
 */
export async function enrichMatchesWithRotatingStats(
  baseMatches: LiveMatch[],
  apiKey: string,
  rotationCursor: number,
  previousById: Map<number, FixtureStats>,
): Promise<{ matches: LiveMatch[]; nextCursor: number; statsMap: Map<number, FixtureStats> }> {
  const statsMap = new Map<number, FixtureStats>(previousById);
  if (baseMatches.length === 0) {
    return { matches: [], nextCursor: rotationCursor, statsMap };
  }

  const n = baseMatches.length;
  const start = rotationCursor % n;
  const indices: number[] = [];
  for (let i = 0; i < Math.min(STAT_BATCH, n); i += 1) {
    indices.push((start + i) % n);
  }

  await Promise.all(
    indices.map(async (idx) => {
      const m = baseMatches[idx];
      const stats = await fetchFixtureStats(m.id, apiKey);
      statsMap.set(m.id, stats);
    }),
  );

  const enriched = baseMatches.map((match) => ({
    ...match,
    ...(statsMap.get(match.id) ?? emptyStats()),
  }));

  return {
    matches: enriched,
    nextCursor: (rotationCursor + STAT_BATCH) % Math.max(1, n),
    statsMap,
  };
}
