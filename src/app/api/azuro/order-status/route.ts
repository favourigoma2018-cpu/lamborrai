import { NextResponse } from "next/server";

/**
 * Optional hook for syncing with Azuro order / bet state.
 * Configure `AZURO_ORDER_STATUS_URL` to proxy to your indexer or Azuro API.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");
  const txHash = searchParams.get("txHash");

  const upstream = process.env.AZURO_ORDER_STATUS_URL;
  if (!upstream) {
    return NextResponse.json({
      ok: true,
      configured: false,
      orderId,
      txHash,
      note: "Set AZURO_ORDER_STATUS_URL to verify on-chain settlement from a backend indexer.",
    });
  }

  try {
    const url = new URL(upstream);
    if (orderId) url.searchParams.set("orderId", orderId);
    if (txHash) url.searchParams.set("txHash", txHash);
    const res = await fetch(url.toString(), { cache: "no-store" });
    const payload = (await res.json()) as unknown;
    return NextResponse.json({ ok: res.ok, configured: true, upstreamStatus: res.status, payload }, { status: res.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Status fetch failed." },
      { status: 502 },
    );
  }
}
