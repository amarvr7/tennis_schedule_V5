"use server";

import { revalidatePath } from "next/cache";

import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_SEASON } from "@/lib/schedule/season";

export type TemplateActionResult = {
  ok: boolean;
  error: string | null;
};

export type TemplateSlotInput = {
  programId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  courtZone: string;
  courtNumbers: string;
  surface: string;
  notes: string;
};

const DAYS = new Set([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

const TIME_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d$/;

const fail = (error: string): TemplateActionResult => ({ ok: false, error });
const succeed = (): TemplateActionResult => ({ ok: true, error: null });

const validateSlot = (input: TemplateSlotInput): string | null => {
  if (!input.programId) return "Pick a group for the slot.";
  if (!DAYS.has(input.dayOfWeek)) return "Pick a day of the week.";
  if (!TIME_PATTERN.test(input.startTime) || !TIME_PATTERN.test(input.endTime)) {
    return "Start and end times must be HH:MM.";
  }
  if (input.startTime >= input.endTime) return "End time must be after the start time.";
  return null;
};

const toRow = (input: TemplateSlotInput) => ({
  program_id: input.programId,
  day_of_week: input.dayOfWeek,
  start_time: input.startTime,
  end_time: input.endTime,
  court_zone: input.courtZone || null,
  court_numbers: input.courtNumbers || null,
  surface: input.surface || null,
  notes: input.notes || null,
});

/**
 * Add a slot to the master week template (CURSOR_ANSWERS.md Q2). Edits to the
 * master affect only weeks created afterward.
 */
export const addTemplateSlot = async (
  input: TemplateSlotInput,
): Promise<TemplateActionResult> => {
  await requireAdminCoach();

  const invalid = validateSlot(input);
  if (invalid) return fail(invalid);

  const supabase = createClient();

  const { error } = await supabase.from("template_sessions").insert({
    ...toRow(input),
    season: CURRENT_SEASON,
    is_active: true,
  });

  if (error) return fail(`Could not add the slot: ${error.message}`);

  revalidatePath("/admin/template");
  revalidatePath("/admin/schedule");
  return succeed();
};

/** Edit a master template slot (affects only weeks created afterward). */
export const updateTemplateSlot = async (
  slotId: string,
  input: TemplateSlotInput,
): Promise<TemplateActionResult> => {
  await requireAdminCoach();

  if (!slotId) return fail("Missing slot.");
  const invalid = validateSlot(input);
  if (invalid) return fail(invalid);

  const supabase = createClient();

  const { error } = await supabase
    .from("template_sessions")
    .update(toRow(input))
    .eq("id", slotId);

  if (error) return fail(`Could not save the slot: ${error.message}`);

  revalidatePath("/admin/template");
  revalidatePath("/admin/schedule");
  return succeed();
};

/** Remove a slot from the master by archiving it (never delete records). */
export const archiveTemplateSlot = async (
  slotId: string,
): Promise<TemplateActionResult> => {
  await requireAdminCoach();

  if (!slotId) return fail("Missing slot.");

  const supabase = createClient();

  const { error } = await supabase
    .from("template_sessions")
    .update({ is_active: false })
    .eq("id", slotId);

  if (error) return fail(`Could not remove the slot: ${error.message}`);

  revalidatePath("/admin/template");
  revalidatePath("/admin/schedule");
  return succeed();
};

/**
 * Week-copy session edits (Q2): delete a slot / move a time / change courts on
 * ONE week only. Never touches the master template.
 */
export const updateWeekSession = async (
  sessionId: string,
  input: Omit<TemplateSlotInput, "programId">,
): Promise<TemplateActionResult> => {
  await requireAdminCoach();

  if (!sessionId) return fail("Missing session.");
  if (!DAYS.has(input.dayOfWeek)) return fail("Pick a day of the week.");
  if (!TIME_PATTERN.test(input.startTime) || !TIME_PATTERN.test(input.endTime)) {
    return fail("Start and end times must be HH:MM.");
  }
  if (input.startTime >= input.endTime) return fail("End time must be after the start time.");

  const supabase = createClient();

  const { error } = await supabase
    .from("sessions")
    .update({
      day_of_week: input.dayOfWeek,
      start_time: input.startTime,
      end_time: input.endTime,
      court_zone: input.courtZone || null,
      court_numbers: input.courtNumbers || null,
      surface: input.surface || null,
      notes: input.notes || null,
    })
    .eq("id", sessionId)
    .not("week_start_date", "is", null); // only week copies, never the master grid

  if (error) return fail(`Could not save the session: ${error.message}`);

  revalidatePath("/admin/schedule");
  return succeed();
};

/** Remove a session from one week's copy by archiving it (never delete). */
export const archiveWeekSession = async (
  sessionId: string,
): Promise<TemplateActionResult> => {
  await requireAdminCoach();

  if (!sessionId) return fail("Missing session.");

  const supabase = createClient();

  const { error } = await supabase
    .from("sessions")
    .update({ is_active: false })
    .eq("id", sessionId)
    .not("week_start_date", "is", null);

  if (error) return fail(`Could not remove the session: ${error.message}`);

  revalidatePath("/admin/schedule");
  return succeed();
};
