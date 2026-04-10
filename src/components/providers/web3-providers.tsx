"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";

import { AutoWithdrawOnWinListener } from "@/components/wallet/auto-withdraw-listener";
import { LamborWalletProvider } from "@/contexts/lambor-wallet-context";
import { wagmiConfig } from "@/lib/wagmi/config";

type Web3ProvidersProps = {
  children: ReactNode;
};

export function Web3Providers({ children }: Web3ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <LamborWalletProvider>
          {children}
          <AutoWithdrawOnWinListener />
        </LamborWalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
