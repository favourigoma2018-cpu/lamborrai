import type { RiskTier } from "./types";

const KEY = "lambor.bankroll.v1";

export type BankrollState = {
  balance: number;
  currency: "USD";
  lastDailyLoss: number;
  lastResetDay: string;
};

function todayStr() {
  return new Date().toDateString();
}

export function readBankroll(): BankrollState {
  if (typeof window === "undefined") {
    return { balance: 1000, currency: "USD", lastDailyLoss: 0, lastResetDay: todayStr() };
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { balance: 1000, currency: "USD", lastDailyLoss: 0, lastResetDay: todayStr() };
    const p = JSON.parse(raw) as BankrollState;
    const day = todayStr();
    if (p.lastResetDay !== day) {
      return { ...p, lastDailyLoss: 0, lastResetDay: day };
    }
    return p;
  } catch {
    return { balance: 1000, currency: "USD", lastDailyLoss: 0, lastResetDay: todayStr() };
  }
}

export function writeBankroll(s: BankrollState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

export function suggestStakePercent(risk: RiskTier): { min: number; max: number } {
  if (risk === "LOW") return { min: 0.01, max: 0.02 };
  if (risk === "MEDIUM") return { min: 0.02, max: 0.04 };
  return { min: 0.005, max: 0.01 };
}

export function suggestStakeAmount(
  bankroll: number,
  risk: RiskTier,
  options?: { winningStreak?: boolean; losingStreak?: boolean },
): { min: number; max: number; midpoint: number } {
  const { min, max } = suggestStakePercent(risk);
  let lo = bankroll * min;
  let hi = bankroll * max;
  if (options?.winningStreak) {
    lo *= 1.15;
    hi *= 1.2;
  }
  if (options?.losingStreak) {
    lo *= 0.65;
    hi *= 0.6;
  }
  const midpoint = (lo + hi) / 2;
  return { min: lo, max: hi, midpoint };
}

/** Max exposure as fraction of bankroll (default 10%). */
export function maxExposureAmount(bankroll: number, fraction = 0.1) {
  return bankroll * fraction;
}
