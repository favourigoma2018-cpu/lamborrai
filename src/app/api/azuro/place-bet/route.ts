import { NextResponse } from "next/server";

type PlaceBetRequest = {
  typedData: unknown;
  signature: string;
  amount: string;
  selection: {
    conditionId: string;
    outcomeId: string;
    odds: string;
  };
};

export async function POST(request: Request) {
  const endpoint = process.env.AZURO_ORDER_SUBMIT_URL;
  const apiKey = process.env.AZURO_ORDER_SUBMIT_API_KEY;

  if (!endpoint) {
    return NextResponse.json(
      { error: "AZURO_ORDER_SUBMIT_URL is not configured on server." },
      { status: 500 },
    );
  }

  let body: PlaceBetRequest;
  try {
    body = (await request.json()) as PlaceBetRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body?.typedData || !body?.signature) {
    return NextResponse.json({ error: "Missing required bet payload fields." }, { status: 400 });
  }

  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      typedData: body.typedData,
      bettorSignature: body.signature,
      amount: body.amount,
      selection: body.selection,
      client: "bet3",
    }),
    cache: "no-store",
  });

  let payload: unknown = null;
  try {
    payload = await upstream.json();
  } catch {
    payload = { error: "Failed to parse upstream response." };
  }

  if (!upstream.ok) {
    return NextResponse.json(
      {
        error: "Azuro order submission failed.",
        status: upstream.status,
        details: payload,
      },
      { status: 502 },
    );
  }

  return NextResponse.json(payload, { status: 200 });
}
