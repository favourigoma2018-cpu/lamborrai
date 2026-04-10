import { isAddress } from "viem";

import type { LiveMatch } from "@/types/live-matches";

export type ChatIntent = "place_bet" | "hedge" | "withdraw" | "deposit" | "status" | "unknown";

export type ParsedCommand = {
  intent: ChatIntent;
  raw: string;
  match?: string;
  market?: string;
  amount?: number;
  percentage?: number;
};

export type ActionResult = {
  state: "success" | "error" | "pending";
  message: string;
};

export type ActionContext = {
  activeWalletAddress?: string | null;
  withdrawAddress?: string;
  liveMatches: LiveMatch[];
  onOpenBetTab?: () => void;
  getStatusSummary?: () => string;
};

function toAmount(input: string): number | undefined {
  const amountMatch = input.match(/\$?\s*(\d+(\.\d+)?)/);
  if (!amountMatch) return undefined;
  const amount = Number.parseFloat(amountMatch[1]);
  return Number.isFinite(amount) ? amount : undefined;
}

function toPercent(input: string): number | undefined {
  const percentMatch = input.match(/(\d+)\s*%/);
  if (!percentMatch) return undefined;
  const percent = Number.parseInt(percentMatch[1], 10);
  return Number.isFinite(percent) ? percent : undefined;
}

function toMarket(input: string): string | undefined {
  const direct = input.match(/(?:market|on|for)\s+([a-z0-9+\-.\s]+)$/i);
  if (direct?.[1]) return direct[1].trim();
  const hedge = input.match(/hedge\s+\d+\s*%\s+(.+)$/i);
  if (hedge?.[1]) return hedge[1].trim();
  const bet = input.match(/(?:place bet|bet)\s+(.+)$/i);
  if (bet?.[1]) return bet[1].trim();
  return undefined;
}

export function parseCommand(input: string): ParsedCommand {
  const raw = input.trim();
  const lower = raw.toLowerCase();

  const base: ParsedCommand = {
    intent: "unknown",
    raw,
    amount: toAmount(raw),
    percentage: toPercent(raw),
    market: toMarket(raw),
  };

  if (/\b(place bet|bet)\b/.test(lower)) return { ...base, intent: "place_bet" };
  if (/\bhedge\b/.test(lower)) return { ...base, intent: "hedge" };
  if (/\bwithdraw\b/.test(lower)) return { ...base, intent: "withdraw" };
  if (/\bdeposit\b/.test(lower)) return { ...base, intent: "deposit" };
  if (/\bstatus\b/.test(lower)) return { ...base, intent: "status" };
  return base;
}

export async function handleBet(command: ParsedCommand, context: ActionContext): Promise<ActionResult> {
  if (!command.market) {
    return { state: "error", message: "❌ Please specify a match/market. Example: Place bet Arsenal +0.5" };
  }
  const response = await fetch("/api/execution/bet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ market: command.market }),
  });
  const payload = (await response.json()) as { status?: "pending" | "completed" | "failed"; message?: string };
  if (!response.ok) return { state: "error", message: `❌ ${payload.message ?? "Bet execution failed."}` };
  context.onOpenBetTab?.();
  if (payload.status === "pending") return { state: "pending", message: `⏳ ${payload.message ?? "Bet pending."}` };
  return {
    state: "success",
    message: `✅ ${payload.message ?? "Bet placed successfully"}`,
  };
}

export async function handleHedge(command: ParsedCommand, _context: ActionContext): Promise<ActionResult> {
  if (!command.percentage || !command.market) {
    return { state: "error", message: "❌ Hedge requires percentage and market. Example: Hedge 30% Arsenal +0.5" };
  }
  const response = await fetch("/api/execution/hedge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ market: command.market, percentage: command.percentage }),
  });
  const payload = (await response.json()) as { status?: "pending" | "completed" | "failed"; message?: string; odds?: string };
  if (!response.ok) return { state: "error", message: `❌ ${payload.message ?? "Hedge failed."}` };
  if (payload.status === "pending") return { state: "pending", message: `⏳ ${payload.message ?? "Hedge pending confirmation."}` };
  return { state: "success", message: `✅ ${payload.message ?? `Hedged ${command.percentage}% at odds ${payload.odds ?? "-"}`}` };
}

export async function handleWithdraw(command: ParsedCommand, context: ActionContext): Promise<ActionResult> {
  const amount = command.amount;
  const withdrawAddress = context.withdrawAddress?.trim() ?? "";
  if (!amount || amount <= 0) return { state: "error", message: "❌ Provide withdraw amount. Example: Withdraw 10" };
  if (!withdrawAddress || !isAddress(withdrawAddress)) {
    return { state: "error", message: "❌ Set a valid withdraw address in Wallet before chat withdraw." };
  }
  if (!context.activeWalletAddress || !isAddress(context.activeWalletAddress)) {
    return { state: "error", message: "❌ No active wallet loaded for withdrawal." };
  }

  const response = await fetch("/api/wallet/withdraw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      walletAddress: context.activeWalletAddress,
      withdrawAddress,
      amount: String(amount),
    }),
  });
  const payload = (await response.json()) as { status?: string; error?: string };
  if (!response.ok) return { state: "error", message: `❌ ${payload.error ?? "Withdraw failed."}` };
  if (payload.status === "pending") return { state: "pending", message: "⏳ Transaction pending" };
  return { state: "success", message: "✅ Withdrawal completed" };
}

export async function handleDeposit(command: ParsedCommand, _context: ActionContext): Promise<ActionResult> {
  const amount = command.amount;
  if (!amount || amount <= 0) {
    return { state: "error", message: "❌ Provide deposit amount. Example: Deposit 25" };
  }
  const response = await fetch("/api/execution/deposit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  const payload = (await response.json()) as { status?: string; message?: string };
  if (!response.ok) return { state: "error", message: "❌ Deposit failed." };
  if (payload.status === "pending") return { state: "pending", message: `⏳ ${payload.message ?? "Deposit pending."}` };
  return { state: "success", message: `✅ ${payload.message ?? "Deposit acknowledged."}` };
}

export async function handleStatus(_command: ParsedCommand, context: ActionContext): Promise<ActionResult> {
  if (context.getStatusSummary) {
    return { state: "success", message: `✅ ${context.getStatusSummary()}` };
  }
  return { state: "success", message: "✅ System online. No active status summary available." };
}

export async function executeCommand(command: ParsedCommand, context: ActionContext): Promise<ActionResult> {
  switch (command.intent) {
    case "place_bet":
      return handleBet(command, context);
    case "hedge":
      return handleHedge(command, context);
    case "withdraw":
      return handleWithdraw(command, context);
    case "deposit":
      return handleDeposit(command, context);
    case "status":
      return handleStatus(command, context);
    default:
      return {
        state: "error",
        message:
          "❌ I couldn't parse that command. Try: 'Place bet Arsenal +0.5', 'Hedge 30% Arsenal +0.5', 'Withdraw 10', 'Deposit 20', or 'Status'.",
      };
  }
}

