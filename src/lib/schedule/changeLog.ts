import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Schedule change audit trail (CURSOR_ANSWERS.md Q6). Assignments are never
 * overwritten destructively — every change to a published week appends a row
 * here so any past week can be viewed "as originally published" vs "as it
 * actually ran". No approval workflow: admins make the changes themselves.
 */

export type ChangeAction = "assign" | "unassign" | "swap" | "session_change";
export type ChangeReason = "sick" | "travel" | "swap" | "other";

export interface ScheduleChangeEntry {
  weekStartDate: string;
  sessionId: string | null;
  /** The coach affected by the change (added, removed, or swapped). */
  coachId: string | null;
  assignmentId: string | null;
  changedBy: string;
  action: ChangeAction;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  reason: ChangeReason | null;
}

export const recordScheduleChange = async (
  supabase: SupabaseClient,
  entry: ScheduleChangeEntry,
): Promise<string | null> => {
  const { error } = await supabase.from("schedule_change_log").insert({
    week_start_date: entry.weekStartDate,
    session_id: entry.sessionId,
    coach_id: entry.coachId,
    assignment_id: entry.assignmentId,
    changed_by: entry.changedBy,
    action: entry.action,
    old_value: entry.oldValue,
    new_value: entry.newValue,
    reason: entry.reason,
  });

  return error ? error.message : null;
};

export interface ChangeLogRow {
  id: string;
  weekStartDate: string;
  sessionId: string | null;
  coachId: string | null;
  assignmentId: string | null;
  changedBy: string | null;
  changedAt: string;
  action: ChangeAction | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  reason: ChangeReason | null;
}

const CHANGE_LOG_SELECT =
  "id, week_start_date, session_id, coach_id, assignment_id, changed_by, changed_at, action, old_value, new_value, reason";

type RawChangeLogRow = {
  id: string;
  week_start_date: string | null;
  session_id: string | null;
  coach_id: string | null;
  assignment_id: string | null;
  changed_by: string | null;
  changed_at: string;
  action: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
};

const ACTIONS: ReadonlyArray<ChangeAction> = ["assign", "unassign", "swap", "session_change"];
const REASONS: ReadonlyArray<ChangeReason> = ["sick", "travel", "swap", "other"];

/** All change log rows for one week, newest first (RLS scopes visibility). */
export const loadWeekChangeLog = async (
  supabase: SupabaseClient,
  weekStartDate: string,
): Promise<ChangeLogRow[]> => {
  const { data, error } = await supabase
    .from("schedule_change_log")
    .select(CHANGE_LOG_SELECT)
    .eq("week_start_date", weekStartDate)
    .order("changed_at", { ascending: false });

  if (error) return [];

  return ((data ?? []) as RawChangeLogRow[]).map((row) => ({
    id: row.id,
    weekStartDate: row.week_start_date ?? weekStartDate,
    sessionId: row.session_id,
    coachId: row.coach_id,
    assignmentId: row.assignment_id,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
    action: (ACTIONS as readonly string[]).includes(row.action ?? "")
      ? (row.action as ChangeAction)
      : null,
    oldValue: row.old_value,
    newValue: row.new_value,
    reason: (REASONS as readonly string[]).includes(row.reason ?? "")
      ? (row.reason as ChangeReason)
      : null,
  }));
};
