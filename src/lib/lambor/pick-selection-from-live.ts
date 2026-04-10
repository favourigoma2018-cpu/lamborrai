import type { GameData } from "@azuro-org/toolkit";

import type { BetSlipSelection } from "@/components/bets/bet-slip";
import type { ConditionsByGameId, GameCondition } from "@/lib/azuro/fetch-conditions";
import { ensureOpeningOdds } from "@/lib/lambor/odds-snapshot";
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

function rankGamesForLiveMatch(match: LiveMatch, games: GameData[]) {
  return games
    .map((game) => ({
      game,
      score:
        scoreGameMatch(game.title, match.homeTeam, match.awayTeam) * 3 +
        scoreLeagueMatch(game.league.name, match.league) * 2 +
        scoreKickoffProximity(game.startsAt, match.timestamp),
    }))
    .sort((a, b) => b.score - a.score);
}

function pickRankedGame(match: LiveMatch, games: GameData[], conditionsByGameId: ConditionsByGameId) {
  const ranked = rankGamesForLiveMatch(match, games);
  const candidate = ranked.find(({ game, score }) => {
    const conditions = conditionsByGameId[game.gameId] ?? [];
    return score > 0 && conditions.length > 0 && (conditions[0]?.outcomes?.length ?? 0) > 0;
  });
  const fallback = ranked.find(({ game }) => {
    const conditions = conditionsByGameId[game.gameId] ?? [];
    return conditions.length > 0 && (conditions[0]?.outcomes?.length ?? 0) > 0;
  });
  return candidate?.game ?? fallback?.game ?? null;
}

function parseOuLineFromTitle(title: string | null): number | undefined {
  if (!title) return undefined;
  const m = title.match(/(\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  const v = Number.parseFloat(m[1]);
  return Number.isFinite(v) ? v : undefined;
}

function isFullMatchTotalCondition(condition: GameCondition): boolean {
  const t = (condition.title ?? "").toLowerCase();
  if (t.includes("1st half") || t.includes("first half") || t.includes("half time")) return false;
  return /\b(total|over|under|o\/u|goals)\b/i.test(t) || t.includes("total goal");
}

/** Full-time Total Goals Over/Under 2.5 — Under outcome (Azuro conditionId + outcomeId). */
export function pickUnder25FtFromLiveMatch(
  match: LiveMatch,
  games: GameData[],
  conditionsByGameId: ConditionsByGameId,
): BetSlipSelection | null {
  const selectedGame = pickRankedGame(match, games, conditionsByGameId);
  if (!selectedGame) return null;

  const conditions = conditionsByGameId[selectedGame.gameId] ?? [];
  for (const condition of conditions) {
    if (!isFullMatchTotalCondition(condition)) continue;
    const line = parseOuLineFromTitle(condition.title);
    const t = (condition.title ?? "").toLowerCase();
    const is25 =
      (line != null && Math.abs(line - 2.5) < 0.01) || t.includes("2.5") || t.includes("2,5");
    if (!is25) continue;

    const under = condition.outcomes?.find((o) => /\bunder\b/i.test(o.title ?? ""));
    if (!under) continue;

    const oddsStr = String(under.odds);
    const dec = Number.parseFloat(oddsStr);
    if (Number.isFinite(dec) && dec > 1) {
      ensureOpeningOdds(match.id, dec);
    }

    return {
      gameTitle: selectedGame.title,
      marketTitle: condition.title ?? `Market ${condition.conditionId}`,
      outcomeTitle: under.title ?? `Outcome ${under.outcomeId}`,
      conditionId: condition.conditionId,
      outcomeId: under.outcomeId,
      odds: oddsStr,
      executable: true,
      matchId: match.id,
    };
  }

  return null;
}

/** Map a live API-Football row to the best Azuro market leg when available. */
export function pickSelectionFromLiveMatch(
  match: LiveMatch,
  games: GameData[],
  conditionsByGameId: ConditionsByGameId,
): BetSlipSelection | null {
  const selectedGame = pickRankedGame(match, games, conditionsByGameId);
  if (!selectedGame) return null;

  const condition = (conditionsByGameId[selectedGame.gameId] ?? [])[0];
  const outcome = condition?.outcomes?.[0];
  if (!condition || !outcome) return null;

  const oddsStr = String(outcome.odds);
  const dec = Number.parseFloat(oddsStr);
  if (Number.isFinite(dec) && dec > 1) {
    ensureOpeningOdds(match.id, dec);
  }

  return {
    gameTitle: selectedGame.title,
    marketTitle: condition.title ?? `Market ${condition.conditionId}`,
    outcomeTitle: outcome.title ?? `Outcome ${outcome.outcomeId}`,
    conditionId: condition.conditionId,
    outcomeId: outcome.outcomeId,
    odds: oddsStr,
    executable: true,
    matchId: match.id,
  };
}
