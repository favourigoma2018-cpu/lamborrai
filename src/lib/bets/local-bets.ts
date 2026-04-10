import type { PlacedBetRecord } from "@/types/bets";

const STORAGE_KEY = "bet3.placed-bets.v1";

export function readPlacedBets(): PlacedBetRecord[] {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as PlacedBetRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function writePlacedBets(records: PlacedBetRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, 20)));
}

export function pushPlacedBet(record: PlacedBetRecord) {
  const current = readPlacedBets();
  writePlacedBets([record, ...current.filter((item) => item.id !== record.id)]);
}
