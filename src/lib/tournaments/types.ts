/**
 * Tournament Travel Planner — domain types.
 * Pure shapes only; no React, Next, or Supabase imports.
 */

import type { DayOfWeek } from "@/lib/conflicts";

export type TournamentType = "ITF" | "USTA" | "local" | "clinic" | "special_event";

export type TournamentAssignmentRole = "lead" | "assistant" | "driver";

export type TournamentAssignmentStatus = "draft" | "published" | "archived";

export interface Tournament {
  id: string;
  name: string;
  location: string | null;
  isLocal: boolean;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;
  daysCount: number | null;
  tournamentType: TournamentType | null;
  programId: string | null;
  isCanceled: boolean;
  isArchived: boolean;
  publishedAt: string | null; // ISO timestamp
  notes: string | null;
}

export interface TournamentAssignment {
  id: string;
  tournamentId: string;
  coachId: string;
  studentName: string | null;
  role: TournamentAssignmentRole | null;
  status: TournamentAssignmentStatus;
  departedAt: string | null;
  returnedAt: string | null;
  restDaysOwed: number;
  notes: string | null;
  createdAt: string;
}

/** Coach row subset used for tournament assignment evaluation. */
export interface TournamentCoach {
  id: string;
  fullName: string;
  initials: string | null;
  title: string | null;
  primaryProgramId: string | null;
  noDrive: boolean;
  travelRestricted: boolean;
  isActive: boolean;
}

export type TournamentConflictType =
  | "travel_restricted"
  | "no_drive"
  | "pto"
  | "travel_block"
  | "rest_day"
  | "max_travel"
  | "double_tournament"
  | "program_mismatch";

export type TournamentConflictSeverity = "hard" | "soft" | "system" | "outlier";

export interface TournamentConflict {
  type: TournamentConflictType;
  severity: TournamentConflictSeverity;
  coachId: string;
  tournamentId: string;
  message: string;
}

/** One day blocked as traveling for availability sync. */
export interface TravelAvailabilitySlot {
  coachId: string;
  weekStartDate: string;
  dayOfWeek: DayOfWeek;
}
