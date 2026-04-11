"use client";

type BetExecutionButtonProps = {
  isEmbedded?: boolean;
  canPrepare: boolean;
  canPlace: boolean;
  isPreparing: boolean;
  awaitingSignature: boolean;
  isPlacing: boolean;
  parlayRunning: boolean;
  onPrepare: () => void;
  onPlace: () => void;
  showCombo?: boolean;
  comboDisabled?: boolean;
  comboLabel?: string;
  onPlaceCombo?: () => void;
};

/**
 * Prepare → Sign (EIP-712) → Relay — primary Azuro bet actions.
 */
export function BetExecutionButton({
  isEmbedded = false,
  canPrepare,
  canPlace,
  isPreparing,
  awaitingSignature,
  isPlacing,
  parlayRunning,
  onPrepare,
  onPlace,
  showCombo = false,
  comboDisabled = false,
  comboLabel = "Sign & place combo",
  onPlaceCombo,
}: BetExecutionButtonProps) {
  return (
    <div className="space-y-2">
      <div className={`flex flex-col gap-2 ${isEmbedded ? "" : "sm:flex-row sm:items-stretch"}`}>
        <button
          type="button"
          onClick={onPrepare}
          disabled={!canPrepare || isPreparing}
          className={`w-full rounded-xl border border-zinc-600 bg-zinc-900/80 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/80 disabled:cursor-not-allowed disabled:opacity-50 ${isEmbedded ? "order-1" : ""}`}
        >
          {isPreparing ? "Preparing…" : "Prepare transaction"}
        </button>

        <button
          type="button"
          onClick={onPlace}
          disabled={!canPlace || parlayRunning}
          className={`w-full rounded-xl bg-emerald-500 px-4 py-3.5 text-sm font-bold text-zinc-950 shadow-[0_0_28px_rgba(0,255,163,0.35)] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45 ${isEmbedded ? "order-2 min-h-[48px]" : ""}`}
        >
          {awaitingSignature
            ? "Awaiting signature…"
            : isPlacing && !parlayRunning
              ? "Placing…"
              : "Sign & place bet"}
        </button>
      </div>

      {showCombo && onPlaceCombo ? (
        <button
          type="button"
          onClick={() => void onPlaceCombo()}
          disabled={comboDisabled || parlayRunning}
          className="w-full rounded-xl border-2 border-emerald-400/60 bg-emerald-600/95 px-4 py-3.5 text-sm font-bold text-white shadow-[0_0_24px_rgba(0,255,163,0.2)] transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {comboLabel}
        </button>
      ) : null}
    </div>
  );
}
