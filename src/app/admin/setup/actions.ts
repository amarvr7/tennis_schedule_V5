"use server";

import { revalidatePath } from "next/cache";

import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_SEASON } from "@/lib/schedule/season";

export type SetupActionResult = {
  ok: boolean;
  error: string | null;
};

const fail = (error: string): SetupActionResult => ({ ok: false, error });
const succeed = (): SetupActionResult => ({ ok: true, error: null });

const isCount = (value: number): boolean =>
  Number.isInteger(value) && value >= 0 && value <= 20;

/**
 * Per-group staffing requirement (CURSOR_ANSWERS.md Q1) + camp base capacity
 * (Q3). Set once per season when groups are formed.
 */
export const updateGroupStaffing = async (input: {
  programId: string;
  requiredLeadCount: number;
  requiredAssistantCount: number;
  baseCapacity: number | null;
}): Promise<SetupActionResult> => {
  await requireAdminCoach();

  const { programId, requiredLeadCount, requiredAssistantCount, baseCapacity } = input;
  if (!programId) return fail("Missing group.");
  if (!isCount(requiredLeadCount) || !isCount(requiredAssistantCount)) {
    return fail("Lead and assistant counts must be whole numbers between 0 and 20.");
  }
  if (baseCapacity !== null && (!Number.isInteger(baseCapacity) || baseCapacity <= 0)) {
    return fail("Base capacity must be a positive whole number (or left blank).");
  }

  const supabase = createClient();

  const { error } = await supabase
    .from("programs")
    .update({
      required_lead_count: requiredLeadCount,
      required_assistant_count: requiredAssistantCount,
      base_capacity: baseCapacity,
    })
    .eq("id", programId);

  if (error) return fail(`Could not save staffing requirement: ${error.message}`);

  revalidatePath("/admin/setup");
  revalidatePath("/admin/schedule");
  return succeed();
};

/** Add a coach to a group's season team (Q1). */
export const addRosterMember = async (input: {
  programId: string;
  coachId: string;
  role: "lead" | "assistant";
}): Promise<SetupActionResult> => {
  await requireAdminCoach();

  const { programId, coachId, role } = input;
  if (!programId || !coachId) return fail("Missing group or coach.");
  if (role !== "lead" && role !== "assistant") return fail("Invalid roster role.");

  const supabase = createClient();

  // Reactivate a prior membership instead of inserting a duplicate
  // (core rule: never delete records — deactivated rows are history).
  const { data: existing, error: existingError } = await supabase
    .from("group_coach_roster")
    .select("id, is_active")
    .eq("program_id", programId)
    .eq("coach_id", coachId)
    .eq("season", CURRENT_SEASON)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; is_active: boolean }>();

  if (existingError) return fail(`Could not check the roster: ${existingError.message}`);

  if (existing) {
    const { error } = await supabase
      .from("group_coach_roster")
      .update({ is_active: true, role })
      .eq("id", existing.id);

    if (error) return fail(`Could not add to the roster: ${error.message}`);
  } else {
    const { error } = await supabase.from("group_coach_roster").insert({
      program_id: programId,
      coach_id: coachId,
      role,
      season: CURRENT_SEASON,
      is_active: true,
    });

    if (error) return fail(`Could not add to the roster: ${error.message}`);
  }

  revalidatePath("/admin/setup");
  revalidatePath("/admin/schedule");
  return succeed();
};

/** Remove a coach from a group's season team by deactivating the row. */
export const removeRosterMember = async (rosterId: string): Promise<SetupActionResult> => {
  await requireAdminCoach();

  if (!rosterId) return fail("Missing roster entry.");

  const supabase = createClient();

  const { error } = await supabase
    .from("group_coach_roster")
    .update({ is_active: false })
    .eq("id", rosterId);

  if (error) return fail(`Could not remove from the roster: ${error.message}`);

  revalidatePath("/admin/setup");
  revalidatePath("/admin/schedule");
  return succeed();
};
