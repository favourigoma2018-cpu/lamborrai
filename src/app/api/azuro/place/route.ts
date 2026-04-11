import { createBet, createComboBet, type CreateBetParams, type CreateComboBetParams } from "@azuro-org/toolkit";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function isComboBody(body: Record<string, unknown>): body is CreateComboBetParams {
  return Array.isArray(body.bets) && body.bets.length >= 2 && Boolean(body.signature);
}

function isOrdinaryBody(body: Record<string, unknown>): body is CreateBetParams {
  return Boolean(body.bet && body.signature && body.account && body.clientData);
}

/**
 * Relays signed orders to Azuro’s relayer API (`createBet` / `createComboBet`).
 * Request body must match what the wallet signed (especially `clientData`).
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be an object." }, { status: 400 });
  }

  try {
    if (isComboBody(body)) {
      const result = await createComboBet(body);
      return NextResponse.json(result);
    }
    if (isOrdinaryBody(body)) {
      const result = await createBet(body);
      return NextResponse.json(result);
    }
    return NextResponse.json(
      { error: "Expected ordinary bet (account, signature, bet, clientData) or signed combo payload." },
      { status: 400 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Azuro relay failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
