import { NextResponse } from "next/server";

import { sendTelegramMessage } from "@/lib/telegram/bot";
import { pauseSystem } from "@/lib/telegram/system-state";

export async function POST() {
  const state = pauseSystem();
  await sendTelegramMessage("⏸ LAMBOR paused from backend API.");
  return NextResponse.json({ ok: true, isRunning: state.isRunning }, { status: 200 });
}
