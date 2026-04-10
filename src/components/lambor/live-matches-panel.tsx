"use client";

import { AnimatePresence, motion } from "framer-motion";

import type { LiveMatch } from "@/types/live-matches";

type LiveMatchesPanelProps = {
  matches: LiveMatch[];
  loading: boolean;
  error: string | null;
  onBet?: (match: LiveMatch) => void;
  /** Shown when there are no rows (e.g. filtered list). */
  emptyMessage?: string;
};

export function LiveMatchesPanel({
  matches,
  loading,
  error,
  onBet,
  emptyMessage = "No live fixtures at the moment.",
}: LiveMatchesPanelProps) {
  if (loading) {
    return (
      <div className="space-y-2.5">
        <div className="h-10 animate-pulse rounded-xl bg-zinc-800/80" />
        <div className="h-10 animate-pulse rounded-xl bg-zinc-800/70" />
        <div className="h-10 animate-pulse rounded-xl bg-zinc-800/60" />
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-red-300">{error}</p>;
  }

  if (matches.length === 0) {
    return <p className="text-xs text-zinc-500">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {matches.slice(0, 6).map((match) => (
          <motion.div
            key={match.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl border border-emerald-500/25 bg-zinc-900/70 px-3 py-2.5 shadow-[0_0_18px_rgba(0,255,163,0.08)]"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-100">
                  {match.homeTeam} vs {match.awayTeam}
                </p>
                <p className="text-xs text-zinc-500">
                  {match.league} • {match.status} {match.minute ? `• ${match.minute}'` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <motion.span
                  key={`${match.id}-${match.score}`}
                  initial={{ scale: 1.2, opacity: 0.5 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-sm font-semibold text-emerald-300"
                >
                  {match.score}
                </motion.span>
                {onBet ? (
                  <button
                    type="button"
                    onClick={() => onBet(match)}
                    className="rounded-lg border border-emerald-400/60 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/10"
                  >
                    Bet
                  </button>
                ) : null}
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
