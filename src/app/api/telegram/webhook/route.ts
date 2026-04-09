import { NextResponse } from "next/server";

import { handleTelegramCommand } from "@/lib/telegram/bot";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  await handleTelegramCommand(payload as Parameters<typeof handleTelegramCommand>[0]);
  return NextResponse.json({ ok: true }, { status: 200 });
}
