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
