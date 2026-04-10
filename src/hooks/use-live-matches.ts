"use client";

import { useCallback, useEffect, useState } from "react";

import type { LiveMatch } from "@/types/live-matches";

type UseLiveMatchesResult = {
  matches: LiveMatch[];
  loading: boolean;
  error: string | null;
  /** Server cache timestamp (ms); API-Football refresh is ~10 min shared. */
  lastUpdated: number | null;
  /** Re-fetch from `/api/live-matches` (same cache headers server-side). */
  refetch: () => Promise<void>;
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

  const loadOnce = useCallback(async (): Promise<void> => {
    const response = await fetch("/api/live-matches", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Live feed request failed (${response.status}).`);
    }
    const payload = (await response.json()) as LiveMatchesApiResponse;
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
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      await loadOnce();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch live matches.");
    } finally {
      setLoading(false);
    }
  }, [loadOnce]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        await loadOnce();
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to fetch live matches.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, intervalMs);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [intervalMs, loadOnce]);

  return { matches, loading, error, lastUpdated, refetch };
}
