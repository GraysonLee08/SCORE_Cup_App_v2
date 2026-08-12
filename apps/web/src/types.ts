export type UserRole = 'admin' | 'ref' | 'coach' | 'participant';

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
  mustChangePassword: boolean;
}

export interface Fixture {
  id: string;
  round: string | null;
  kickoffAt: string | null;
  status: 'scheduled' | 'in_progress' | 'complete' | 'cancelled';
  homeScore: number | null;
  awayScore: number | null;
  homePenalties: number | null;
  awayPenalties: number | null;
  fieldId: string | null;
  fieldName: string | null;
  homeTeamId: string | null;
  homeTeamName: string | null;
  awayTeamId: string | null;
  awayTeamName: string | null;
  stageName: string;
  divisionName: string;
  signoffCount: number;
}

export interface Card {
  id: string;
  teamId: string;
  teamName: string;
  type: 'yellow' | 'red';
  minute: number | null;
  identifyingNote: string | null;
  playerId: string | null;
  playerName: string | null;
}

export interface PublicFixture {
  id: string;
  round: string | null;
  kickoffAt: string | null;
  status: 'scheduled' | 'in_progress' | 'complete' | 'cancelled';
  fieldName: string | null;
  poolName: string | null;
  stageName: string;
  stageKind: 'pool' | 'bracket';
  homeTeamId: string | null;
  homeTeamName: string;
  awayTeamId: string | null;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  homePenalties: number | null;
  awayPenalties: number | null;
  homeCards: { yellow: number; red: number };
  awayCards: { yellow: number; red: number };
}

export interface StandingsRow {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  shutoutWins: number;
  yellowCards: number;
  redCards: number;
  penaltyPoints: number;
  adjustmentPoints: number;
  points: number;
  rank: number;
  needsManualTiebreak: boolean;
}

export interface PublicPoolTable {
  poolId: string;
  poolName: string;
  complete: boolean;
  rows: StandingsRow[];
}

export interface PublicDivision {
  id: string;
  name: string;
  pools: PublicPoolTable[];
  fixtures: PublicFixture[];
  teams: { id: string; name: string }[];
}

export interface PublicEventResponse {
  event: {
    id: string;
    name: string;
    season: string | null;
    eventDate: string;
    startTime: string;
    endTime: string;
    timezone: string;
  };
  divisions: { id: string; name: string }[];
  announcements: { id: string; title: string; message: string; createdAt: string }[];
}
