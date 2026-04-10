import { http, createConfig } from "wagmi";
import { injected, metaMask, walletConnect } from "wagmi/connectors";
import { polygon } from "wagmi/chains";

import { targetChain } from "@/config/chain";

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

const connectors = [
  metaMask(),
  injected({ shimDisconnect: true }),
  ...(walletConnectProjectId
    ? [
        walletConnect({
          projectId: walletConnectProjectId,
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [targetChain, polygon],
  connectors,
  transports: {
    [targetChain.id]: http(),
    [polygon.id]: http(),
  },
  ssr: true,
});
