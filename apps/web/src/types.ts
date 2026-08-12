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
  refereeName: string | null;
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
    location: string | null;
  };
  divisions: { id: string; name: string }[];
  announcements: { id: string; title: string; message: string; createdAt: string }[];
}

export interface MyTeam {
  team: { id: string; name: string };
  division: { id: string; name: string };
  eventId: string;
  isCoach: boolean;
  teammates: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    isCaptain: boolean;
    registered: boolean;
  }[];
  messages: { id: string; title: string; message: string; createdAt: string }[];
}

export interface ParticipantProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  jerseySize: string | null;
  genderIdentity: string | null;
  dateOfBirth: string | null;
  priorParticipation: boolean | null;
  emergencyContactFirstName: string | null;
  emergencyContactLastName: string | null;
  emergencyContactPhone: string | null;
  teamName: string;
  teamId: string;
}

export interface AdminStage {
  id: string;
  kind: 'pool' | 'bracket';
  name: string;
  sequence: number;
  config: unknown;
}

export interface AdminTeam {
  id: string;
  name: string;
  poolId: string | null;
  joinCode: string;
  coachUserId: string | null;
  playerCount: number;
}

export interface AdminDivision {
  id: string;
  name: string;
  status: string;
  sortOrder: number;
  fieldIds: string[];
  stages: AdminStage[];
  pools: { id: string; name: string; stageId: string }[];
  teams: AdminTeam[];
  fixtureCount: number;
}

export interface AdminEvent {
  event: {
    id: string;
    name: string;
    season: string | null;
    eventDate: string;
    startTime: string;
    endTime: string;
    minRestMinutes: number;
    timezone: string;
    status: string;
    location: string | null;
  };
  fields: { id: string; name: string; sortOrder: number }[];
  divisions: AdminDivision[];
}

export interface AdminUser {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
  disabled: boolean;
  mustChangePassword: boolean;
  fieldIds: string[];
}

export interface Feasibility {
  fits: boolean;
  summary: string;
  fixtureCount: number;
  fieldCount: number;
  requiredMinutes: number;
  availableMinutes: number;
  overByMinutes: number;
  waves: number;
}

export interface RosterPlayer {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  isCaptain: boolean;
  selfRegistered: boolean;
}
