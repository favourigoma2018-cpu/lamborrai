import type { GameCondition } from "@/lib/azuro/fetch-conditions";
import type {
  LamborMarketGroup,
  LamborMarketKind,
  LamborMarketOption,
  MatchMarketsPayload,
} from "@/types/betting-markets";
import type { LiveMatch } from "@/types/live-matches";

function syntheticOdds(fixtureId: number, salt: number): string {
  const x = ((fixtureId * 9301 + salt * 49297) % 233280) / 233280;
  const odds = 1.45 + x * 2.15;
  return odds.toFixed(2);
}

function lamborSyntheticIds(fixtureId: number, kind: string, key: string): { marketId: string; outcomeId: string } {
  return {
    marketId: `lambor:${fixtureId}:${kind}`,
    outcomeId: `lambor:${fixtureId}:${kind}:${key}`,
  };
}

const OU_LINES_FULL = [0.5, 1.5, 2.5, 3.5];
const OU_LINES_HT = [0.5, 1.5];

function classifyCondition(title: string | null): LamborMarketKind | null {
  if (!title) return null;
  const t = title.toLowerCase();
  if (t.includes("double chance")) return "double_chance";
  if (t.includes("both teams") || t.includes("btts") || t.includes("gg / ng")) return "btts";
  if ((t.includes("1st half") || t.includes("first half")) && (t.includes("total") || t.includes("over"))) return "half_time_over_under";
  if ((t.includes("1st half") || t.includes("first half")) && (t.includes("winner") || t.includes("1x2"))) return "half_time_winner";
  if (t.includes("total") || t.includes("over / under") || t.includes("o/u") || t.includes("goals over")) return "over_under";
  if (t.includes("1x2") || t.includes("match winner") || t.includes("full time") || t.includes("winner")) return "match_winner";
  return null;
}

function parseLineFromTitle(title: string | null): number | undefined {
  if (!title) return undefined;
  const m = title.match(/(\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  const v = Number.parseFloat(m[1]);
  return Number.isFinite(v) ? v : undefined;
}

function mapOutcomesToOptions(condition: GameCondition): LamborMarketOption[] {
  return condition.outcomes.map((o, idx) => {
    const label = o.title?.trim() || `Outcome ${idx + 1}`;
    return {
      label,
      odds: o.odds,
      marketId: condition.conditionId,
      outcomeId: o.outcomeId,
      executable: true,
    };
  });
}

function mergeOrAppend(groups: LamborMarketGroup[], next: LamborMarketGroup) {
  const same = groups.find((g) => g.type === next.type && g.line === next.line);
  if (same && next.options.length) {
    same.options = dedupeOptions([...same.options, ...next.options]);
  } else {
    groups.push(next);
  }
}

function dedupeOptions(opts: LamborMarketOption[]): LamborMarketOption[] {
  const seen = new Set<string>();
  return opts.filter((o) => {
    const k = `${o.marketId}:${o.outcomeId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Build Lambor market groups from a live fixture plus optional Azuro conditions for the matched game.
 */
export function buildMatchMarkets(
  match: LiveMatch,
  azuroGameId: string | undefined,
  conditions: GameCondition[] | undefined,
): MatchMarketsPayload {
  const groups: LamborMarketGroup[] = [];
  for (const condition of conditions ?? []) {
    const kind = classifyCondition(condition.title);
    if (!kind) continue;
    const line = kind === "over_under" || kind === "half_time_over_under" ? parseLineFromTitle(condition.title) : undefined;
    const opts = mapOutcomesToOptions(condition);
    if (opts.length === 0) continue;
    mergeOrAppend(groups, { type: kind, line, period: kind === "half_time_over_under" ? "1st_half" : "full", options: opts });
  }

  // Synthetic fallbacks for any missing canonical groups
  const has = (k: LamborMarketKind) => groups.some((g) => g.type === k);

  if (!has("match_winner")) {
    const ids = (i: number) => lamborSyntheticIds(match.id, "mw", String(i));
    mergeOrAppend(groups, {
      type: "match_winner",
      period: "full",
      options: [
        { label: `Home (${match.homeTeam})`, ...ids(0), odds: syntheticOdds(match.id, 1), executable: false },
        { label: "Draw", ...ids(1), odds: syntheticOdds(match.id, 2), executable: false },
        { label: `Away (${match.awayTeam})`, ...ids(2), odds: syntheticOdds(match.id, 3), executable: false },
      ],
    });
  }

  if (!has("double_chance")) {
    mergeOrAppend(groups, {
      type: "double_chance",
      options: [
        { label: "1X", ...lamborSyntheticIds(match.id, "dc", "1x"), odds: syntheticOdds(match.id, 10), executable: false },
        { label: "X2", ...lamborSyntheticIds(match.id, "dc", "x2"), odds: syntheticOdds(match.id, 11), executable: false },
        { label: "12", ...lamborSyntheticIds(match.id, "dc", "12"), odds: syntheticOdds(match.id, 12), executable: false },
      ],
    });
  }

  if (!groups.some((g) => g.type === "over_under")) {
    for (const line of OU_LINES_FULL) {
      mergeOrAppend(groups, {
        type: "over_under",
        line,
        period: "full",
        options: [
          {
            label: `Over ${line}`,
            ...lamborSyntheticIds(match.id, `ou${line}`, "o"),
            odds: syntheticOdds(match.id, 100 + line * 10),
            executable: false,
          },
          {
            label: `Under ${line}`,
            ...lamborSyntheticIds(match.id, `ou${line}`, "u"),
            odds: syntheticOdds(match.id, 200 + line * 10),
            executable: false,
          },
        ],
      });
    }
  }

  if (!has("btts")) {
    mergeOrAppend(groups, {
      type: "btts",
      options: [
        { label: "Yes", ...lamborSyntheticIds(match.id, "btts", "y"), odds: syntheticOdds(match.id, 30), executable: false },
        { label: "No", ...lamborSyntheticIds(match.id, "btts", "n"), odds: syntheticOdds(match.id, 31), executable: false },
      ],
    });
  }

  if (!groups.some((g) => g.type === "half_time_over_under")) {
    for (const line of OU_LINES_HT) {
      mergeOrAppend(groups, {
        type: "half_time_over_under",
        line,
        period: "1st_half",
        options: [
          {
            label: `Over ${line} (1H)`,
            ...lamborSyntheticIds(match.id, `htou${line}`, "o"),
            odds: syntheticOdds(match.id, 300 + line * 5),
            executable: false,
          },
          {
            label: `Under ${line} (1H)`,
            ...lamborSyntheticIds(match.id, `htou${line}`, "u"),
            odds: syntheticOdds(match.id, 400 + line * 5),
            executable: false,
          },
        ],
      });
    }
  }

  if (!has("half_time_winner")) {
    mergeOrAppend(groups, {
      type: "half_time_winner",
      period: "1st_half",
      options: [
        { label: `Home (1H)`, ...lamborSyntheticIds(match.id, "htw", "h"), odds: syntheticOdds(match.id, 50), executable: false },
        { label: "Draw (1H)", ...lamborSyntheticIds(match.id, "htw", "d"), odds: syntheticOdds(match.id, 51), executable: false },
        { label: `Away (1H)`, ...lamborSyntheticIds(match.id, "htw", "a"), odds: syntheticOdds(match.id, 52), executable: false },
      ],
    });
  }

  return {
    matchId: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    score: match.score,
    minute: match.minute,
    status: match.status,
    league: match.league,
    azuroGameId,
    markets: groups,
  };
}
