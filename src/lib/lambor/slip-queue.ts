import type { BetSlipSelection } from "@/components/bets/bet-slip";
import { isValidAzuroSlipSelection } from "@/lib/azuro/slip-selection-guards";

const KEY = "lambor.slip.queue.v1";

/** Tag each selection with `strategyPackageId` when adding from a package “Add all”. */
export function enqueueSlipSelections(items: BetSlipSelection[], strategyPackageId?: string) {
  if (typeof window === "undefined" || items.length === 0) return;
  try {
    const raw = sessionStorage.getItem(KEY);
    const prev: BetSlipSelection[] = raw ? (JSON.parse(raw) as BetSlipSelection[]) : [];
    const validItems = items.filter(isValidAzuroSlipSelection);
    if (validItems.length === 0) return;
    const tagged =
      strategyPackageId != null && strategyPackageId !== ""
        ? validItems.map((item) => ({ ...item, strategyPackageId: item.strategyPackageId ?? strategyPackageId }))
        : validItems;
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
