import {
  getDailyPnl,
  getSystemState,
  getWinRate,
  pauseSystem,
  resumeSystem,
} from "@/lib/telegram/system-state";

export type MatchDetectedPayload = {
  homeTeam: string;
  awayTeam: string;
  minute: number | null;
  pressure: number;
  goalProbability: number;
  strategyName: string;
  betLine: string;
  confidence: number;
  shots: string;
  corners: string;
  reasoning: string;
};

export type BetPlacedPayload = {
  match: string;
  amount: number;
  odds: number;
  strategy: string;
};

export type BetResultPayload = {
  match: string;
  score: string;
  pnl: number;
};

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number };
  };
};

function getToken() {
  return process.env.TELEGRAM_BOT_TOKEN ?? "";
}

function getAdminChatId() {
  return process.env.ADMIN_CHAT_ID ?? "";
}

function isAdminChat(chatId: string | number | undefined) {
  if (chatId === undefined || chatId === null) return false;
  return String(chatId) === String(getAdminChatId());
}

export async function sendTelegramMessage(text: string, chatId?: string | number) {
  const token = getToken();
  const targetChatId = chatId ?? getAdminChatId();
  if (!token || !targetChatId) return { ok: false as const, error: "missing_bot_config" };

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: String(targetChatId),
      text,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return { ok: false as const, error: `telegram_send_failed_${response.status}` };
  }
  return { ok: true as const };
}

export function formatMatchDetectedMessage(payload: MatchDetectedPayload) {
  return [
    "🟢 LAMBOR HUNTER ALERT",
    "",
    `⚽ ${payload.homeTeam} vs ${payload.awayTeam}`,
    `⏱ ${payload.minute ?? "-"}'`,
    `📊 Pressure: ${payload.pressure}/100`,
    `📉 Goal Probability: ${payload.goalProbability}%`,
    "",
    `🎯 Strategy: ${payload.strategyName}`,
    `📌 Line: ${payload.betLine}`,
    `🧠 Confidence: ${payload.confidence}%`,
    "",
    "📊 Stats:",
    `Shots: ${payload.shots}`,
    `Corners: ${payload.corners}`,
    "",
    "🤖 Verdict:",
    payload.reasoning,
  ].join("\n");
}

export function formatBetPlacedMessage(payload: BetPlacedPayload) {
  return [
    "💰 BET PLACED",
    "",
    `Match: ${payload.match}`,
    `Stake: $${payload.amount}`,
    `Odds: ${payload.odds}`,
    `Strategy: ${payload.strategy}`,
  ].join("\n");
}

export function formatResultMessage(payload: BetResultPayload) {
  const pnl = `${payload.pnl >= 0 ? "+" : ""}$${payload.pnl.toFixed(2)}`;
  return [
    payload.pnl >= 0 ? "✅ WIN" : "❌ LOSS",
    "",
    `Match: ${payload.match}`,
    `Result: ${payload.score}`,
    `P/L: ${pnl}`,
  ].join("\n");
}

export function formatStatusMessage() {
  const state = getSystemState();
  const dailyPnl = getDailyPnl();
  const winRate = getWinRate();
  return [
    "📊 LAMBOR STATUS",
    "",
    `Active: ${state.isRunning ? "YES" : "NO"}`,
    `Open Bets: ${state.activeBets.length}`,
    `Daily P/L: $${dailyPnl.toFixed(2)}`,
    `Win Rate: ${winRate.toFixed(1)}%`,
  ].join("\n");
}

export async function handleTelegramCommand(update: TelegramUpdate) {
  const text = update.message?.text?.trim() ?? "";
  const chatId = update.message?.chat?.id;
  if (!text.startsWith("/")) return { handled: false as const };
  if (!isAdminChat(chatId)) return { handled: true as const, ignored: true as const };

  const state = getSystemState();
  switch (text.split(" ")[0]) {
    case "/start":
    case "/resume": {
      resumeSystem();
      await sendTelegramMessage("✅ LAMBOR resumed. Scanner and betting engine are active.", chatId);
      return { handled: true as const };
    }
    case "/pause": {
      pauseSystem();
      await sendTelegramMessage("⏸ LAMBOR paused. Betting and scanning halted.", chatId);
      return { handled: true as const };
    }
    case "/status": {
      await sendTelegramMessage(formatStatusMessage(), chatId);
      return { handled: true as const };
    }
    case "/bets": {
      const lines =
        state.activeBets.length === 0
          ? ["No active bets."]
          : state.activeBets.slice(0, 10).map((bet) => `• ${bet.match} | $${bet.amount} @ ${bet.odds} (${bet.strategy})`);
      await sendTelegramMessage(["🎫 ACTIVE BETS", "", ...lines].join("\n"), chatId);
      return { handled: true as const };
    }
    case "/history": {
      const lines =
        state.history.length === 0
          ? ["No settled bets yet."]
          : state.history.slice(0, 10).map((item) => `• ${item.match} | ${item.result} | ${item.pnl >= 0 ? "+" : ""}$${item.pnl.toFixed(2)}`);
      await sendTelegramMessage(["📚 LAST 10 RESULTS", "", ...lines].join("\n"), chatId);
      return { handled: true as const };
    }
    case "/rejections": {
      const lines =
        state.rejections.length === 0
          ? ["No rejections logged."]
          : state.rejections
              .slice(0, 10)
              .map((item) => `• ${item.match} | ${item.confidence}% | ${item.reason}`);
      await sendTelegramMessage(["🚫 REJECTED OPPORTUNITIES", "", ...lines].join("\n"), chatId);
      return { handled: true as const };
    }
    default: {
      await sendTelegramMessage(
        "Unknown command. Use: /start /pause /resume /status /bets /history /rejections",
        chatId,
      );
      return { handled: true as const };
    }
  }
}
