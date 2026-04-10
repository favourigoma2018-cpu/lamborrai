import type { MatchAnalyticsInput, StrategyName, StrategyResult } from "@/lib/lambor-ai/types";

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function sumNullable(...values: Array<number | null | undefined>): number {
  let sum = 0;
  for (const value of values) {
    sum += value ?? 0;
  }
  return sum;
}

type StrategyEvaluator = (match: MatchAnalyticsInput, weight: number) => StrategyResult;

const under25Ht: StrategyEvaluator = (match, weight) => {
  const goals = match.homeGoals + match.awayGoals;
  const sot = sumNullable(match.shotsOnTargetHome, match.shotsOnTargetAway);
  let confidence = 30;
  if ((match.minute ?? 0) < 35) confidence += 20;
  if (goals <= 1) confidence += 30;
  if (sot < 5) confidence += 25;
  return {
    strategy: "UNDER_2_5_HT",
    confidence: clamp(confidence),
    weight,
    reasoning: "Early phase, low goals and low shots on target support first-half under.",
  };
};

const under25SecondHalf: StrategyEvaluator = (match, weight) => {
  const goals = match.homeGoals + match.awayGoals;
  const pressure = sumNullable(
    match.dangerousAttacksHome,
    match.dangerousAttacksAway,
    match.shotsOnTargetHome,
    match.shotsOnTargetAway,
  );
  let confidence = 25;
  if ((match.minute ?? 0) > 55) confidence += 22;
  if (goals <= 2) confidence += 28;
  if (pressure < 30) confidence += 30;
  return {
    strategy: "UNDER_2_5_SECOND_HALF",
    confidence: clamp(confidence),
    weight,
    reasoning: "Second-half under favored by controlled tempo and low pressure.",
  };
};

const over15LateGoals: StrategyEvaluator = (match, weight) => {
  const goals = match.homeGoals + match.awayGoals;
  const closeScore = Math.abs(match.homeGoals - match.awayGoals) <= 1;
  const pressure = sumNullable(
    match.totalShotsHome,
    match.totalShotsAway,
    match.dangerousAttacksHome,
    match.dangerousAttacksAway,
  );
  let confidence = 20;
  if ((match.minute ?? 0) > 70) confidence += 25;
  if (closeScore) confidence += 20;
  if (pressure > 25) confidence += 35;
  if (goals >= 2) confidence += 5;
  return {
    strategy: "OVER_1_5_LATE_GOALS",
    confidence: clamp(confidence),
    weight,
    reasoning: "Late close game with high pressure improves chance of more goals.",
  };
};

const favoriteDominance: StrategyEvaluator = (match, weight) => {
  const possessionGap = Math.abs((match.possessionHome ?? 50) - (match.possessionAway ?? 50));
  const shotsGap = Math.abs(sumNullable(match.totalShotsHome) - sumNullable(match.totalShotsAway));
  const validOdds = (match.favoriteOdds ?? 0) >= 1.2 && (match.favoriteOdds ?? 99) <= 1.6;
  let confidence = 25;
  if (possessionGap >= 12) confidence += 28;
  if (shotsGap >= 4) confidence += 25;
  if (validOdds) confidence += 22;
  return {
    strategy: "FAVORITE_DOMINANCE",
    confidence: clamp(confidence),
    weight,
    reasoning: "Dominance profile plus safe-odds range supports favorite continuation.",
  };
};

const drawStability: StrategyEvaluator = (match, weight) => {
  const isDraw = match.homeGoals === match.awayGoals;
  const shots = sumNullable(match.totalShotsHome, match.totalShotsAway);
  const paceGap = Math.abs(
    sumNullable(match.attacksHome, match.dangerousAttacksHome) -
      sumNullable(match.attacksAway, match.dangerousAttacksAway),
  );
  let confidence = 20;
  if (isDraw) confidence += 26;
  if (shots < 12) confidence += 28;
  if (paceGap < 8) confidence += 24;
  return {
    strategy: "DRAW_STABILITY",
    confidence: clamp(confidence),
    weight,
    reasoning: "Balanced and low-tempo game supports draw stability.",
  };
};

const momentumSpike: StrategyEvaluator = (match, weight) => {
  const minute = match.minute ?? 0;
  const pressure = sumNullable(
    match.shotsOnTargetHome,
    match.shotsOnTargetAway,
    match.dangerousAttacksHome,
    match.dangerousAttacksAway,
  );
  let confidence = 18;
  if (minute >= 60) confidence += 20;
  if (pressure > 18) confidence += 38;
  return {
    strategy: "MOMENTUM_SPIKE",
    confidence: clamp(confidence),
    weight,
    reasoning: "Pressure spike indicates possible imminent goal event.",
  };
};

const deadGameFilter: StrategyEvaluator = (match, weight) => {
  const activity = sumNullable(
    match.totalShotsHome,
    match.totalShotsAway,
    match.shotsOnTargetHome,
    match.shotsOnTargetAway,
    match.dangerousAttacksHome,
    match.dangerousAttacksAway,
  );
  let confidence = 95;
  if (activity > 18) confidence -= 35;
  if ((match.minute ?? 0) > 70 && activity > 12) confidence -= 20;
  return {
    strategy: "DEAD_GAME_FILTER",
    confidence: clamp(confidence),
    weight,
    reasoning: "Low-stat dead-game filter; high confidence means avoid aggressive bets.",
  };
};

const lateEqualizer: StrategyEvaluator = (match, weight) => {
  const minute = match.minute ?? 0;
  const trailingHome = match.homeGoals < match.awayGoals;
  const trailingAway = match.awayGoals < match.homeGoals;
  const homePressure = sumNullable(match.shotsOnTargetHome, match.dangerousAttacksHome);
  const awayPressure = sumNullable(match.shotsOnTargetAway, match.dangerousAttacksAway);
  const trailingPressure =
    trailingHome ? homePressure : trailingAway ? awayPressure : Math.max(homePressure, awayPressure);
  let confidence = 16;
  if (minute >= 75) confidence += 30;
  if (trailingHome || trailingAway) confidence += 20;
  if (trailingPressure >= 10) confidence += 30;
  return {
    strategy: "LATE_EQUALIZER",
    confidence: clamp(confidence),
    weight,
    reasoning: "Trailing side pressure after 75' indicates equalizer potential.",
  };
};

const redCardExploit: StrategyEvaluator = (match, weight) => {
  const redHome = match.redCardsHome ?? 0;
  const redAway = match.redCardsAway ?? 0;
  const hasRed = redHome + redAway > 0;
  const pressureGap =
    Math.abs(
      sumNullable(match.shotsOnTargetHome, match.dangerousAttacksHome) -
        sumNullable(match.shotsOnTargetAway, match.dangerousAttacksAway),
    ) || 0;
  let confidence = 18;
  if (hasRed) confidence += 45;
  if (pressureGap >= 8) confidence += 22;
  return {
    strategy: "RED_CARD_EXPLOIT",
    confidence: clamp(confidence),
    weight,
    reasoning: "Card imbalance plus pressure gap can create exploitable odds drift.",
  };
};

export const strategyEvaluators: Record<StrategyName, StrategyEvaluator> = {
  UNDER_2_5_HT: under25Ht,
  UNDER_2_5_SECOND_HALF: under25SecondHalf,
  OVER_1_5_LATE_GOALS: over15LateGoals,
  FAVORITE_DOMINANCE: favoriteDominance,
  DRAW_STABILITY: drawStability,
  MOMENTUM_SPIKE: momentumSpike,
  DEAD_GAME_FILTER: deadGameFilter,
  LATE_EQUALIZER: lateEqualizer,
  RED_CARD_EXPLOIT: redCardExploit,
};

/** Stable display order for listing every strategy in the UI. */
export const STRATEGY_ORDER = Object.keys(strategyEvaluators) as StrategyName[];
