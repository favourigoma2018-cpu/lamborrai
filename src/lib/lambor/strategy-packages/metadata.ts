export type StrategyPackageId =
  | "under_2_5_ht"
  | "under_1_5_ht"
  | "two_odds_combo"
  | "three_in_one"
  | "no_goal_last_15"
  | "moderate_unders_live"
  | "lambor_general";

export type StrategyPackageMeta = {
  id: StrategyPackageId;
  name: string;
  description: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  oddsRangeLabel: string;
};

export const STRATEGY_PACKAGES: StrategyPackageMeta[] = [
  {
    id: "under_2_5_ht",
    name: "Under 2.5 Halftime",
    description: "First-half low goal tempo: early minutes, limited shots, engine confidence gate.",
    riskLevel: "MEDIUM",
    oddsRangeLabel: "~1.45–1.85",
  },
  {
    id: "under_1_5_ht",
    name: "Under 1.5 Halftime",
    description: "Stricter low-scoring first half — fewer goals and higher confidence required.",
    riskLevel: "LOW",
    oddsRangeLabel: "~1.50–2.10",
  },
  {
    id: "two_odds_combo",
    name: "2 Odds Builder",
    description: "Pairs or triples of ~safe legs (1.3–1.6) targeting ~2.0 combined price.",
    riskLevel: "MEDIUM",
    oddsRangeLabel: "Target ~2.0 acca",
  },
  {
    id: "three_in_one",
    name: "3-in-1 Strategy",
    description: "Three conservative picks from the master engine for a structured multi.",
    riskLevel: "MEDIUM",
    oddsRangeLabel: "Varies (x³)",
  },
  {
    id: "no_goal_last_15",
    name: "No Goal Last 15 Min",
    description: "Late game, reduced attacking pressure — live minutes 75+ only.",
    riskLevel: "HIGH",
    oddsRangeLabel: "~1.40–2.20",
  },
  {
    id: "moderate_unders_live",
    name: "Moderate Unders (Live)",
    description: "Under 2.5 FT at minutes 25–28 & 70–73 — pressure + priors, GREEN/YELLOW only.",
    riskLevel: "LOW",
    oddsRangeLabel: "~1.50–2.20",
  },
  {
    id: "lambor_general",
    name: "Lambor AI Picks",
    description: "Full master engine: weighted strategies, penalties, and learning profile.",
    riskLevel: "MEDIUM",
    oddsRangeLabel: "Market",
  },
];
