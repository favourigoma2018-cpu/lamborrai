import { NextResponse } from "next/server";

type HedgeRequest = {
  market?: string;
  percentage?: number;
};

export async function POST(request: Request) {
  let body: HedgeRequest;
  try {
    body = (await request.json()) as HedgeRequest;
  } catch {
    return NextResponse.json({ message: "Invalid hedge payload." }, { status: 400 });
  }

  const market = body.market?.trim() ?? "";
  const percentage = Number(body.percentage);
  if (!market) {
    return NextResponse.json({ message: "Market is required for hedge." }, { status: 400 });
  }
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
    return NextResponse.json({ message: "Percentage must be between 1 and 100." }, { status: 400 });
  }

  return NextResponse.json(
    {
      status: "completed",
      odds: "1.74",
      message: `Hedged ${percentage}% on ${market} at odds 1.74`,
    },
    { status: 200 },
  );
}

