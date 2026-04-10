"use client";

import type { BetOrderData } from "@azuro-org/toolkit";
import { Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";

import { executeCommand, parseCommand } from "@/lib/lambor-ai/chat-action-engine";
import { readBetResults, readLearningProfile } from "@/lib/lambor-ai/learning";
import { buildContext } from "@/lib/lambor-ai/mind-context";
import { generateMindResponse, type MindResponseMetadata } from "@/lib/lambor-ai/mind-response";
import {
  allDecisionCardsFromCache,
  classifyBetQuery,
  computeSuggestions,
  filterSuggestionsForQuery,
  type BetSuggestion,
} from "@/lib/lambor-ai/suggestions-engine";
import type { LiveMatch } from "@/types/live-matches";

const panelClass =
  "rounded-2xl border border-zinc-700/70 bg-zinc-900/55 p-4 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_30px_rgba(0,0,0,0.35)]";

export type LamborMindChatProps = {
  liveMatches: LiveMatch[];
  liveLoading: boolean;
  liveError: string | null;
  lastUpdated: number | null;
  refetchLiveMatches: () => Promise<void>;
  azuroOrders: BetOrderData[];
  onOpenBetTab: () => void;
};

type MindChatRow =
  | { role: "user"; text: string; ts?: string }
  | {
      role: "assistant";
      kind?: "text";
      text: string;
      timestamp?: string;
      metadata?: MindResponseMetadata;
      highlight?: string;
    }
  | {
      role: "assistant";
      kind: "suggestions";
      intro: string;
      items: BetSuggestion[];
      timestamp: string;
      sourceCacheKey: string;
      filterNote?: string;
    };

const LAMBOR_MIND_WELCOME: MindChatRow = {
  role: "assistant",
  kind: "text",
  text: "Lambor Mind ranks live cache rows through every strategy, then surfaces BET tickets ≥70% confidence. Ask: “Best bets now”, “Show safe bets”, “2 odds combo”, “Late goal risk”, or use Place bet / Status. AUTO and EXECUTE placement are not enabled in this build.",
  metadata: { mode: "general" },
};

const TEN_MIN_MS = 10 * 60 * 1000;

export function LamborMindChat({
  liveMatches,
  liveLoading,
  liveError,
  lastUpdated,
  refetchLiveMatches,
  azuroOrders,
  onOpenBetTab,
}: LamborMindChatProps) {
  const [chatMessages, setChatMessages] = useState<MindChatRow[]>(() => [{ ...LAMBOR_MIND_WELCOME }]);
  const [chatDraft, setChatDraft] = useState("");
  const [pendingCommand, setPendingCommand] = useState<ReturnType<typeof parseCommand> | null>(null);
  const [executing, setExecuting] = useState(false);
  const [mindThinking, setMindThinking] = useState(false);
  const [suggestions, setSuggestions] = useState<BetSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const { address: connectedAddress } = useAccount();

  const decisionCards = useMemo(
    () => allDecisionCardsFromCache(liveMatches, readLearningProfile()),
    [liveMatches],
  );

  useEffect(() => {
    setSuggestionsLoading(true);
    try {
      const profile = readLearningProfile();
      const { suggestions: next, cacheKey } = computeSuggestions(liveMatches, profile);
      setSuggestions(next);
      setChatMessages((prev) => {
        const already = prev.some(
          (row) =>
            row.role === "assistant" &&
            row.kind === "suggestions" &&
            "sourceCacheKey" in row &&
            row.sourceCacheKey === cacheKey,
        );
        if (already) return prev;
        const ts = new Date().toISOString();
        return [
          ...prev,
          {
            role: "assistant",
            kind: "suggestions",
            intro: "Top opportunities right now:",
            items: next,
            timestamp: ts,
            sourceCacheKey: cacheKey,
            filterNote:
              next.length === 0
                ? "No BET signals cleared the bar (confidence ≥ 70, engine BET) on the current in-play cache slice."
                : undefined,
          },
        ];
      });
    } finally {
      setSuggestionsLoading(false);
    }
  }, [liveMatches, lastUpdated]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refetchLiveMatches();
    }, TEN_MIN_MS);
    return () => window.clearInterval(id);
  }, [refetchLiveMatches]);

  async function runPendingCommand(command: ReturnType<typeof parseCommand>) {
    setExecuting(true);
    const ts = new Date().toISOString();
    setChatMessages((prev) => [...prev, { role: "assistant", kind: "text", text: "Processing transaction…", timestamp: ts }]);
    try {
      const withdrawAddress =
        typeof window === "undefined"
          ? ""
          : (window.localStorage.getItem("lambor.wallet.withdrawAddress.v1") ?? "");
      const result = await executeCommand(command, {
        activeWalletAddress: connectedAddress ?? null,
        withdrawAddress,
        liveMatches,
        onOpenBetTab,
        getStatusSummary: () =>
          suggestions.length === 0
            ? "No ranked BET opportunities in the current cache window."
            : `${suggestions.length} ranked BET opportunities available (see Mind list).`,
      });
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", kind: "text", text: result.message, timestamp: new Date().toISOString() },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", kind: "text", text: "Command execution failed.", timestamp: new Date().toISOString() },
      ]);
    } finally {
      setExecuting(false);
      setPendingCommand(null);
    }
  }

  async function sendMindChat() {
    const text = chatDraft.trim().replace(/\s+/g, " ");
    if (!text) return;
    setChatDraft("");
    setChatMessages((prev) => [...prev, { role: "user", text, ts: new Date().toISOString() }]);

    if (pendingCommand && /^yes$/i.test(text)) {
      await runPendingCommand(pendingCommand);
      return;
    }
    if (pendingCommand && /^(no|cancel)$/i.test(text)) {
      setPendingCommand(null);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", kind: "text", text: "Cancelled. No action executed.", timestamp: new Date().toISOString() },
      ]);
      return;
    }

    const betKind = classifyBetQuery(text);
    if (betKind) {
      const filtered = filterSuggestionsForQuery(betKind, suggestions);
      const note =
        filtered.length === 0
          ? "Nothing in the current ranked set matched that filter. Try refreshing the cache or widening the query."
          : undefined;
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          kind: "suggestions",
          intro:
            betKind === "safe"
              ? "Safer skew (LOW engine risk):"
              : betKind === "combo"
                ? "~2.0 odds band:"
                : betKind === "late_risk"
                  ? "Late-goal / volatility-linked rows:"
                  : "Top opportunities right now:",
          items: filtered,
          timestamp: new Date().toISOString(),
          sourceCacheKey: `cmd:${betKind}:${Date.now()}`,
          filterNote: note,
        },
      ]);
      return;
    }

    const command = parseCommand(text);
    if (command.intent === "unknown") {
      setMindThinking(true);
      queueMicrotask(() => {
        const ctx = buildContext({
          azuroOrders,
          betResults: readBetResults(),
          profile: readLearningProfile(),
          decisionCards,
          liveMatches,
        });
        const payload = generateMindResponse(text, ctx, decisionCards);
        setMindThinking(false);
        setChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            kind: "text" as const,
            text: payload.text,
            timestamp: payload.timestamp,
            metadata: payload.metadata,
            highlight: payload.highlight,
          },
        ]);
      });
      return;
    }

    setPendingCommand(command);
    const confirmationText =
      command.intent === "hedge"
        ? `Confirm hedge ${command.percentage ?? "-"}% ${command.market ?? ""}?`
        : command.intent === "place_bet"
          ? `Confirm bet execution for ${command.market ?? "selected market"}?`
          : command.intent === "withdraw"
            ? `Confirm withdraw ${command.amount ?? "-"}?`
            : command.intent === "deposit"
              ? `Confirm deposit ${command.amount ?? "-"}?`
              : "Run status check now?";
    setChatMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        kind: "text",
        text: `${confirmationText} Reply \"yes\" or \"no\".`,
        timestamp: new Date().toISOString(),
      },
    ]);
  }

  return (
    <div className="space-y-4">
      {liveError ? (
        <div className={`${panelClass} border-amber-500/35 bg-amber-500/10 text-xs text-amber-100`}>{liveError}</div>
      ) : null}
      {liveLoading && suggestionsLoading ? (
        <p className="text-center text-xs text-zinc-500">Syncing live cache…</p>
      ) : null}

      <div className={panelClass}>
        <p className="mb-3 text-xs uppercase tracking-[0.18em] text-zinc-400">Lambor Mind</p>
        <div className="max-h-[min(60vh,28rem)] space-y-2 overflow-y-auto pr-1">
          {chatMessages.map((m, index) => {
            if (m.role === "user") {
              return (
                <div
                  key={`u-${index}-${m.text.slice(0, 20)}`}
                  className="max-w-[86%] rounded-xl border border-zinc-700 bg-zinc-900/80 p-2.5 text-xs text-zinc-300"
                >
                  <p>{m.text}</p>
                  {m.ts ? <p className="mt-1 text-[10px] text-zinc-600">{new Date(m.ts).toLocaleTimeString()}</p> : null}
                </div>
              );
            }
            if (m.kind === "suggestions") {
              return (
                <div
                  key={`s-${index}-${m.timestamp}`}
                  className="ml-auto max-w-[94%] rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3 text-xs text-emerald-100"
                >
                  <p className="font-semibold text-zinc-100">{m.intro}</p>
                  {m.filterNote ? <p className="mt-1 text-[11px] text-zinc-400">{m.filterNote}</p> : null}
                  <ul className="mt-2 space-y-2">
                    {m.items.map((s, j) => (
                      <li
                        key={`${s.match}-${j}`}
                        className="rounded-lg border border-zinc-700/80 bg-zinc-950/50 p-2.5 text-[11px] text-zinc-300"
                      >
                        <p className="font-semibold text-zinc-100">{s.match}</p>
                        <p className="mt-0.5 text-emerald-200/90">Bet · {s.bet}</p>
                        <p className="mt-1 tabular-nums text-zinc-400">
                          Odds ~{s.odds.toFixed(2)} · Confidence {s.confidence}% · Risk {s.riskLevel} · Odds quality{" "}
                          {s.oddsQuality.toFixed(0)}
                        </p>
                        <p className="mt-1 text-zinc-400">Why: {s.explanation}</p>
                        <p className="mt-1 text-[10px] text-zinc-500">Data: {s.dataTriggers}</p>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[10px] text-zinc-600">{new Date(m.timestamp).toLocaleString()}</p>
                </div>
              );
            }
            const decision = m.metadata?.decision;
            const decisionClass =
              decision === "APPROVE"
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                : decision === "REJECT"
                  ? "border-red-500/45 bg-red-500/10 text-red-200"
                  : decision === "CAUTION"
                    ? "border-amber-500/45 bg-amber-500/10 text-amber-100"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
            const bodyText =
              m.highlight && m.text.startsWith(m.highlight) ? m.text.slice(m.highlight.length).trim() : m.text;

            return (
              <div
                key={`a-${index}-${m.timestamp ?? index}`}
                className={`ml-auto max-w-[92%] rounded-xl border p-2.5 text-xs ${decisionClass}`}
              >
                {decision ? (
                  <span className="mb-1 inline-block rounded border border-current px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    {decision}
                  </span>
                ) : null}
                {m.metadata?.mode ? (
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Mode · {m.metadata.mode}</p>
                ) : null}
                {m.highlight ? (
                  <p className="border-l-2 border-emerald-500/70 pl-2 font-semibold leading-snug text-zinc-100">{m.highlight}</p>
                ) : null}
                <p className="mt-1 whitespace-pre-wrap leading-relaxed text-zinc-300">{bodyText}</p>
                {m.timestamp ? (
                  <p className="mt-1.5 text-[10px] text-zinc-600">{new Date(m.timestamp).toLocaleString()}</p>
                ) : null}
              </div>
            );
          })}
          {mindThinking ? (
            <div className="ml-auto max-w-[92%] rounded-xl border border-zinc-600 bg-zinc-900/60 px-3 py-2 text-[11px] text-zinc-400">
              <span className="inline-flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                Analyzing session context…
              </span>
            </div>
          ) : null}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMindChat();
          }}
        >
          <textarea
            value={chatDraft}
            onChange={(event) => setChatDraft(event.target.value)}
            rows={1}
            className="min-h-11 max-h-36 min-w-0 flex-1 resize-y rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-emerald-400 focus:shadow-[0_0_20px_rgba(0,255,163,0.25)]"
            placeholder="Best bets now, safe bets, patterns… or Place bet / Status"
            enterKeyHint="send"
            autoComplete="off"
            aria-label="Message to LAMBOR Mind"
          />
          <button
            type="submit"
            disabled={!chatDraft.trim() || executing || mindThinking}
            className="flex h-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-4 text-emerald-300 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        {pendingCommand ? (
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void runPendingCommand(pendingCommand)}
              disabled={executing}
              className="rounded-md border border-emerald-500/50 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 disabled:opacity-40"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingCommand(null);
                setChatMessages((prev) => [
                  ...prev,
                  {
                    role: "assistant",
                    kind: "text",
                    text: "Cancelled. No action executed.",
                    timestamp: new Date().toISOString(),
                  },
                ]);
              }}
              disabled={executing}
              className="rounded-md border border-zinc-600 px-2.5 py-1 text-[11px] font-semibold text-zinc-300 disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
