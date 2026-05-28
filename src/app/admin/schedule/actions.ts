"use server";

import { revalidatePath } from "next/cache";

import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import { createClient } from "@/lib/supabase/server";
import { formatWeekRange } from "@/lib/schedule/grid";

export type ActionResult = {
  ok: boolean;
  error: string | null;
};

export type PublishResult = ActionResult & {
  notified: number;
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
