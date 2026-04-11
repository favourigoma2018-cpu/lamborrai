import { NextResponse } from "next/server";
import type { Address } from "viem";

import { prepareBet } from "@/lib/azuro/prepareBet";

export const runtime = "nodejs";

function jsonSafe(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
}

/**
 * Optional server-side prepare — same output shape as client `prepareBet`.
 * Client may still call `prepareBet` locally; this route helps tools / SSR.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      account?: string;
      selection?: { conditionId: string; outcomeId: string; odds: string };
      amount?: string;
      coreAddress?: string;
    };

    const { account, selection, amount, coreAddress } = body;
    if (!account || !selection || amount == null || !coreAddress) {
      return NextResponse.json({ error: "Missing account, selection, amount, or coreAddress." }, { status: 400 });
    }

    const prepared = await prepareBet({
      account: account as Address,
      selection,
      amount: String(amount),
      coreAddress: coreAddress as Address,
    });

    return NextResponse.json(
      jsonSafe({
        calculation: prepared.calculation,
        fee: prepared.fee,
        typedData: prepared.typedData,
        relayBody: prepared.relayBody,
      }),
      { status: 200 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Prepare failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
