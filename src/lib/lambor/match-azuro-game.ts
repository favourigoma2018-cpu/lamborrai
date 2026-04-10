import type { GameData } from "@azuro-org/toolkit";
import type { LiveMatch } from "@/types/live-matches";

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(fc|cf|sc|ac|club|deportivo|sporting)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreGameMatch(gameTitle: string, home: string, away: string) {
  const title = normalizeName(gameTitle);
  const homeName = normalizeName(home);
  const awayName = normalizeName(away);
  let score = 0;
  if (title.includes(homeName)) score += 2;
  if (title.includes(awayName)) score += 2;

  const homeToken = homeName.split(" ")[0];
  const awayToken = awayName.split(" ")[0];
  if (homeToken && title.includes(homeToken)) score += 1;
  if (awayToken && title.includes(awayToken)) score += 1;
  return score;
}

function scoreLeagueMatch(gameLeague: string, liveLeague: string) {
  const game = normalizeName(gameLeague);
  const live = normalizeName(liveLeague);
  if (!game || !live) return 0;
  if (game === live) return 3;
  if (game.includes(live) || live.includes(game)) return 2;

  const gameToken = game.split(" ")[0];
  const liveToken = live.split(" ")[0];
  if (gameToken && liveToken && gameToken === liveToken) return 1;
  return 0;
}

function scoreKickoffProximity(gameStartsAt: string, liveTimestamp: number) {
  const startsAtSec = Number.parseInt(gameStartsAt, 10);
  if (!Number.isFinite(startsAtSec) || !Number.isFinite(liveTimestamp) || liveTimestamp <= 0) return 0;

  const diffHours = Math.abs(startsAtSec - liveTimestamp) / 3600;
  if (diffHours <= 2) return 3;
  if (diffHours <= 6) return 2;
  if (diffHours <= 12) return 1;
  return 0;
}

/** Best Azuro prematch game for a live API-Football fixture (for odds / market wiring). */
export function findBestAzuroGameForLive(match: LiveMatch, games: GameData[]): GameData | null {
  const ranked = games
    .map((game) => ({
      game,
      score:
        scoreGameMatch(game.title, match.homeTeam, match.awayTeam) * 3 +
        scoreLeagueMatch(game.league.name, match.league) * 2 +
        scoreKickoffProximity(game.startsAt, match.timestamp),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score <= 0) return null;
  return best.game;
}
