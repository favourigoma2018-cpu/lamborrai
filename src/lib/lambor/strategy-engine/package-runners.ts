import { evaluateMatch } from "@/lib/lambor-ai/engine";
import { isLiveInPlayMatch } from "@/lib/lambor-ai/live-status";
import { liveMatchToAnalyticsInput } from "@/lib/lambor/live-match-analytics";
import { getStrategyPriorWinRate } from "@/lib/lambor/strategy-engine/package-learning";
import type { StrategyPackageId } from "@/lib/lambor/strategy-packages/metadata";
import type { LiveMatch } from "@/types/live-matches";

import { buildGlobalSignals } from "./signals";
import { buildMatchFeatures } from "./features";
import { evaluateMatchUnified } from "./unified-evaluate";
import type { StrategyScanRow } from "@/lib/lambor/strategy-packages/result-types";
import type { RiskTier, StrategyEngineContext, UnifiedDecision } from "./types";

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function parseOdds(odds: string): number {
  const n = Number.parseFloat(odds);
  return Number.isFinite(n) && n > 1 ? n : 1.5;
}

function defaultOdds(): string {
  return "1.50";
}

function riskFromConf(c: number): RiskTier {
  if (c >= 85) return "LOW";
  if (c >= 70) return "MEDIUM";
  return "HIGH";
}

function tier(c: number): UnifiedDecision {
  if (c >= 80) return "BET";
  if (c >= 60) return "WATCH";
  return "NO_BET";
}

function labelFor(decision: UnifiedDecision, c: number): StrategyScanRow["label"] {
  if (decision === "BET") return "HIGH CONFIDENCE";
  if (decision === "WATCH") return "MEDIUM";
  return c < 60 ? "HIGH RISK" : "RISKY";
}

function toRow(
  match: LiveMatch,
  market: string,
  odds: string,
  confidence: number,
  decision: UnifiedDecision,
  momentumScore: number,
  totalXg: number,
  oddsTrend: StrategyScanRow["oddsTrend"],
): StrategyScanRow {
  return {
    match,
    matchId: match.id,
    teams: `${match.homeTeam} vs ${match.awayTeam}`,
    market,
    odds,
    confidence: Number(confidence.toFixed(1)),
    risk: riskFromConf(confidence),
    decision,
    label: labelFor(decision, confidence),
    momentumScore,
    totalXg,
    oddsTrend,
  };
}

function learning(ctx: StrategyEngineContext, id: StrategyPackageId) {
  return ctx.getPackageLearningBoost?.(id) ?? 0;
}

/** under_2_5_ht — multi-factor, not goals-only. */
export function runUnder25Ht(
  matches: LiveMatch[],
  ctx: StrategyEngineContext,
  id: StrategyPackageId,
  strict: "2.5" | "1.5",
): StrategyScanRow[] {
  const maxMinute = strict === "1.5" ? 40 : 45;
  const maxGoals = strict === "1.5" ? 1 : 2;
  const betThreshold = strict === "1.5" ? 80 : 75;
  const learn = learning(ctx, id);

  const rows: StrategyScanRow[] = [];

  for (const match of matches) {
    const minute = match.minute ?? 0;
    if (minute >= maxMinute) continue;

    const input = liveMatchToAnalyticsInput(match);
    if (input.homeGoals + input.awayGoals > maxGoals) continue;

    const oddsStr = ctx.getOddsForMatch(match) ?? defaultOdds();
    const current = Number.parseFloat(oddsStr);
    const oc = Number.isFinite(current) && current > 1 ? current : 1.75;
    const open = ctx.oddsOpenByMatchId?.get(match.id) ?? oc * 1.03;
    const features = buildMatchFeatures(match, oc, open);
    const signals = buildGlobalSignals(match, ctx);

    const sot = signals.shotsOnTargetTotal;
    const da = signals.dangerousAttacksTotal;

    if (strict === "2.5") {
      if (sot >= 5) continue;
      if (da >= 22) continue;
    } else {
      if (sot > 3) continue;
      if (da >= 16) continue;
    }

    let confidence = strict === "1.5" ? 75 : 70;
    if (da < (strict === "1.5" ? 10 : 14)) confidence += 10;
    if (Math.abs(signals.possessionHome - signals.possessionAway) < 14) confidence += 5;
    if (signals.gamePace >= 55) confidence += 4;
    const unified = evaluateMatchUnified(match, ctx, {
      wantLowXg: true,
      learningBoost: learn,
    });
    confidence = clamp(confidence * 0.55 + unified.confidence * 0.45);

    let finalDecision: UnifiedDecision = "NO_BET";
    if (confidence >= betThreshold) finalDecision = "BET";
    else if (confidence >= 60) finalDecision = "WATCH";

    rows.push(
      toRow(
        match,
        strict === "1.5" ? "Under 1.5 HT (strict)" : "Under 2.5 HT",
        oddsStr,
        confidence,
        finalDecision,
        unified.momentumScore,
        features.totalXg,
        signals.oddsMovement.trend,
      ),
    );
  }

  rows.sort((a, b) => b.confidence - a.confidence);
  return rows.slice(0, 5);
}

const MODERATE_UNDERS_DAILY_LOSS_GUARD_USD = 15;

function normalizePressureIndex(
  shotsOnTarget: number,
  dangerousAttacks: number,
  corners: number,
  possessionSwing: number,
): number {
  const nSot = clamp((shotsOnTarget / 18) * 100, 0, 100);
  const nDa = clamp((dangerousAttacks / 90) * 100, 0, 100);
  const nCor = clamp((corners / 12) * 100, 0, 100);
  const nSwing = clamp((possessionSwing / 50) * 100, 0, 100);
  return nSot * 0.4 + nDa * 0.3 + nCor * 0.2 + nSwing * 0.1;
}

/** Live Under 2.5 FT — minutes 25–28 & 70–73 only; GREEN/YELLOW; no API calls. */
export function runModerateUndersLive(
  matches: LiveMatch[],
  ctx: StrategyEngineContext,
  id: StrategyPackageId,
): StrategyScanRow[] {
  if ((ctx.dailyLossUsd ?? 0) >= MODERATE_UNDERS_DAILY_LOSS_GUARD_USD) return [];

  const blocked =
    ctx.blockedLeagueIds instanceof Set ? ctx.blockedLeagueIds : new Set(ctx.blockedLeagueIds ?? []);

  const prior = ctx.getStrategyPriorWinRate?.(id) ?? getStrategyPriorWinRate(id);
  const rows: StrategyScanRow[] = [];

  for (const match of matches) {
    if (!isLiveInPlayMatch(match)) continue;
    const lid = match.leagueId;
    if (lid != null && blocked.has(lid)) continue;

    const minute = match.minute ?? 0;
    if (!(minute >= 25 && minute <= 28) && !(minute >= 70 && minute <= 73)) continue;

    const goalsTotal = (match.goalsHome ?? 0) + (match.goalsAway ?? 0);
    if (goalsTotal > 2) continue;

    const oddsStr = ctx.getOddsForMatch(match);
    const current = Number.parseFloat(oddsStr);
    const oc = Number.isFinite(current) && current > 1 ? current : 1.75;
    const open = ctx.oddsOpenByMatchId?.get(match.id) ?? oc * 1.03;
    const features = buildMatchFeatures(match, oc, open);
    const signals = buildGlobalSignals(match, ctx);

    if (signals.totalShotsTotal > 18) continue;

    const corners = (match.cornersHome ?? 0) + (match.cornersAway ?? 0);
    if (corners > 10) continue;

    if (signals.redCardsTotal > 0) continue;

    const possessionSwing = Math.abs(signals.possessionHome - signals.possessionAway);
    const pressure = normalizePressureIndex(
      signals.shotsOnTargetTotal,
      signals.dangerousAttacksTotal,
      corners,
      possessionSwing,
    );

    const confidence = clamp((100 - pressure) * 0.6 + prior * 0.4, 0, 100);
    if (confidence < 65) continue;

    const band: "GREEN" | "YELLOW" = confidence >= 80 ? "GREEN" : "YELLOW";

    const bankroll = ctx.bankrollUsd ?? 1000;
    const baseUnit = bankroll / 5;
    const stake = baseUnit * (confidence / 100);
    const flagForApproval = stake > 25;

    const reason =
      pressure < 40 ? "Low pressure, stable match tempo" : "Moderate tempo; gates and prior favor Under 2.5";

    rows.push({
      match,
      matchId: match.id,
      teams: `${match.homeTeam} vs ${match.awayTeam}`,
      market: "Under 2.5 FT (moderate live)",
      odds: oddsStr,
      confidence: Number(confidence.toFixed(1)),
      risk: band === "GREEN" ? "LOW" : "MEDIUM",
      decision: "BET",
      label: band === "GREEN" ? "HIGH CONFIDENCE" : "MEDIUM",
      momentumScore: signals.gamePace,
      totalXg: features.totalXg,
      oddsTrend: signals.oddsMovement.trend,
      liveRiskBand: band,
      stakeSuggested: Number(stake.toFixed(2)),
      flagForApproval,
      tacticalReason: reason,
      scanMinute: minute,
    });
  }

  rows.sort((a, b) => b.confidence - a.confidence);
  return rows.slice(0, 8);
}

export function runNoGoalLast15(matches: LiveMatch[], ctx: StrategyEngineContext, id: StrategyPackageId): StrategyScanRow[] {
  const learn = learning(ctx, id);
  const rows: StrategyScanRow[] = [];

  for (const match of matches) {
    const minute = match.minute ?? 0;
    if (minute < 75) continue;

    const oddsStr = ctx.getOddsForMatch(match) ?? defaultOdds();
    const current = Number.parseFloat(oddsStr);
    const oc = Number.isFinite(current) && current > 1 ? current : 1.75;
    const open = ctx.oddsOpenByMatchId?.get(match.id) ?? oc * 1.03;
    const features = buildMatchFeatures(match, oc, open);
    const signals = buildGlobalSignals(match, ctx);

    if (signals.attackingPressure > 52) continue;

    let confidence = 65;
    if (signals.shotsOnTargetTotal < 4) confidence += 10;
    if (signals.gamePace >= 58) confidence += 5;

    const unified = evaluateMatchUnified(match, ctx, { wantLowXg: true, learningBoost: learn });
    confidence = clamp(confidence * 0.5 + unified.confidence * 0.45 + learn * 0.1);

    if (confidence < 70) continue;

    const finalDecision: UnifiedDecision = confidence >= 80 ? "BET" : confidence >= 60 ? "WATCH" : "NO_BET";

    rows.push(
      toRow(
        match,
        "No goal / low chaos (75'+)",
        oddsStr,
        confidence,
        finalDecision,
        unified.momentumScore,
        features.totalXg,
        signals.oddsMovement.trend,
      ),
    );
  }

  rows.sort((a, b) => b.confidence - a.confidence);
  return rows.slice(0, 5);
}

export function runLamborGeneral(matches: LiveMatch[], ctx: StrategyEngineContext, id: StrategyPackageId): StrategyScanRow[] {
  const learn = learning(ctx, id);
  const rows: StrategyScanRow[] = [];

  for (const match of matches) {
    const oddsStr = ctx.getOddsForMatch(match) ?? defaultOdds();
    const unified = evaluateMatchUnified(match, ctx, { wantLowXg: false, learningBoost: learn });
    const input = liveMatchToAnalyticsInput(match);
    const engine = evaluateMatch(input, ctx.profile);

    const blended = clamp(unified.confidence * 0.55 + engine.confidence * 0.45 + learn * 0.1);
    const finalDecision: UnifiedDecision = blended >= 80 ? "BET" : blended >= 60 ? "WATCH" : "NO_BET";

    rows.push(
      toRow(
        match,
        `Lambor: ${engine.strategyUsed.replace(/_/g, " ")}`,
        oddsStr,
        blended,
        finalDecision,
        unified.momentumScore,
        unified.features.totalXg,
        unified.signals.oddsMovement.trend,
      ),
    );
  }

  rows.sort((a, b) => {
    const pri = (r: StrategyScanRow) => (r.decision === "BET" ? 4 : r.decision === "WATCH" ? 2 : 0) - (r.risk === "LOW" ? 1 : 0);
    if (pri(a) !== pri(b)) return pri(b) - pri(a);
    return b.confidence - a.confidence;
  });

  return rows.slice(0, 5);
}

export function pickTwoOddsCombo(
  matches: LiveMatch[],
  ctx: StrategyEngineContext,
  legCount: 2 | 3,
  targetMid: number,
): { rows: StrategyScanRow[]; combined: number } {
  type Pool = { match: LiveMatch; o: number; oddsStr: string; row: StrategyScanRow };
  const pool: Pool[] = [];

  for (const match of matches) {
    const oddsStr = ctx.getOddsForMatch(match) ?? defaultOdds();
    const o = parseOdds(oddsStr);
    if (o < 1.3 || o > 1.6) continue;
    const unified = evaluateMatchUnified(match, ctx, { wantLowXg: false, learningBoost: learning(ctx, "two_odds_combo") });
    if (unified.confidence < 72) continue;

    const oddsStrSafe = oddsStr;
    const row = toRow(
      match,
      `Combo leg @ ${oddsStrSafe}`,
      oddsStrSafe,
      unified.confidence,
      tier(unified.confidence),
      unified.momentumScore,
      unified.features.totalXg,
      unified.signals.oddsMovement.trend,
    );
    pool.push({ match, o, oddsStr: oddsStrSafe, row });
  }

  pool.sort((a, b) => b.row.confidence - a.row.confidence);

  const n = pool.length;
  let best: Pool[] | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  if (legCount === 2) {
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const product = pool[i].o * pool[j].o;
        const dist = Math.abs(product - targetMid);
        if (dist < bestDist) {
          bestDist = dist;
          best = [pool[i], pool[j]];
        }
      }
    }
  } else {
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        for (let k = j + 1; k < n; k += 1) {
          const product = pool[i].o * pool[j].o * pool[k].o;
          const dist = Math.abs(product - targetMid);
          if (dist < bestDist) {
            bestDist = dist;
            best = [pool[i], pool[j], pool[k]];
          }
        }
      }
    }
  }

  if (!best || best.length < legCount) {
    const fallback = runLamborGeneral(matches, ctx, "two_odds_combo").slice(0, legCount);
    const combined = fallback.reduce((acc, r) => acc * parseOdds(r.odds), 1);
    return { rows: fallback, combined };
  }

  const rows = best.map((p) => p.row);
  const combined = rows.reduce((acc, r) => acc * parseOdds(r.odds), 1);
  return { rows, combined };
}

export function runThreeInOne(matches: LiveMatch[], ctx: StrategyEngineContext): { rows: StrategyScanRow[]; combined: number | undefined } {
  const learn = learning(ctx, "three_in_one");
  const rows: StrategyScanRow[] = [];

  for (const match of matches) {
    const oddsStr = ctx.getOddsForMatch(match) ?? defaultOdds();
    const unified = evaluateMatchUnified(match, ctx, { wantLowXg: false, learningBoost: learn });
    if (unified.confidence < 75 || unified.risk !== "LOW") continue;

    rows.push(
      toRow(
        match,
        "Safe leg (high conf / low risk)",
        oddsStr,
        unified.confidence,
        tier(unified.confidence),
        unified.momentumScore,
        unified.features.totalXg,
        unified.signals.oddsMovement.trend,
      ),
    );
  }

  rows.sort((a, b) => b.confidence - a.confidence);
  const top = rows.slice(0, 3);
  if (top.length < 2) {
    const loose = runLamborGeneral(matches, ctx, "three_in_one")
      .filter((r) => r.confidence >= 72 && r.risk !== "HIGH")
      .slice(0, 3);
    const combined =
      loose.length >= 2 ? loose.reduce((acc, r) => acc * parseOdds(r.odds), 1) : undefined;
    return { rows: loose, combined };
  }

  const combined = top.reduce((acc, r) => acc * parseOdds(r.odds), 1);
  return { rows: top, combined };
}
