import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildRosterByProgram,
  buildRequirementByProgram,
  toGroupRequirement,
  toRosterMember,
  type GroupRequirement,
  type GroupRoster,
  type RawGroupRequirement,
  type RawRosterMember,
  type RosterMember,
} from "./roster";
import { CURRENT_SEASON, resolveSeasonSettings, type SeasonSettings } from "./season";
import type { SubHistoryEntry } from "./suggest";

/**
 * Server-side loaders for the season-scheduling layer (rosters, requirements,
 * week records, master template, settings, sub history). Admin pages gate
 * with requireAdminCoach(); RLS additionally scopes coach-facing callers.
 */

export interface ScheduleWeek {
  id: string;
  weekStartDate: string;
  season: string;
  campHeadcount: number | null;
  status: "draft" | "published";
}

export interface TemplateSlot {
  id: string;
  programId: string | null;
  programName: string;
  dayOfWeek: string | null;
  startTime: string;
  endTime: string;
  courtZone: string | null;
  courtNumbers: string | null;
  surface: string | null;
  notes: string | null;
}

const REQUIREMENT_SELECT =
  "id, name, type, required_lead_count, required_assistant_count, base_capacity";

const TEMPLATE_SELECT =
  "id, program_id, day_of_week, start_time, end_time, court_zone, court_numbers, surface, notes, programs ( id, name )";

type RawTemplateRow = {
  id: string;
  program_id: string | null;
  day_of_week: string | null;
  start_time: string;
  end_time: string;
  court_zone: string | null;
  court_numbers: string | null;
  surface: string | null;
  notes: string | null;
  programs: { id: string; name: string } | null;
};

/** The week record, or null when the week hasn't been created yet (Q2). */
export const loadScheduleWeek = async (
  supabase: SupabaseClient,
  weekStartDate: string,
): Promise<ScheduleWeek | null> => {
  const { data, error } = await supabase
    .from("schedule_weeks")
    .select("id, week_start_date, season, camp_headcount, status")
    .eq("week_start_date", weekStartDate)
    .maybeSingle<{
      id: string;
      week_start_date: string;
      season: string;
      camp_headcount: number | null;
      status: string;
    }>();

  if (error || !data) return null;

  return {
    id: data.id,
    weekStartDate: data.week_start_date,
    season: data.season,
    campHeadcount: data.camp_headcount,
    status: data.status === "published" ? "published" : "draft",
  };
};

/** Every group with its staffing requirement (Q1), name-ordered. */
export const loadGroupRequirements = async (
  supabase: SupabaseClient,
): Promise<GroupRequirement[]> => {
  const { data, error } = await supabase
    .from("programs")
    .select(REQUIREMENT_SELECT)
    .order("name");

  if (error) throw new Error(`Could not load groups: ${error.message}`);
  return ((data ?? []) as RawGroupRequirement[]).map(toGroupRequirement);
};

/** Live roster memberships for the season (Q1). */
export const loadRosterMembers = async (
  supabase: SupabaseClient,
  season = CURRENT_SEASON,
): Promise<RosterMember[]> => {
  const { data, error } = await supabase
    .from("group_coach_roster")
    .select("id, program_id, coach_id, role, is_active")
    .eq("season", season)
    .eq("is_active", true);

  if (error) throw new Error(`Could not load rosters: ${error.message}`);

  return ((data ?? []) as RawRosterMember[])
    .map(toRosterMember)
    .filter((member): member is RosterMember => member !== null);
};

/** Roster + requirement maps the generator and coverage logic consume. */
export const loadStaffingConfig = async (
  supabase: SupabaseClient,
  season = CURRENT_SEASON,
): Promise<{
  requirements: GroupRequirement[];
  rosterMembers: RosterMember[];
  rosterByProgram: Map<string, GroupRoster>;
  requirementByProgram: Map<string, GroupRequirement>;
}> => {
  const [requirements, rosterMembers] = await Promise.all([
    loadGroupRequirements(supabase),
    loadRosterMembers(supabase, season),
  ]);

  return {
    requirements,
    rosterMembers,
    rosterByProgram: buildRosterByProgram(rosterMembers),
    requirementByProgram: buildRequirementByProgram(requirements),
  };
};

/** Master template slots for the season (Q2), active only. */
export const loadTemplateSlots = async (
  supabase: SupabaseClient,
  season = CURRENT_SEASON,
): Promise<TemplateSlot[]> => {
  const { data, error } = await supabase
    .from("template_sessions")
    .select(TEMPLATE_SELECT)
    .eq("season", season)
    .eq("is_active", true)
    .order("day_of_week")
    .order("start_time");

  if (error) throw new Error(`Could not load the week template: ${error.message}`);

  return ((data ?? []) as unknown as RawTemplateRow[]).map((row) => ({
    id: row.id,
    programId: row.program_id,
    programName: row.programs?.name ?? "Unassigned program",
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    courtZone: row.court_zone,
    courtNumbers: row.court_numbers,
    surface: row.surface,
    notes: row.notes,
  }));
};

/** Per-season settings with code-level fallbacks (Q3/Q4: never hardcode). */
export const loadSeasonSettings = async (
  supabase: SupabaseClient,
  season = CURRENT_SEASON,
): Promise<SeasonSettings> => {
  const { data } = await supabase
    .from("season_settings")
    .select("key, value")
    .eq("season", season);

  return resolveSeasonSettings(data ?? []);
};

export const WEEK_SESSION_SELECT =
  "id, program_id, day_of_week, start_time, end_time, duration_minutes, court_zone, court_numbers, surface, notes, headcount, programs ( id, name, type )";

export type RawWeekSessionRow = {
  id: string;
  program_id: string | null;
  day_of_week: string | null;
  start_time: string;
  end_time: string;
  duration_minutes: number | null;
  court_zone: string | null;
  court_numbers: string | null;
  surface: string | null;
  notes: string | null;
  headcount: number | null;
  programs: { id: string; name: string; type: string | null } | null;
};

/**
 * The sessions a week renders (Q2): the week's own cloned copies when the
 * week record exists; otherwise the legacy global rows (week_start_date is
 * null) so historical weeks keep working.
 */
export const loadWeekSessionRows = async (
  supabase: SupabaseClient,
  weekStartDate: string,
  weekExists: boolean,
): Promise<{ rows: RawWeekSessionRow[]; error: string | null }> => {
  let query = supabase.from("sessions").select(WEEK_SESSION_SELECT).eq("is_active", true);
  query = weekExists
    ? query.eq("week_start_date", weekStartDate)
    : query.is("week_start_date", null);

  const { data, error } = await query;

  return {
    rows: (data ?? []) as unknown as RawWeekSessionRow[],
    error: error?.message ?? null,
  };
};

/** This season's substitute assignments — powers the rotation ranking (Q4). */
export const loadSubHistory = async (
  supabase: SupabaseClient,
  seasonStartDate: string,
): Promise<SubHistoryEntry[]> => {
  const { data, error } = await supabase
    .from("weekly_assignments")
    .select("coach_id, week_start_date")
    .eq("sub", true)
    .neq("status", "archived")
    .gte("week_start_date", seasonStartDate);

  if (error) throw new Error(`Could not load sub history: ${error.message}`);

  return (data ?? []).map((row) => ({
    coachId: row.coach_id as string,
    date: row.week_start_date as string,
  }));
};
