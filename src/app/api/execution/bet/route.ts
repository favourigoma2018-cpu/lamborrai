import { NextResponse } from "next/server";

type BetRequest = {
  market?: string;
};

export async function POST(request: Request) {
  let body: BetRequest;
  try {
    body = (await request.json()) as BetRequest;
  } catch {
    return NextResponse.json({ message: "Invalid bet payload." }, { status: 400 });
  }

  const market = body.market?.trim() ?? "";
  if (!market) {
    return NextResponse.json({ message: "Market is required." }, { status: 400 });
  }

  return NextResponse.json(
    {
      status: "pending",
      message: `Bet request received for ${market}.`,
    },
    { status: 200 },
  );
}

