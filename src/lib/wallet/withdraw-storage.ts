const WITHDRAW_KEY = "lambor.wallet.withdrawAddress.v1";

export function readWithdrawAddress(): string {
  if (typeof window === "undefined") return "";
  try {
    return (window.localStorage.getItem(WITHDRAW_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function writeWithdrawAddress(address: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WITHDRAW_KEY, address.trim());
}
