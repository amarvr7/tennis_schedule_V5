/**
 * Schema-aware Supabase loaders for the tournament planner.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AvailabilityRecord } from "@/lib/conflicts";
import { toAvailabilityRecord, type RawAvailability } from "@/lib/schedule/model";
import {
  toTournament,
  toTournamentAssignment,
  toTournamentCoach,
  type RawTournament,
  type RawTournamentAssignment,
  type RawTournamentCoach,
} from "./model";
import type { Tournament, TournamentAssignment, TournamentCoach } from "./types";

const PHASE_A_TOURNAMENT_SELECT =
  "id, name, location, is_local, start_date, end_date, days_count, tournament_type, program_id, is_canceled, is_archived, published_at, notes";

const BASE_TOURNAMENT_SELECT =
  "id, name, location, is_local, start_date, end_date, days_count, tournament_type, is_canceled, notes";

const PHASE_A_ASSIGNMENT_SELECT =
  "id, tournament_id, coach_id, student_name, role, status, departed_at, returned_at, rest_days_owed, notes, created_at";

const BASE_ASSIGNMENT_SELECT =
  "id, tournament_id, coach_id, student_name, departed_at, returned_at, rest_days_owed, notes";

const COACH_SELECT =
  "id, full_name, initials, title, primary_program_id, no_drive, travel_restricted, is_active";

const isMissingColumnError = (message: string): boolean =>
  message.includes("does not exist") || message.includes("column");

export type TournamentProgram = {
  id: string;
  name: string;
  type: string | null;
};

export type TournamentLoadResult = {
  tournaments: Tournament[];
  assignments: TournamentAssignment[];
  coaches: TournamentCoach[];
  programs: TournamentProgram[];
  availability: AvailabilityRecord[];
  phaseASchema: boolean;
};

export const loadTournamentPlannerRaw = async (
  supabase: SupabaseClient,
): Promise<TournamentLoadResult> => {
  let rawTournaments: unknown[] | null = null;
  let rawAssignments: unknown[] | null = null;
  let phaseASchema = true;

  const fullTournaments = await supabase.from("tournaments").select(PHASE_A_TOURNAMENT_SELECT);
  if (fullTournaments.error && isMissingColumnError(fullTournaments.error.message)) {
    phaseASchema = false;
    const base = await supabase.from("tournaments").select(BASE_TOURNAMENT_SELECT);
    if (base.error) throw new Error(`Could not load tournaments: ${base.error.message}`);
    rawTournaments = base.data;
  } else if (fullTournaments.error) {
    throw new Error(`Could not load tournaments: ${fullTournaments.error.message}`);
  } else {
    rawTournaments = fullTournaments.data;
  }

  const fullAssignments = await supabase
    .from("tournament_assignments")
    .select(PHASE_A_ASSIGNMENT_SELECT);
  if (fullAssignments.error && isMissingColumnError(fullAssignments.error.message)) {
    const base = await supabase.from("tournament_assignments").select(BASE_ASSIGNMENT_SELECT);
    if (base.error) throw new Error(`Could not load assignments: ${base.error.message}`);
    rawAssignments = base.data;
  } else if (fullAssignments.error) {
    throw new Error(`Could not load assignments: ${fullAssignments.error.message}`);
  } else {
    rawAssignments = fullAssignments.data;
  }

  const [coachesRes, programsRes, availabilityRes] = await Promise.all([
    supabase.from("coaches").select(COACH_SELECT).eq("is_active", true).order("full_name"),
    supabase.from("programs").select("id, name, type").order("name"),
    supabase.from("coach_availability").select("coach_id, week_start_date, day_of_week, status"),
  ]);

  if (coachesRes.error) throw new Error(`Could not load coaches: ${coachesRes.error.message}`);
  if (programsRes.error) throw new Error(`Could not load programs: ${programsRes.error.message}`);
  if (availabilityRes.error) {
    throw new Error(`Could not load availability: ${availabilityRes.error.message}`);
  }

  const tournaments = (rawTournaments ?? [])
    .filter((row) => {
      const r = row as RawTournament;
      return phaseASchema ? !r.is_archived : true;
    })
    .map((row) => toTournament(row as RawTournament));

  return {
    tournaments,
    assignments: (rawAssignments ?? []).map((row) =>
      toTournamentAssignment(row as RawTournamentAssignment),
    ),
    coaches: (coachesRes.data ?? []).map((row) =>
      toTournamentCoach(row as RawTournamentCoach),
    ),
    programs: (programsRes.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
    })),
    availability: ((availabilityRes.data ?? []) as RawAvailability[])
      .map(toAvailabilityRecord)
      .filter((r): r is AvailabilityRecord => r !== null),
    phaseASchema,
  };
};
