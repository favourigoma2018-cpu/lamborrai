import { NextResponse } from "next/server";
import { isAddress } from "viem";

type WithdrawRequest = {
  walletAddress?: string;
  withdrawAddress?: string;
  amount?: string;
};

export async function POST(request: Request) {
  let body: WithdrawRequest;
  try {
    body = (await request.json()) as WithdrawRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const walletAddress = body.walletAddress ?? "";
  const withdrawAddress = body.withdrawAddress ?? "";
  const amount = body.amount ?? "";
  const amountNum = Number.parseFloat(amount);

  if (!isAddress(walletAddress) || !isAddress(withdrawAddress)) {
    return NextResponse.json({ error: "Invalid wallet or withdraw address." }, { status: 400 });
  }
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return NextResponse.json({ error: "Amount must be greater than zero." }, { status: 400 });
  }

  // Backend settlement / signer queue integration point.
  // We return pending status so UI can poll once a real queue is connected.
  return NextResponse.json(
    {
      status: "pending",
      id: `wd_${Date.now()}`,
      walletAddress,
      withdrawAddress,
      amount: amountNum.toFixed(6),
    },
    { status: 200 },
  );
}

