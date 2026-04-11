import type { GameCondition } from "@/lib/azuro/fetch-conditions";
import type {
  LamborMarketGroup,
  LamborMarketKind,
  LamborMarketOption,
  MatchMarketsPayload,
} from "@/types/betting-markets";
import type { LiveMatch } from "@/types/live-matches";

function classifyCondition(title: string | null): LamborMarketKind | null {
  if (!title) return null;
  const t = title.toLowerCase().replace(/\s+/g, " ").trim();

  if (t.includes("double chance")) return "double_chance";
  if (t.includes("both teams") || t.includes("btts") || t.includes("gg / ng") || t.includes("gg/ng")) return "btts";

  const isFirstHalf =
    t.includes("1st half") ||
    t.includes("first half") ||
    t.includes("1st-half") ||
    t.includes("half time 1") ||
    /\bht\b/.test(t) ||
    t.includes("half-time");
  if (isFirstHalf && (t.includes("total") || t.includes("over") || t.includes("under") || t.includes("o/u"))) {
    return "half_time_over_under";
  }
  if (isFirstHalf && (t.includes("winner") || t.includes("1x2") || t.includes("match result"))) {
    return "half_time_winner";
  }

  if (
    t.includes("total") ||
    t.includes("over / under") ||
    t.includes("over/under") ||
    t.includes("o/u") ||
    t.includes("goals over") ||
    t.includes("asian total") ||
    t.includes("goal line") ||
    (t.includes("over") && t.includes("under")) ||
    /\bgoals?\b.*\b(under|over)\b/.test(t) ||
    /\b(under|over)\b.*\bgoals?\b/.test(t)
  ) {
    return "over_under";
  }

  if (
    t.includes("1x2") ||
    t.includes("match winner") ||
    t.includes("full time") ||
    t.includes("fulltime") ||
    t.includes("regular time") ||
    t.includes("moneyline") ||
    t.includes("match result") ||
    t.includes("three way") ||
    t.includes("home/draw/away") ||
    t.includes("home / draw / away") ||
    t.includes("winner (incl.") ||
    (t.includes("winner") && !isFirstHalf)
  ) {
    return "match_winner";
  }

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
      odds: (() => {
        const raw = o.odds as string | number | undefined;
        if (typeof raw === "number" && Number.isFinite(raw)) return raw.toFixed(2);
        return String(raw ?? "");
      })(),
      marketId: condition.conditionId,
      outcomeId: o.outcomeId,
      executable: true,
    };
  });
}

function mergeOrAppend(groups: LamborMarketGroup[], next: LamborMarketGroup) {
  if (next.type === "other_azuro") {
    groups.push({ ...next, options: dedupeOptions(next.options) });
    return;
  }
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
    const opts = mapOutcomesToOptions(condition);
    if (opts.length === 0) continue;

    let kind = classifyCondition(condition.title);
    if (!kind) {
      kind = "other_azuro";
    }

    const line =
      kind === "over_under" || kind === "half_time_over_under" ? parseLineFromTitle(condition.title) : undefined;
    const period =
      kind === "half_time_over_under" || kind === "half_time_winner"
        ? ("1st_half" as const)
        : ("full" as const);

    mergeOrAppend(groups, {
      type: kind,
      line,
      period,
      conditionTitle: condition.title,
      options: opts,
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
