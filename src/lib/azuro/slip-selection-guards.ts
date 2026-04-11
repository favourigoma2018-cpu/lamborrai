const LAMBOR_SYNTH = /^lambor:/i;

/** Azuro-backed slip leg: real condition/outcome ids, numeric odds, linked game id. */
export function isValidAzuroSlipSelection(s: {
  gameId?: string;
  conditionId: string;
  outcomeId: string;
  odds: string;
  executable?: boolean;
}): boolean {
  if (s.executable === false) return false;
  const gameId = s.gameId?.trim();
  const conditionId = s.conditionId?.trim();
  const outcomeId = s.outcomeId?.trim();
  const oddsRaw = s.odds?.trim();
  if (!gameId || !conditionId || !outcomeId || !oddsRaw) return false;
  if (LAMBOR_SYNTH.test(conditionId) || LAMBOR_SYNTH.test(outcomeId)) return false;
  const odds = Number.parseFloat(oddsRaw);
  if (!Number.isFinite(odds) || odds <= 1) return false;
  return true;
}

export function azuroSlipSelectionInvalidReason(s: {
  gameId?: string;
  conditionId: string;
  outcomeId: string;
  odds: string;
  executable?: boolean;
}): string | null {
  if (s.executable === false) return "This line is not mapped to an Azuro market.";
  if (!s.gameId?.trim()) return "Missing Azuro gameId — open a fixture linked to Azuro.";
  if (!s.conditionId?.trim()) return "Missing conditionId.";
  if (!s.outcomeId?.trim()) return "Missing outcomeId.";
  if (!s.odds?.trim()) return "Missing odds.";
  if (LAMBOR_SYNTH.test(s.conditionId) || LAMBOR_SYNTH.test(s.outcomeId)) {
    return "Invalid market ids (synthetic line).";
  }
  const odds = Number.parseFloat(s.odds);
  if (!Number.isFinite(odds) || odds <= 1) return "Invalid odds.";
  return null;
}
