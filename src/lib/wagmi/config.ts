import { http, createConfig } from "wagmi";
import { metaMask } from "wagmi/connectors";
import { polygon } from "wagmi/chains";

const polygonRpc =
  process.env.NEXT_PUBLIC_POLYGON_RPC?.trim() || "https://polygon-rpc.com";

/** Polygon mainnet only — MetaMask-only connector (no WalletConnect / generic injected). */
export const wagmiConfig = createConfig({
  chains: [polygon],
  connectors: [metaMask()],
  transports: {
    [polygon.id]: http(polygonRpc),
  },
  ssr: true,
});
