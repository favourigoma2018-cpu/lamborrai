const KEY = "lambor.blockedLeagueIds.v1";

/** API-Football league ids to exclude from Lambor live strategies (user-editable JSON array in localStorage). */
export function readBlockedLeagueIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const a = JSON.parse(raw) as unknown;
    if (!Array.isArray(a)) return [];
    return a.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  } catch {
    return [];
  }
}
