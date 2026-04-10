import type { BetSlipSelection } from "@/components/bets/bet-slip";

const KEY = "lambor.slip.queue.v1";

/** Tag each selection with `strategyPackageId` when adding from a package “Add all”. */
export function enqueueSlipSelections(items: BetSlipSelection[], strategyPackageId?: string) {
  if (typeof window === "undefined" || items.length === 0) return;
  try {
    const raw = sessionStorage.getItem(KEY);
    const prev: BetSlipSelection[] = raw ? (JSON.parse(raw) as BetSlipSelection[]) : [];
    const tagged =
      strategyPackageId != null && strategyPackageId !== ""
        ? items.map((item) => ({ ...item, strategyPackageId: item.strategyPackageId ?? strategyPackageId }))
        : items;
    sessionStorage.setItem(KEY, JSON.stringify([...prev, ...tagged]));
  } catch {
    /* ignore */
  }
}

export function drainSlipQueue(): BetSlipSelection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(KEY);
    const items: BetSlipSelection[] = raw ? (JSON.parse(raw) as BetSlipSelection[]) : [];
    sessionStorage.removeItem(KEY);
    return items;
  } catch {
    return [];
  }
}
