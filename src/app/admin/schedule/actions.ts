"use server";

import { revalidatePath } from "next/cache";

import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import { createClient } from "@/lib/supabase/server";
import { formatWeekRange } from "@/lib/schedule/grid";
import type { AvailabilityRecord } from "@/lib/conflicts";
import {
  buildCampusByZone,
  toAvailabilityRecord,
  toGridAssignment,
  toGridCoach,
  toGridSession,
  type GridAssignment,
  type GridCoach,
  type GridSession,
  type RawAssignment,
  type RawAvailability,
  type RawCoach,
  type RawCourtZone,
  type RawSession,
} from "@/lib/schedule/model";
import { buildActiveContexts } from "@/lib/schedule/conflicts";
import { generateSchedule, type ScheduleGap } from "@/lib/schedule/generate";
import {
  toTournament,
  toTournamentAssignment,
  type RawTournament,
  type RawTournamentAssignment,
} from "@/lib/tournaments/model";
import {
  buildAllTravelWeekStartsByCoach,
  consecutiveTravelWeeksByCoach,
  previousWeekMonday,
} from "@/lib/tournaments/travelWeeks";

export type ActionResult = {
  ok: boolean;
  error: string | null;
};

export type PublishResult = ActionResult & {
  notified: number;
};

/** Serializable summary the Schedule Builder renders for one-click approval. */
export type GenerationSummary = {
  openSessionCount: number;
  staffedCount: number;
  gapCount: number;
  warningCount: number;
  hitNodeLimit: boolean;
  gaps: ScheduleGap[];
};

export type GenerateDraftResult = ActionResult & {
  summary: GenerationSummary | null;
};

type AssignInput = {
  sessionId: string;
  coachId: string;
  weekStartDate: string;
  role?: "lead" | "assistant" | "coverage";
};

const fail = (error: string): ActionResult => ({ ok: false, error });

/**
 * Assign a coach to a session for a given week. Snapshots the session duration
 * onto the assignment (CURSOR_CONTEXT.md: every weekly_assignments row stores
 * duration_minutes for year-end workload reports). Never inserts a duplicate:
 * an archived prior assignment for the same coach+session+week is reactivated
 * (core rule: never delete records).
 */
export const assignCoach = async (input: AssignInput): Promise<ActionResult> => {
  await requireAdminCoach();

  const { sessionId, coachId, weekStartDate, role = "lead" } = input;
  if (!sessionId || !coachId || !weekStartDate) {
    return fail("Missing session, coach, or week.");
  }

  const supabase = createClient();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, duration_minutes")
    .eq("id", sessionId)
    .maybeSingle<{ id: string; duration_minutes: number | null }>();

  if (sessionError) return fail(`Could not load session: ${sessionError.message}`);
  if (!session) return fail("Session not found.");

  const { data: existing, error: existingError } = await supabase
    .from("weekly_assignments")
    .select("id, status")
    .eq("session_id", sessionId)
    .eq("coach_id", coachId)
    .eq("week_start_date", weekStartDate)
    .maybeSingle<{ id: string; status: string }>();

  if (existingError) return fail(`Could not check existing assignment: ${existingError.message}`);

  if (existing) {
    if (existing.status === "active") {
      return { ok: true, error: null };
    }
    const { error: reactivateError } = await supabase
      .from("weekly_assignments")
      .update({ status: "active", role, duration_minutes: session.duration_minutes })
      .eq("id", existing.id);

    if (reactivateError) return fail(`Could not reactivate assignment: ${reactivateError.message}`);
    revalidatePath("/admin/schedule");
    return { ok: true, error: null };
  }

  const { error: insertError } = await supabase.from("weekly_assignments").insert({
    session_id: sessionId,
    coach_id: coachId,
    week_start_date: weekStartDate,
    role,
    status: "active",
    duration_minutes: session.duration_minutes,
    is_published: false,
  });

  if (insertError) return fail(`Could not assign coach: ${insertError.message}`);

  revalidatePath("/admin/schedule");
  return { ok: true, error: null };
};

/**
 * Remove a coach from a session by archiving the assignment. We never delete
 * records — archived rows preserve the historical workload trail.
 */
export const unassignCoach = async (assignmentId: string): Promise<ActionResult> => {
  await requireAdminCoach();

  if (!assignmentId) return fail("Missing assignment.");

  const supabase = createClient();

  const { error } = await supabase
    .from("weekly_assignments")
    .update({ status: "archived" })
    .eq("id", assignmentId);

  if (error) return fail(`Could not remove assignment: ${error.message}`);

  revalidatePath("/admin/schedule");
  return { ok: true, error: null };
};

/**
 * Publish the week: flip every active assignment to is_published = true and
 * notify each assigned coach. Draft → Published is the single source of the
 * grid's published state.
 */
export const publishWeek = async (weekStartDate: string): Promise<PublishResult> => {
  await requireAdminCoach();

  if (!weekStartDate) return { ok: false, error: "Missing week.", notified: 0 };

  const supabase = createClient();

  const { data: published, error: publishError } = await supabase
    .from("weekly_assignments")
    .update({ is_published: true })
    .eq("week_start_date", weekStartDate)
    .eq("status", "active")
    .select("coach_id");

  if (publishError) {
    return { ok: false, error: `Could not publish: ${publishError.message}`, notified: 0 };
  }

  const coachIds = [...new Set((published ?? []).map((row) => row.coach_id))];

  if (coachIds.length === 0) {
    return { ok: true, error: null, notified: 0 };
  }

  const message = `Your schedule for ${formatWeekRange(weekStartDate)} has been published.`;
  const { error: notifyError } = await supabase.from("notifications").insert(
    coachIds.map((coachId) => ({
      recipient_coach_id: coachId,
      type: "schedule_published",
      message,
    })),
  );

  if (notifyError) {
    return { ok: false, error: `Published, but notifications failed: ${notifyError.message}`, notified: 0 };
  }

  revalidatePath("/admin/schedule");
  return { ok: true, error: null, notified: coachIds.length };
};

const GEN_SESSION_SELECT =
  "id, program_id, day_of_week, start_time, end_time, duration_minutes, court_zone, court_numbers, surface, notes, programs ( id, name, type )";
const TOURNAMENT_SELECT_FOR_TRAVEL =
  "id, name, location, is_local, start_date, end_date, days_count, tournament_type, program_id, is_canceled, is_archived, published_at, notes";
const ASSIGNMENT_SELECT_FOR_TRAVEL =
  "id, tournament_id, coach_id, student_name, role, status, departed_at, returned_at, rest_days_owed, notes, created_at";
const GEN_COACH_SELECT =
  "id, full_name, initials, title, primary_program_id, season, season_start, season_end, earliest_start, latest_end, midday_block_start, midday_block_end, no_camp, no_bt, no_drive, program_restriction, is_active";

/** Coach row with the primary-program link the generator needs for preference. */
type RawGenCoach = RawCoach & { primary_program_id: string | null };
/** Session row with the stored duration the assignment snapshot needs. */
type RawGenSession = RawSession & { duration_minutes: number | null };
type RawProgramHead = { id: string; head_coach_id: string | null };

const genFail = (error: string): GenerateDraftResult => ({
  ok: false,
  error,
  summary: null,
});

/**
 * Schedule Architect — generate a complete weekly DRAFT.
 *
 * Loads the week's sessions, active roster, availability, program/coach links
 * and any hand-placed assignments, runs the constraint solver
 * (`@/lib/schedule/generate`), and writes the planned assignments as
 * unpublished drafts (`is_published = false`) for one-click approval via the
 * existing Publish action. Only fills sessions that are not already staffed and
 * never duplicates rows: an archived prior row for the same coach+session+week
 * is reactivated instead (core rule: never delete records). Returns a
 * serializable report of what was staffed and what could not be.
 */
export const generateDraft = async (
  weekStartDate: string,
): Promise<GenerateDraftResult> => {
  await requireAdminCoach();

  if (!weekStartDate) return genFail("Missing week.");

  const supabase = createClient();

  const priorWeeks: string[] = [];
  let priorCursor = previousWeekMonday(weekStartDate);
  for (let i = 0; i < 4; i += 1) {
    priorWeeks.push(priorCursor);
    priorCursor = previousWeekMonday(priorCursor);
  }
  const availabilityWeeks = [weekStartDate, ...priorWeeks];

  const [
    sessionsRes,
    coachesRes,
    zonesRes,
    programsRes,
    availabilityRes,
    assignmentsRes,
    tournamentAssignmentsRes,
    tournamentsRes,
    travelAvailabilityRes,
    travelWeeklyRes,
  ] = await Promise.all([
    supabase.from("sessions").select(GEN_SESSION_SELECT),
    supabase.from("coaches").select(GEN_COACH_SELECT).eq("is_active", true),
    supabase.from("court_zones").select("name, location, blocks_main_campus_10am"),
    supabase.from("programs").select("id, head_coach_id"),
    supabase
      .from("coach_availability")
      .select("coach_id, week_start_date, day_of_week, status")
      .eq("week_start_date", weekStartDate),
    supabase
      .from("weekly_assignments")
      .select("id, session_id, coach_id, week_start_date, role, status, is_published")
      .eq("week_start_date", weekStartDate),
    supabase
      .from("tournament_assignments")
      .select(ASSIGNMENT_SELECT_FOR_TRAVEL)
      .eq("status", "published"),
    supabase.from("tournaments").select(TOURNAMENT_SELECT_FOR_TRAVEL),
    supabase
      .from("coach_availability")
      .select("coach_id, week_start_date, day_of_week, status")
      .in("week_start_date", availabilityWeeks),
    supabase
      .from("weekly_assignments")
      .select("coach_id, week_start_date, sessions!inner(programs!inner(type))")
      .in("week_start_date", availabilityWeeks)
      .eq("status", "active"),
  ]);

  const loadError =
    sessionsRes.error?.message ??
    coachesRes.error?.message ??
    programsRes.error?.message ??
    availabilityRes.error?.message ??
    assignmentsRes.error?.message ??
    tournamentAssignmentsRes.error?.message ??
    tournamentsRes.error?.message ??
    travelAvailabilityRes.error?.message ??
    travelWeeklyRes.error?.message ??
    null;
  if (loadError) return genFail(`Could not load schedule data: ${loadError}`);

  const campusByZone = buildCampusByZone((zonesRes.data ?? []) as RawCourtZone[]);

  const rawSessions = (sessionsRes.data ?? []) as unknown as RawGenSession[];
  const sessions: GridSession[] = rawSessions
    .map((row) => toGridSession(row, campusByZone))
    .filter((session): session is GridSession => session !== null);

  const durationBySession = new Map<string, number | null>(
    rawSessions.map((row) => [row.id, row.duration_minutes]),
  );

  const rawCoaches = (coachesRes.data ?? []) as RawGenCoach[];
  const coaches: GridCoach[] = rawCoaches.map(toGridCoach);
  const primaryProgramByCoach = new Map<string, string>();
  for (const row of rawCoaches) {
    if (row.primary_program_id) primaryProgramByCoach.set(row.id, row.primary_program_id);
  }

  const headCoachByProgram = new Map<string, string>();
  for (const row of (programsRes.data ?? []) as RawProgramHead[]) {
    if (row.head_coach_id) headCoachByProgram.set(row.id, row.head_coach_id);
  }

  const weekAvailability: AvailabilityRecord[] = (
    (availabilityRes.data ?? []) as RawAvailability[]
  )
    .map(toAvailabilityRecord)
    .filter((record): record is AvailabilityRecord => record !== null);

  const travelAvailability: AvailabilityRecord[] = (
    (travelAvailabilityRes.data ?? []) as RawAvailability[]
  )
    .map(toAvailabilityRecord)
    .filter((record): record is AvailabilityRecord => record !== null);

  const rawAssignments = (assignmentsRes.data ?? []) as RawAssignment[];
  const gridAssignments: GridAssignment[] = rawAssignments.map(toGridAssignment);
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const existingAssignments = buildActiveContexts(gridAssignments, sessionsById);

  const coachIds = rawCoaches.map((row) => row.id);
  const tournamentsById = new Map(
    ((tournamentsRes.data ?? []) as RawTournament[]).map((row) => [
      row.id,
      toTournament(row),
    ]),
  );
  const tournamentAssignments = ((tournamentAssignmentsRes.data ?? []) as RawTournamentAssignment[]).map(
    toTournamentAssignment,
  );

  type TravelWeeklyRow = {
    coach_id: string;
    week_start_date: string;
    sessions: { programs: { type: string | null } | null } | null;
  };
  const weeklyTravelSessions = ((travelWeeklyRes.data ?? []) as unknown as TravelWeeklyRow[]).map(
    (row) => ({
      coachId: row.coach_id,
      weekStartDate: row.week_start_date,
      sessionType: row.sessions?.programs?.type ?? null,
    }),
  );

  const travelWeekStartsByCoach = buildAllTravelWeekStartsByCoach(coachIds, {
    tournamentAssignments,
    tournamentsById,
    availability: travelAvailability,
    weeklyTravelSessions,
  });
  const travelWeeksByCoach = consecutiveTravelWeeksByCoach(
    coachIds,
    weekStartDate,
    travelWeekStartsByCoach,
  );

  const result = generateSchedule({
    weekStartDate,
    sessions,
    coaches,
    availability: weekAvailability,
    existingAssignments,
    headCoachByProgram,
    primaryProgramByCoach,
    consecutiveTravelWeeksByCoach: travelWeeksByCoach,
  });

  // Persist the planned assignments as drafts. Reactivate archived duplicates
  // rather than inserting a second row for the same coach+session+week.
  const byCoachSession = new Map<string, { id: string; status: string }>();
  for (const row of rawAssignments) {
    byCoachSession.set(`${row.coach_id}:${row.session_id}`, {
      id: row.id,
      status: row.status,
    });
  }

  const toInsert: Array<{
    session_id: string;
    coach_id: string;
    week_start_date: string;
    role: "lead";
    status: "active";
    duration_minutes: number | null;
    is_published: false;
  }> = [];
  const toReactivate: string[] = [];

  for (const plan of result.planned) {
    const existing = byCoachSession.get(`${plan.coachId}:${plan.sessionId}`);
    if (existing?.status === "active") continue;
    if (existing) {
      toReactivate.push(existing.id);
      continue;
    }
    toInsert.push({
      session_id: plan.sessionId,
      coach_id: plan.coachId,
      week_start_date: weekStartDate,
      role: "lead",
      status: "active",
      duration_minutes: durationBySession.get(plan.sessionId) ?? null,
      is_published: false,
    });
  }

  for (const id of toReactivate) {
    const { error: reactivateError } = await supabase
      .from("weekly_assignments")
      .update({ status: "active", role: "lead", is_published: false })
      .eq("id", id);
    if (reactivateError) {
      return genFail(`Could not reactivate a draft assignment: ${reactivateError.message}`);
    }
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("weekly_assignments").insert(toInsert);
    if (insertError) return genFail(`Could not save the draft: ${insertError.message}`);
  }

  revalidatePath("/admin/schedule");

  return {
    ok: true,
    error: null,
    summary: {
      openSessionCount: result.openSessionCount,
      staffedCount: result.staffedCount,
      gapCount: result.gaps.length,
      warningCount: result.warningCount,
      hitNodeLimit: result.hitNodeLimit,
      gaps: result.gaps,
    },
  };
};
