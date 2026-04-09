import { WalletControls } from "@/components/wallet/wallet-controls";

export function SiteHeader() {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-500">Azuro · Base Sepolia</p>
          <h1 className="text-xl font-bold text-zinc-100">Bet3 Sportsbook</h1>
        </div>
        <WalletControls />
      </div>
    </header>
  );
}
