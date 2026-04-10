export type LiveMatch = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  score: string;
  minute: number | null;
  status: string;
  league: string;
  /** API-Football league id (for blocked-league filters). */
  leagueId?: number;
  timestamp: number;
  goalsHome?: number | null;
  goalsAway?: number | null;
  possessionHome?: number | null;
  possessionAway?: number | null;
  shotsOnTargetHome?: number | null;
  shotsOnTargetAway?: number | null;
  totalShotsHome?: number | null;
  totalShotsAway?: number | null;
  attacksHome?: number | null;
  attacksAway?: number | null;
  dangerousAttacksHome?: number | null;
  dangerousAttacksAway?: number | null;
  cornersHome?: number | null;
  cornersAway?: number | null;
  redCardsHome?: number | null;
  redCardsAway?: number | null;
};
