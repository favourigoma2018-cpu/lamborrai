import { http, createConfig } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";

import { targetChain } from "@/config/chain";

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

const connectors = [
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
  chains: [targetChain],
  connectors,
  transports: {
    [targetChain.id]: http(),
  },
  ssr: true,
});
