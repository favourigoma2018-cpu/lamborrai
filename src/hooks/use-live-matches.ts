"use client";

import { useEffect, useState } from "react";

import type { LiveMatch } from "@/types/live-matches";

type UseLiveMatchesResult = {
  matches: LiveMatch[];
  loading: boolean;
  error: string | null;
};

type LiveMatchesApiResponse =
  | LiveMatch[]
  | {
      matches?: LiveMatch[];
      degraded?: boolean;
      warning?: string;
    };

export function useLiveMatches(intervalMs = 12_000): UseLiveMatchesResult {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return { matches, loading, error };
}
