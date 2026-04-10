import { NextResponse } from "next/server";
import { createPublicClient, formatEther, http, isAddress } from "viem";
import { polygon } from "viem/chains";

type WalletSummaryResponse = {
  address: string;
  network: "polygon";
  balance: {
    raw: string;
    formatted: string;
    symbol: "MATIC";
  };
  betHistory: Array<{
    id: string;
    match: string;
    market: string;
    stake: string;
    odds: string;
    status: "pending" | "won" | "lost";
    createdAt: string;
  }>;
};

const client = createPublicClient({
  chain: polygon,
  transport: http(process.env.POLYGON_RPC_URL || "https://polygon-rpc.com"),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address") ?? "";
  if (!isAddress(address)) {
    return NextResponse.json({ error: "Invalid Polygon address." }, { status: 400 });
  }

  const balance = await client.getBalance({ address });
  const payload: WalletSummaryResponse = {
    address,
    network: "polygon",
    balance: {
      raw: balance.toString(),
      formatted: Number.parseFloat(formatEther(balance)).toFixed(6),
      symbol: "MATIC",
    },
    // Indexer integration point (kept empty safely until backend feed is wired).
    betHistory: [],
  };

  return NextResponse.json(payload, { status: 200 });
}

