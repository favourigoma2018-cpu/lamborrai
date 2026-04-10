/**
 * Session-scoped opening odds per fixture id (first decimal seen in this tab session).
 * Improves odds-movement signals in the strategy engine vs. a synthetic open = current × 1.03.
 */
const STORAGE_KEY = "lambor.odds.open.v1";

type OddsOpenStore = Record<string, number>;

function readStore(): OddsOpenStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as OddsOpenStore;
    return typeof p === "object" && p !== null ? p : {};
  } catch {
    return {};
  }
}

function writeStore(store: OddsOpenStore) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

/**
 * If this fixture has no stored open yet, persist `current` as opening odds.
 * Returns the opening line to use for movement (existing or newly set).
 */
export function ensureOpeningOdds(matchId: number, currentDecimal: number): number {
  if (!Number.isFinite(currentDecimal) || currentDecimal <= 1) return 1.75;
  const key = String(matchId);
  const store = readStore();
  const existing = store[key];
  if (typeof existing === "number" && Number.isFinite(existing) && existing > 1) {
    return existing;
  }
  store[key] = currentDecimal;
  writeStore(store);
  return currentDecimal;
}

export function getOpeningOdds(matchId: number): number | undefined {
  const store = readStore();
  const v = store[String(matchId)];
  return typeof v === "number" && v > 1 ? v : undefined;
}

/** Build a map for `StrategyEngineContext.oddsOpenByMatchId` after seeding opens. */
export function buildOddsOpenMap(
  matches: Array<{ id: number }>,
  getCurrentOdds: (matchId: number) => number,
): Map<number, number> {
  const map = new Map<number, number>();
  for (const m of matches) {
    const cur = getCurrentOdds(m.id);
    if (Number.isFinite(cur) && cur > 1) {
      map.set(m.id, ensureOpeningOdds(m.id, cur));
    }
  }
  return map;
}
