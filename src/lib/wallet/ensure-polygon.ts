import { polygon } from "viem/chains";

const rpcUrl = process.env.NEXT_PUBLIC_POLYGON_RPC?.trim() || "https://polygon-rpc.com";

const POLYGON_HEX = `0x${polygon.id.toString(16)}` as const;

/**
 * Ensure the injected wallet is on Polygon (137). Uses `wallet_switchEthereumChain` then `wallet_addEthereumChain` if needed.
 */
export async function ensurePolygonWallet(): Promise<void> {
  if (typeof window === "undefined") return;
  const eth = (window as Window & { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } })
    .ethereum;
  if (!eth?.request) return;

  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: POLYGON_HEX }],
    });
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? (e as { code?: number }).code : undefined;
    if (code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: POLYGON_HEX,
            chainName: polygon.name,
            nativeCurrency: polygon.nativeCurrency,
            rpcUrls: [rpcUrl],
            blockExplorerUrls: polygon.blockExplorers?.default?.url
              ? [polygon.blockExplorers.default.url]
              : undefined,
          },
        ],
      });
      return;
    }
    throw e;
  }
}
