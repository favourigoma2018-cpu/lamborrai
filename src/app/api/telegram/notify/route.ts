import { NextResponse } from "next/server";

import {
  formatBetPlacedMessage,
  formatMatchDetectedMessage,
  formatResultMessage,
  formatStatusMessage,
  sendTelegramMessage,
  type BetPlacedPayload,
  type BetResultPayload,
  type MatchDetectedPayload,
} from "@/lib/telegram/bot";
import { addActiveBet, addRejection, settleBet } from "@/lib/telegram/system-state";

type NotifyBody =
  | { type: "MATCH_DETECTED"; payload: MatchDetectedPayload }
  | { type: "BET_PLACED"; payload: BetPlacedPayload & { id?: string } }
  | { type: "RESULT"; payload: BetResultPayload & { id?: string } }
  | { type: "STATUS" }
  | { type: "REJECTION"; payload: { match: string; confidence: number; reason: string } };

export async function POST(request: Request) {
  let body: NotifyBody;
  try {
    body = (await request.json()) as NotifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  switch (body.type) {
    case "MATCH_DETECTED": {
      await sendTelegramMessage(formatMatchDetectedMessage(body.payload));
      break;
    }
    case "BET_PLACED": {
      addActiveBet({
        id: body.payload.id ?? `${Date.now()}`,
        match: body.payload.match,
        amount: body.payload.amount,
        odds: body.payload.odds,
        strategy: body.payload.strategy,
        placedAt: new Date().toISOString(),
      });
      await sendTelegramMessage(formatBetPlacedMessage(body.payload));
      break;
    }
    case "RESULT": {
      settleBet(body.payload.id ?? "", body.payload.score, body.payload.pnl);
      await sendTelegramMessage(formatResultMessage(body.payload));
      break;
    }
    case "STATUS": {
      await sendTelegramMessage(formatStatusMessage());
      break;
    }
    case "REJECTION": {
      addRejection({
        id: `${Date.now()}`,
        match: body.payload.match,
        confidence: body.payload.confidence,
        reason: body.payload.reason,
        createdAt: new Date().toISOString(),
      });
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown event type." }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
