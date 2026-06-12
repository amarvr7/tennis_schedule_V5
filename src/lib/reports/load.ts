/**
 * Supabase data loaders for report aggregation.
 * Admin-only — callers must gate with requireAdminCoach().
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  toTournament,
  toTournamentAssignment,
  type RawTournament,
  type RawTournamentAssignment,
} from "@/lib/tournaments/model";
import type { Tournament, TournamentAssignment } from "@/lib/tournaments/types";
import type { RawCourtSession } from "./courts";
import type { RawCoverageSession } from "./coverage";
import type { RawTournamentReportCoach } from "./travel";
import type { RawWorkloadAssignment } from "./workload";
import type { ReportPeriod } from "./types";

type AssignmentRow = {
  coach_id: string;
  week_start_date: string;
  duration_minutes: number | null;
  status: string;
  is_published: boolean;
  coaches: { full_name: string; title: string | null; contracted_weekly_hours: number | null } | null;
  sessions: {
    program_id: string | null;
    court_zone: string | null;
    court_numbers: string | null;
    programs: { type: string | null } | null;
  } | null;
};

type SessionRow = {
  id: string;
  court_zone: string | null;
  court_numbers: string | null;
  duration_minutes: number | null;
  week_start_date: string | null;
};

const courtLabel = (zone: string | null, numbers: string | null): string | null => {
  if (numbers) return numbers;
  return zone;
};

/** Load assignment snapshots for workload and coverage reports. */
export const loadWorkloadRows = async (
  supabase: SupabaseClient,
  period: ReportPeriod,
): Promise<RawWorkloadAssignment[]> => {
  const { data, error } = await supabase
    .from("weekly_assignments")
    .select(
      `
      coach_id,
      week_start_date,
      duration_minutes,
      status,
      is_published,
      coaches!weekly_assignments_coach_id_fkey ( full_name, title, contracted_weekly_hours ),
      sessions (
        program_id,
        court_zone,
        court_numbers,
        programs ( type )
      )
    `,
    )
    .gte("week_start_date", period.startDate)
    .lte("week_start_date", period.endDate);

  if (error) throw new Error(`Could not load assignments: ${error.message}`);

  const rows = (data ?? []) as unknown as AssignmentRow[];

  return rows.map((row) => {
    const coach = Array.isArray(row.coaches) ? row.coaches[0] : row.coaches;
    const session = Array.isArray(row.sessions) ? row.sessions[0] : row.sessions;
    const program = session?.programs;
    const programType = Array.isArray(program) ? program[0]?.type : program?.type;

    return {
      coachId: row.coach_id,
      coachName: coach?.full_name ?? "Unknown",
      coachTitle: coach?.title ?? null,
      contractedWeeklyHours: coach?.contracted_weekly_hours ?? null,
      durationMinutes: row.duration_minutes ?? 0,
      programType: programType ?? null,
      weekStartDate: row.week_start_date,
      status: row.status,
      isPublished: row.is_published,
    };
  });
};

/** Build coverage + court utilization rows for a period. */
export const loadSessionCoverage = async (
  supabase: SupabaseClient,
  period: ReportPeriod,
): Promise<{ coverage: RawCoverageSession[]; courts: RawCourtSession[] }> => {
  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, court_zone, court_numbers, duration_minutes, week_start_date")
    .eq("is_active", true);

  if (sessionsError) throw new Error(`Could not load sessions: ${sessionsError.message}`);

  const { data: assignments, error: assignError } = await supabase
    .from("weekly_assignments")
    .select("session_id, week_start_date, status, is_published")
    .gte("week_start_date", period.startDate)
    .lte("week_start_date", period.endDate)
    .eq("status", "active");

  if (assignError) throw new Error(`Could not load assignments: ${assignError.message}`);

  // Weeks that were created from the master template own their session copies;
  // legacy template rows should not be counted for those weeks.
  const { data: createdWeeks } = await supabase
    .from("schedule_weeks")
    .select("week_start_date")
    .gte("week_start_date", period.startDate)
    .lte("week_start_date", period.endDate);
  const weeksWithOwnSessions = new Set(
    (createdWeeks ?? []).map((row) => row.week_start_date as string),
  );

  const staffed = new Set<string>();
  const published = new Set<string>();

  for (const a of assignments ?? []) {
    const key = `${a.session_id}::${a.week_start_date}`;
    staffed.add(key);
    if (a.is_published) published.add(key);
  }

  const weekStarts = uniqueWeekStarts(period);
  const coverage: RawCoverageSession[] = [];
  const courts: RawCourtSession[] = [];

  for (const session of (sessions ?? []) as SessionRow[]) {
    for (const week of weekStarts) {
      // Week-cloned sessions exist only in their own week; legacy template
      // rows (no week) recur only across weeks NOT created from the template.
      if (session.week_start_date && session.week_start_date !== week) continue;
      if (!session.week_start_date && weeksWithOwnSessions.has(week)) continue;
      const key = `${session.id}::${week}`;
      const hasActive = staffed.has(key);
      const isPublished = published.has(key);

      coverage.push({
        sessionId: session.id,
        weekStartDate: week,
        hasActiveAssignment: hasActive,
        isPublished,
      });

      courts.push({
        courtZone: session.court_zone,
        courtLabel: courtLabel(session.court_zone, session.court_numbers),
        durationMinutes: session.duration_minutes ?? 0,
        weekStartDate: week,
        hasActiveAssignment: hasActive,
      });
    }
  }

  return { coverage, courts };
};

export const loadCoaches = async (
  supabase: SupabaseClient,
): Promise<RawTournamentReportCoach[]> => {
  const { data, error } = await supabase
    .from("coaches")
    .select("id, full_name")
    .eq("is_active", true)
    .order("full_name");

  if (error) throw new Error(`Could not load coaches: ${error.message}`);

  return (data ?? []).map((c) => ({ id: c.id, fullName: c.full_name }));
};

const PHASE_A_TOURNAMENT_SELECT =
  "id, name, location, is_local, start_date, end_date, days_count, tournament_type, program_id, is_canceled, is_archived, published_at, notes";

const BASE_TOURNAMENT_SELECT =
  "id, name, location, is_local, start_date, end_date, days_count, tournament_type, is_canceled, notes";

const PHASE_A_ASSIGNMENT_SELECT =
  "id, tournament_id, coach_id, student_name, role, status, departed_at, returned_at, rest_days_owed, notes, created_at";

const BASE_ASSIGNMENT_SELECT =
  "id, tournament_id, coach_id, student_name, departed_at, returned_at, rest_days_owed, notes";

const isMissingColumnError = (message: string): boolean =>
  message.includes("does not exist") || message.includes("column");

/** Load tournaments + assignments, falling back when Phase A migration is not applied. */
export const loadTournamentData = async (
  supabase: SupabaseClient,
): Promise<{ tournaments: Tournament[]; assignments: TournamentAssignment[] }> => {
  let rawTournaments: unknown[] | null = null;
  let rawAssignments: unknown[] | null = null;

  const fullTournaments = await supabase.from("tournaments").select(PHASE_A_TOURNAMENT_SELECT);
  if (fullTournaments.error && isMissingColumnError(fullTournaments.error.message)) {
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
    if (base.error) throw new Error(`Could not load tournament assignments: ${base.error.message}`);
    rawAssignments = base.data;
  } else if (fullAssignments.error) {
    throw new Error(`Could not load tournament assignments: ${fullAssignments.error.message}`);
  } else {
    rawAssignments = fullAssignments.data;
  }

  return {
    tournaments: (rawTournaments ?? []).map((t) => toTournament(t as RawTournament)),
    assignments: (rawAssignments ?? []).map((a) =>
      toTournamentAssignment(a as RawTournamentAssignment),
    ),
  };
};

const uniqueWeekStarts = (period: ReportPeriod): string[] => {
  const weeks: string[] = [];
  const cursor = new Date(`${period.startDate}T00:00:00Z`);
  const end = new Date(`${period.endDate}T00:00:00Z`);

  while (cursor <= end) {
    const dow = cursor.getUTCDay();
    const offset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(cursor);
    monday.setUTCDate(monday.getUTCDate() + offset);
    const key = monday.toISOString().slice(0, 10);
    if (!weeks.includes(key)) weeks.push(key);
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return weeks;
};
