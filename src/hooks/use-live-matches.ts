"use client";

import { useEffect, useState } from "react";

import type { LiveMatch } from "@/types/live-matches";

type UseLiveMatchesResult = {
  matches: LiveMatch[];
  loading: boolean;
  error: string | null;
  /** Server cache timestamp (ms); API-Football refresh is ~10 min shared. */
  lastUpdated: number | null;
};

type LiveMatchesApiResponse =
  | LiveMatch[]
  | {
      matches?: LiveMatch[];
      lastUpdated?: number;
      refreshIntervalMs?: number;
      degraded?: boolean;
      warning?: string;
    };

/** Polls `/api/live-matches` only; upstream API-Football is cached ~10 min on the server. */
export function useLiveMatches(intervalMs = 30_000): UseLiveMatchesResult {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const response = await fetch("/api/live-matches", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Live feed request failed (${response.status}).`);
        }
        const payload = (await response.json()) as LiveMatchesApiResponse;
        if (!mounted) return;
        const parsedMatches = Array.isArray(payload) ? payload : (payload.matches ?? []);
        setMatches(parsedMatches);
        if (!Array.isArray(payload) && typeof payload.lastUpdated === "number") {
          setLastUpdated(payload.lastUpdated);
        } else if (Array.isArray(payload)) {
          setLastUpdated(null);
        }
        if (!Array.isArray(payload) && payload.degraded && parsedMatches.length === 0) {
          setError(payload.warning ?? "Live provider temporarily unavailable.");
        } else {
          setError(null);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to fetch live matches.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    const timer = window.setInterval(load, intervalMs);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [intervalMs]);

  return { matches, loading, error, lastUpdated };
}
