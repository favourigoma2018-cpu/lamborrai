import { NextResponse } from "next/server";

type DepositRequest = {
  amount?: number;
};

export async function POST(request: Request) {
  let body: DepositRequest;
  try {
    body = (await request.json()) as DepositRequest;
  } catch {
    return NextResponse.json({ message: "Invalid deposit payload." }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ message: "Amount must be greater than zero." }, { status: 400 });
  }

  return NextResponse.json(
    {
      status: "pending",
      message: `Deposit request accepted for ${amount.toFixed(2)} MATIC.`,
    },
    { status: 200 },
  );
}

