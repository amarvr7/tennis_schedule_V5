"use server";

import { revalidatePath } from "next/cache";

import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import { createClient } from "@/lib/supabase/server";
import { dateForDay, formatWeekRange, WEEKDAYS } from "@/lib/schedule/grid";
import type { AvailabilityRecord, DayOfWeek } from "@/lib/conflicts";
import {
  buildCampusByZone,
  toAvailabilityRecord,
  toGridAssignment,
  toGridCoach,
  toGridSession,
  type GridAssignment,
  type GridSession,
  type RawAssignment,
  type RawAvailability,
  type RawCoach,
  type RawCourtZone,
} from "@/lib/schedule/model";
import { buildActiveContexts } from "@/lib/schedule/conflicts";
import { generateSchedule, type ScheduleGap } from "@/lib/schedule/generate";
import {
  loadScheduleWeek,
  loadStaffingConfig,
  loadTemplateSlots,
  loadWeekSessionRows,
} from "@/lib/schedule/load";
import { recordScheduleChange, type ChangeReason } from "@/lib/schedule/changeLog";
import { CURRENT_SEASON } from "@/lib/schedule/season";
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

/** Serializable summary the Schedule Builder renders after generation. */
export type GenerationSummary = {
  openSlotCount: number;
  staffedCount: number;
  gapCount: number;
  warningCount: number;
  gaps: ScheduleGap[];
};

export type GenerateDraftResult = ActionResult & {
  summary: GenerationSummary | null;
};

export type AssignInput = {
  sessionId: string;
  coachId: string;
  weekStartDate: string;
  role?: "lead" | "assistant";
  /** Non-roster fill — recorded as a substitute (CURSOR_ANSWERS.md Q1/Q4). */
  sub?: boolean;
  /** The absent coach this substitute covers, when known. */
  subbingForCoachId?: string | null;
  reason?: ChangeReason | null;
};

const fail = (error: string): ActionResult => ({ ok: false, error });

const ASSIGNMENT_SELECT =
  "id, session_id, coach_id, week_start_date, role, status, is_published, sub, subbing_for_coach_id";

/** Is this week live for coaches? Drives Q6 instant-change behavior. */
const weekIsPublished = async (
  supabase: ReturnType<typeof createClient>,
  weekStartDate: string,
): Promise<boolean> => {
  const week = await loadScheduleWeek(supabase, weekStartDate);
  if (week?.status === "published") return true;

  // Legacy weeks predate schedule_weeks — fall back to assignment state.
  const { data } = await supabase
    .from("weekly_assignments")
    .select("id")
    .eq("week_start_date", weekStartDate)
    .eq("status", "active")
    .eq("is_published", true)
    .limit(1);

  return (data ?? []).length > 0;
};

const dayLabel = (weekStartDate: string, day: DayOfWeek): string => {
  const weekday = WEEKDAYS.find((entry) => entry.key === day);
  const date = new Date(`${dateForDay(weekStartDate, day)}T00:00:00Z`).toLocaleDateString(
    "en-US",
    { month: "long", day: "numeric", timeZone: "UTC" },
  );
  return `${weekday?.short ?? day} ${date}`;
};

/**
 * Notify the substitute and the substitute's head coach (Q6: active alerts go
 * ONLY to the sub who got added and that sub's head coach).
 */
const notifySubAdded = async (
  supabase: ReturnType<typeof createClient>,
  subCoachId: string,
  programName: string,
  weekStartDate: string,
  day: DayOfWeek | null,
): Promise<void> => {
  const where = day ? dayLabel(weekStartDate, day) : formatWeekRange(weekStartDate);
  const recipients = new Map<string, string>([
    [subCoachId, `You were added to ${programName}, ${where}.`],
  ]);

  const { data: subCoach } = await supabase
    .from("coaches")
    .select("full_name, primary_program_id")
    .eq("id", subCoachId)
    .maybeSingle<{ full_name: string; primary_program_id: string | null }>();

  if (subCoach?.primary_program_id) {
    const { data: program } = await supabase
      .from("programs")
      .select("head_coach_id")
      .eq("id", subCoach.primary_program_id)
      .maybeSingle<{ head_coach_id: string | null }>();

    if (program?.head_coach_id && program.head_coach_id !== subCoachId) {
      recipients.set(
        program.head_coach_id,
        `${subCoach.full_name} was added to ${programName}, ${where}.`,
      );
    }
  }

  await supabase.from("notifications").insert(
    [...recipients.entries()].map(([recipientId, message]) => ({
      recipient_coach_id: recipientId,
      type: "schedule_change",
      message,
    })),
  );
};

/**
 * Assign a coach to a session for a given week. Snapshots the session
 * duration onto the assignment (year-end workload reports). Never inserts a
 * duplicate: an archived prior assignment for the same coach+session+week is
 * reactivated (core rule: never delete records).
 *
 * Q6: on a PUBLISHED week the change applies instantly (no re-publish cycle)
 * and an audit row is appended to schedule_change_log. Substitute adds also
 * alert the sub + their head coach.
 */
export const assignCoach = async (input: AssignInput): Promise<ActionResult> => {
  const admin = await requireAdminCoach();

  const {
    sessionId,
    coachId,
    weekStartDate,
    role = "lead",
    sub = false,
    subbingForCoachId = null,
    reason = null,
  } = input;
  if (!sessionId || !coachId || !weekStartDate) {
    return fail("Missing session, coach, or week.");
  }

  const supabase = createClient();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, duration_minutes, day_of_week, programs ( name )")
    .eq("id", sessionId)
    .maybeSingle<{
      id: string;
      duration_minutes: number | null;
      day_of_week: string | null;
      programs: { name: string } | null;
    }>();

  if (sessionError) return fail(`Could not load session: ${sessionError.message}`);
  if (!session) return fail("Session not found.");

  const isPublishedWeek = await weekIsPublished(supabase, weekStartDate);

  const { data: existing, error: existingError } = await supabase
    .from("weekly_assignments")
    .select("id, status")
    .eq("session_id", sessionId)
    .eq("coach_id", coachId)
    .eq("week_start_date", weekStartDate)
    .maybeSingle<{ id: string; status: string }>();

  if (existingError) return fail(`Could not check existing assignment: ${existingError.message}`);

  const assignmentValues = {
    role,
    sub,
    subbing_for_coach_id: subbingForCoachId,
    duration_minutes: session.duration_minutes,
    // Q6: instant on a live week; draft otherwise.
    is_published: isPublishedWeek,
  };

  let assignmentId: string;

  if (existing) {
    if (existing.status === "active") return { ok: true, error: null };

    const { error: reactivateError } = await supabase
      .from("weekly_assignments")
      .update({ status: "active", ...assignmentValues })
      .eq("id", existing.id);

    if (reactivateError) return fail(`Could not reactivate assignment: ${reactivateError.message}`);
    assignmentId = existing.id;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("weekly_assignments")
      .insert({
        session_id: sessionId,
        coach_id: coachId,
        week_start_date: weekStartDate,
        status: "active",
        ...assignmentValues,
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (insertError) return fail(`Could not assign coach: ${insertError.message}`);
    assignmentId = inserted?.id ?? "";
  }

  if (isPublishedWeek) {
    await recordScheduleChange(supabase, {
      weekStartDate,
      sessionId,
      coachId,
      assignmentId: assignmentId || null,
      changedBy: admin.id,
      action: "assign",
      oldValue: null,
      newValue: { coach_id: coachId, role, sub, subbing_for_coach_id: subbingForCoachId },
      reason: reason ?? (sub ? "other" : null),
    });

    if (sub) {
      await notifySubAdded(
        supabase,
        coachId,
        session.programs?.name ?? "a session",
        weekStartDate,
        (session.day_of_week as DayOfWeek | null) ?? null,
      );
    }
  }

  revalidatePath("/admin/schedule");
  return { ok: true, error: null };
};

/**
 * Remove a coach from a session by archiving the assignment (never delete).
 * On a published week the removal is instant and logged (Q6).
 */
export const unassignCoach = async (
  assignmentId: string,
  reason: ChangeReason | null = null,
): Promise<ActionResult> => {
  const admin = await requireAdminCoach();

  if (!assignmentId) return fail("Missing assignment.");

  const supabase = createClient();

  const { data: assignment } = await supabase
    .from("weekly_assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("id", assignmentId)
    .maybeSingle<RawAssignment>();

  const { error } = await supabase
    .from("weekly_assignments")
    .update({ status: "archived" })
    .eq("id", assignmentId);

  if (error) return fail(`Could not remove assignment: ${error.message}`);

  if (assignment?.is_published) {
    await recordScheduleChange(supabase, {
      weekStartDate: assignment.week_start_date,
      sessionId: assignment.session_id,
      coachId: assignment.coach_id,
      assignmentId,
      changedBy: admin.id,
      action: "unassign",
      oldValue: {
        coach_id: assignment.coach_id,
        role: assignment.role,
        sub: assignment.sub ?? false,
      },
      newValue: null,
      reason,
    });
  }

  revalidatePath("/admin/schedule");
  return { ok: true, error: null };
};

/**
 * Publish the week: flip every active assignment to is_published = true, mark
 * the week record published (future edits become instant changes, Q6), and
 * notify each assigned coach.
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

  const { error: weekError } = await supabase
    .from("schedule_weeks")
    .upsert(
      { week_start_date: weekStartDate, season: CURRENT_SEASON, status: "published" },
      { onConflict: "week_start_date" },
    );

  if (weekError) {
    return { ok: false, error: `Published, but could not mark the week: ${weekError.message}`, notified: 0 };
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

/**
 * Create the week from the master template (Q2): one schedule_weeks record +
 * a cloned sessions row per active template slot. Edits to the week copy
 * never touch the master; edits to the master affect only weeks created
 * afterward.
 */
export const createWeekFromTemplate = async (
  weekStartDate: string,
  campHeadcount: number | null = null,
): Promise<ActionResult> => {
  await requireAdminCoach();

  if (!weekStartDate) return fail("Missing week.");

  const supabase = createClient();

  const existing = await loadScheduleWeek(supabase, weekStartDate);
  if (existing) return fail("This week has already been created.");

  const slots = await loadTemplateSlots(supabase);
  if (slots.length === 0) {
    return fail("The master week template is empty — add slots in Week Template first.");
  }

  const { error: weekError } = await supabase.from("schedule_weeks").insert({
    week_start_date: weekStartDate,
    season: CURRENT_SEASON,
    camp_headcount: campHeadcount,
    status: "draft",
    created_from_template_at: new Date().toISOString(),
  });

  if (weekError) return fail(`Could not create the week: ${weekError.message}`);

  const { error: cloneError } = await supabase.from("sessions").insert(
    slots.map((slot) => ({
      program_id: slot.programId,
      day_of_week: slot.dayOfWeek,
      start_time: slot.startTime,
      end_time: slot.endTime,
      court_zone: slot.courtZone,
      court_numbers: slot.courtNumbers,
      surface: slot.surface,
      season: CURRENT_SEASON,
      notes: slot.notes,
      week_start_date: weekStartDate,
      template_session_id: slot.id,
      is_active: true,
    })),
  );

  if (cloneError) return fail(`Could not clone the template: ${cloneError.message}`);

  revalidatePath("/admin/schedule");
  return { ok: true, error: null };
};

/** Camp head count for the week, entered by admin during week setup (Q3). */
export const updateCampHeadcount = async (
  weekStartDate: string,
  campHeadcount: number | null,
): Promise<ActionResult> => {
  await requireAdminCoach();

  if (!weekStartDate) return fail("Missing week.");
  if (campHeadcount !== null && (!Number.isFinite(campHeadcount) || campHeadcount < 0)) {
    return fail("Camp head count must be a non-negative number.");
  }

  const supabase = createClient();

  const { error } = await supabase
    .from("schedule_weeks")
    .update({ camp_headcount: campHeadcount })
    .eq("week_start_date", weekStartDate);

  if (error) return fail(`Could not save camp head count: ${error.message}`);

  revalidatePath("/admin/schedule");
  revalidatePath("/admin/schedule/coverage");
  return { ok: true, error: null };
};

/**
 * Per-session head count (adults). Adults enrollment differs each day and
 * between the AM and PM tracks — unlike camp's single weekly number — so the
 * count is saved on the specific session row. Drives the adults staffing
 * warning on the coverage report (warn-only, never blocks).
 */
export const updateSessionHeadcount = async (
  sessionId: string,
  headcount: number | null,
): Promise<ActionResult> => {
  await requireAdminCoach();

  if (!sessionId) return fail("Missing session.");
  if (headcount !== null && (!Number.isFinite(headcount) || headcount < 0)) {
    return fail("Head count must be a non-negative number.");
  }

  const supabase = createClient();

  const { error } = await supabase
    .from("sessions")
    .update({ headcount })
    .eq("id", sessionId);

  if (error) return fail(`Could not save head count: ${error.message}`);

  revalidatePath("/admin/schedule");
  revalidatePath("/admin/schedule/coverage");
  return { ok: true, error: null };
};

const TOURNAMENT_SELECT_FOR_TRAVEL =
  "id, name, location, is_local, start_date, end_date, days_count, tournament_type, program_id, is_canceled, is_archived, published_at, notes";
const ASSIGNMENT_SELECT_FOR_TRAVEL =
  "id, tournament_id, coach_id, student_name, role, status, departed_at, returned_at, rest_days_owed, notes, created_at";
const GEN_COACH_SELECT =
  "id, full_name, initials, title, season, season_start, season_end, earliest_start, latest_end, midday_block_start, midday_block_end, no_camp, no_bt, no_drive, program_restriction, is_active";

const genFail = (error: string): GenerateDraftResult => ({
  ok: false,
  error,
  summary: null,
});

/**
 * Generate the weekly DRAFT — roster-first (CURSOR_ANSWERS.md Q1/Q5).
 *
 * Places each group's season roster into the group's sessions for the week
 * and reports every slot it could not fill. It never pulls from the general
 * pool: substitutes are suggestion-only, chosen manually by the admin via
 * "Find coach" on the coverage report (Q4). Planned assignments are written
 * as unpublished drafts for one-click approval via Publish.
 */
export const generateDraft = async (
  weekStartDate: string,
): Promise<GenerateDraftResult> => {
  await requireAdminCoach();

  if (!weekStartDate) return genFail("Missing week.");

  const supabase = createClient();

  const scheduleWeek = await loadScheduleWeek(supabase, weekStartDate);

  const priorWeeks: string[] = [];
  let priorCursor = previousWeekMonday(weekStartDate);
  for (let i = 0; i < 4; i += 1) {
    priorWeeks.push(priorCursor);
    priorCursor = previousWeekMonday(priorCursor);
  }
  const availabilityWeeks = [weekStartDate, ...priorWeeks];

  const [
    sessionsRes,
    staffingConfig,
    coachesRes,
    zonesRes,
    availabilityRes,
    assignmentsRes,
    tournamentAssignmentsRes,
    tournamentsRes,
    travelAvailabilityRes,
    travelWeeklyRes,
  ] = await Promise.all([
    loadWeekSessionRows(supabase, weekStartDate, scheduleWeek !== null),
    loadStaffingConfig(supabase),
    supabase.from("coaches").select(GEN_COACH_SELECT).eq("is_active", true),
    supabase.from("court_zones").select("name, location, blocks_main_campus_10am"),
    supabase
      .from("coach_availability")
      .select("coach_id, week_start_date, day_of_week, status")
      .eq("week_start_date", weekStartDate),
    supabase
      .from("weekly_assignments")
      .select(ASSIGNMENT_SELECT)
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
    sessionsRes.error ??
    coachesRes.error?.message ??
    availabilityRes.error?.message ??
    assignmentsRes.error?.message ??
    tournamentAssignmentsRes.error?.message ??
    tournamentsRes.error?.message ??
    travelAvailabilityRes.error?.message ??
    travelWeeklyRes.error?.message ??
    null;
  if (loadError) return genFail(`Could not load schedule data: ${loadError}`);

  const campusByZone = buildCampusByZone((zonesRes.data ?? []) as RawCourtZone[]);

  const sessions: GridSession[] = sessionsRes.rows
    .map((row) => toGridSession(row, campusByZone))
    .filter((session): session is GridSession => session !== null);

  const durationBySession = new Map<string, number | null>(
    sessionsRes.rows.map((row) => [row.id, row.duration_minutes]),
  );

  const rawCoaches = (coachesRes.data ?? []) as RawCoach[];
  const coaches = rawCoaches.map(toGridCoach);

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
    rosterByProgram: staffingConfig.rosterByProgram,
    requirementByProgram: staffingConfig.requirementByProgram,
    consecutiveTravelWeeksByCoach: travelWeeksByCoach,
  });

  // Persist the planned assignments as drafts. Reactivate archived duplicates
  // rather than inserting a second row (core rule: never delete records).
  const byCoachSession = new Map<string, { id: string; status: string }>();
  for (const row of rawAssignments) {
    byCoachSession.set(`${row.coach_id}:${row.session_id}`, {
      id: row.id,
      status: row.status,
    });
  }

  const toInsert: Array<Record<string, unknown>> = [];
  const toReactivate: Array<{ id: string; role: "lead" | "assistant" }> = [];

  for (const plan of result.planned) {
    const existing = byCoachSession.get(`${plan.coachId}:${plan.sessionId}`);
    if (existing?.status === "active") continue;
    if (existing) {
      toReactivate.push({ id: existing.id, role: plan.role });
      continue;
    }
    toInsert.push({
      session_id: plan.sessionId,
      coach_id: plan.coachId,
      week_start_date: weekStartDate,
      role: plan.role,
      status: "active",
      sub: false,
      subbing_for_coach_id: null,
      duration_minutes: durationBySession.get(plan.sessionId) ?? null,
      is_published: false,
    });
  }

  for (const entry of toReactivate) {
    const { error: reactivateError } = await supabase
      .from("weekly_assignments")
      .update({ status: "active", role: entry.role, sub: false, is_published: false })
      .eq("id", entry.id);
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
      openSlotCount: result.openSlotCount,
      staffedCount: result.staffedCount,
      gapCount: result.gaps.length,
      warningCount: result.warningCount,
      gaps: result.gaps,
    },
  };
};
