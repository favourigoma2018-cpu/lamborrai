# Bet3 - Azuro Sportsbook (Phase 0-1)

This repository contains the first implementation slice of a decentralized sportsbook UI powered by Azuro Protocol.

Current scope:
- Next.js App Router foundation
- Wallet connection with `wagmi` (injected + optional WalletConnect)
- Single-chain setup on Base Sepolia
- Server-side prematch games fetch with `@azuro-org/toolkit` `getGamesByFilters`

## Stack

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS 4
- `wagmi` + `viem` for wallet and chain interactions
- `@tanstack/react-query` for client caching
- `@azuro-org/toolkit` for Azuro feed access

## Environment Setup

1. Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

2. Add your WalletConnect Cloud project id (optional but recommended):

```env
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
AZURO_ORDER_SUBMIT_URL=https://<azuro-order-endpoint>
AZURO_ORDER_SUBMIT_API_KEY=optional_server_side_key
```

If this variable is missing, WalletConnect is disabled and injected wallets (for example MetaMask) still work.
Order submission is server-routed through `src/app/api/azuro/place-bet/route.ts`, so keep API credentials server-side only.

## Run Locally

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Project Structure

- `src/config/chain.ts` - active network config (Base Sepolia)
- `src/lib/wagmi/config.ts` - wagmi setup and connectors
- `src/components/providers/web3-providers.tsx` - React providers
- `src/components/wallet/wallet-controls.tsx` - connect/switch/disconnect UI
- `src/lib/azuro/fetch-games.ts` - prematch feed query
- `src/components/games/games-grid.tsx` - games display grid

## Phase 0-1 Deliverables

- [x] Next.js app scaffold
- [x] Wallet connection + network switch UX
- [x] Base Sepolia testnet configuration
- [x] Games listing from Azuro toolkit (`getGamesByFilters`)
- [x] Server-rendered page with loading error handling

## Next Phase (2)

- Condition details and odds updates
- Realtime refresh via feed/websocket strategy
- Bet slip foundation with selection state
