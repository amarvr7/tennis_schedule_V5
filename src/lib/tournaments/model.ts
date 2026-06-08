/**
 * Tournament data mappers — raw Supabase rows → domain types.
 */

import type { DayOfWeek } from "@/lib/conflicts";
import type {
  Tournament,
  TournamentAssignment,
  TournamentAssignmentRole,
  TournamentAssignmentStatus,
  TournamentCoach,
  TournamentType,
} from "./types";

export interface RawTournament {
  id: string;
  name: string;
  location: string | null;
  is_local: boolean;
  start_date: string | null;
  end_date: string | null;
  days_count: number | null;
  tournament_type: string | null;
  program_id: string | null;
  is_canceled: boolean;
  is_archived: boolean;
  published_at: string | null;
  notes: string | null;
}

export interface RawTournamentAssignment {
  id: string;
  tournament_id: string;
  coach_id: string;
  student_name: string | null;
  role: string | null;
  status: string;
  departed_at: string | null;
  returned_at: string | null;
  rest_days_owed: number;
  notes: string | null;
  created_at: string;
}

export interface RawTournamentCoach {
  id: string;
  full_name: string;
  initials: string | null;
  title: string | null;
  primary_program_id: string | null;
  no_drive: boolean;
  travel_restricted: boolean;
  is_active: boolean;
}

const TOURNAMENT_TYPES: ReadonlyArray<TournamentType> = [
  "ITF",
  "USTA",
  "local",
  "clinic",
  "special_event",
];

const ASSIGNMENT_ROLES: ReadonlyArray<TournamentAssignmentRole> = [
  "lead",
  "assistant",
  "driver",
];

const ASSIGNMENT_STATUSES: ReadonlyArray<TournamentAssignmentStatus> = [
  "draft",
  "published",
  "archived",
];

const asTournamentType = (value: string | null): TournamentType | null =>
  value && (TOURNAMENT_TYPES as readonly string[]).includes(value)
    ? (value as TournamentType)
    : null;

const asAssignmentRole = (value: string | null): TournamentAssignmentRole | null =>
  value && (ASSIGNMENT_ROLES as readonly string[]).includes(value)
    ? (value as TournamentAssignmentRole)
    : null;

const asAssignmentStatus = (value: string): TournamentAssignmentStatus =>
  (ASSIGNMENT_STATUSES as readonly string[]).includes(value)
    ? (value as TournamentAssignmentStatus)
    : "draft";

export const toTournament = (row: RawTournament): Tournament => ({
  id: row.id,
  name: row.name,
  location: row.location,
  isLocal: row.is_local,
  startDate: row.start_date,
  endDate: row.end_date,
  daysCount: row.days_count,
  tournamentType: asTournamentType(row.tournament_type),
  programId: row.program_id ?? null,
  isCanceled: row.is_canceled,
  isArchived: row.is_archived ?? false,
  // Pre-Phase-A DB: treat dated tournaments as published for reporting.
  publishedAt:
    row.published_at ??
    (row.start_date ? `${row.start_date}T12:00:00.000Z` : null),
  notes: row.notes,
});

export const toTournamentAssignment = (
  row: RawTournamentAssignment,
): TournamentAssignment => ({
  id: row.id,
  tournamentId: row.tournament_id,
  coachId: row.coach_id,
  studentName: row.student_name,
  role: asAssignmentRole(row.role ?? null),
  // Pre-Phase-A DB: all assignments count as published in reports.
  status: asAssignmentStatus(row.status ?? "published"),
  departedAt: row.departed_at,
  returnedAt: row.returned_at,
  restDaysOwed: row.rest_days_owed,
  notes: row.notes,
  createdAt: row.created_at ?? row.departed_at ?? "1970-01-01T00:00:00.000Z",
});

export const toTournamentCoach = (row: RawTournamentCoach): TournamentCoach => ({
  id: row.id,
  fullName: row.full_name,
  initials: row.initials,
  title: row.title,
  primaryProgramId: row.primary_program_id,
  noDrive: row.no_drive,
  travelRestricted: row.travel_restricted,
  isActive: row.is_active,
});
