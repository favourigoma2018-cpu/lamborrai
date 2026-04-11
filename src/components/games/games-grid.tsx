"use client";

import type { GameData } from "@azuro-org/toolkit";
import { useMemo, useState } from "react";

import { BetSlip, type BetSlipSelection } from "@/components/bets/bet-slip";
import type { ConditionsByGameId } from "@/lib/azuro/fetch-conditions";

type GamesGridProps = {
  games: GameData[];
  conditionsByGameId: ConditionsByGameId;
  total: number;
  page: number;
  perPage: number;
};

function formatStartTime(startsAt: string) {
  const sec = Number.parseInt(startsAt, 10);
  if (Number.isNaN(sec)) return startsAt;
  return new Date(sec * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function normalizeOddsLabel(odds: string) {
  const value = Number.parseFloat(odds);
  if (!Number.isFinite(value)) return odds;
  return value.toFixed(2);
}

export function GamesGrid({ games, conditionsByGameId, total, page, perPage }: GamesGridProps) {
  const [selection, setSelection] = useState<BetSlipSelection | null>(null);

  const gamesWithMarkets = useMemo(
    () =>
      games.map((game) => ({
        game,
        conditions: conditionsByGameId[game.gameId] ?? [],
      })),
    [conditionsByGameId, games],
  );

  if (games.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 px-6 py-12 text-center text-zinc-400">
        No prematch games returned for Base Sepolia right now. Try again later or check Azuro
        feed status.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        <p className="mb-4 text-sm text-zinc-500">
          Showing {games.length} of {total} games (page {page}, {perPage} per page).
        </p>
        <ul className="grid gap-4 sm:grid-cols-2">
          {gamesWithMarkets.map(({ game, conditions }) => (
            <li
              key={game.gameId}
              className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-lg"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-emerald-500/90">
                  {game.sport.name}
                </span>
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">{game.state}</span>
              </div>
              <h3 className="mb-1 text-lg font-semibold leading-snug text-zinc-100">{game.title}</h3>
              <p className="mb-3 text-sm text-zinc-500">
                {game.league.name}
                {game.country?.name ? ` · ${game.country.name}` : ""}
              </p>

              <div className="space-y-3 border-t border-zinc-800 pt-3">
                {conditions.length === 0 ? (
                  <p className="text-xs text-zinc-500">No markets available yet for this event.</p>
                ) : (
                  conditions.slice(0, 2).map((condition) => (
                    <div key={condition.conditionId}>
                      <p className="mb-2 text-xs font-medium text-zinc-400">
                        {condition.title ?? `Market ${condition.conditionId}`}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {condition.outcomes.slice(0, 4).map((outcome) => {
                          const isActive =
                            selection?.conditionId === condition.conditionId &&
                            selection.outcomeId === outcome.outcomeId;
                          return (
                            <button
                              key={outcome.outcomeId}
                              type="button"
                              onClick={() =>
                                setSelection({
                                  gameTitle: game.title,
                                  marketTitle: condition.title ?? `Market ${condition.conditionId}`,
                                  outcomeTitle: outcome.title ?? `Outcome ${outcome.outcomeId}`,
                                  conditionId: condition.conditionId,
                                  outcomeId: outcome.outcomeId,
                                  odds: String(outcome.odds),
                                  executable: true,
                                  gameId: game.gameId,
                                  conditionKind: "LIVE",
                                })
                              }
                              className={`rounded-md border px-2 py-1.5 text-left text-xs transition ${
                                isActive
                                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                                  : "border-zinc-700 bg-zinc-950/60 text-zinc-300 hover:border-zinc-500"
                              }`}
                            >
                              <span className="block truncate text-zinc-400">{outcome.title ?? outcome.outcomeId}</span>
                              <span className="mt-0.5 block font-semibold text-zinc-100">
                                {normalizeOddsLabel(outcome.odds)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-3 space-y-1 border-t border-zinc-800 pt-3 text-xs text-zinc-500">
                <p>Starts: {formatStartTime(game.startsAt)}</p>
                <p className="font-mono text-[11px] text-zinc-600">id {game.gameId}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <BetSlip selection={selection} onClear={() => setSelection(null)} />
    </div>
  );
}
