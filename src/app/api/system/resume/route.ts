import { NextResponse } from "next/server";

import { sendTelegramMessage } from "@/lib/telegram/bot";
import { resumeSystem } from "@/lib/telegram/system-state";

export async function POST() {
  const state = resumeSystem();
  await sendTelegramMessage("▶️ LAMBOR resumed from backend API.");
  return NextResponse.json({ ok: true, isRunning: state.isRunning }, { status: 200 });
}
