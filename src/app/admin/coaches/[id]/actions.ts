"use server";

import { revalidatePath } from "next/cache";

import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import {
  diffRules,
  normalizeTime,
  toCoachColumns,
  toEditableRules,
  type CoachRecord,
  type EditableRules,
} from "@/lib/coaches/rules";
import { createClient } from "@/lib/supabase/server";

export type RulesFormState = {
  error: string | null;
  message: string | null;
  savedAt: number | null;
};

const today = (): string => new Date().toISOString().slice(0, 10);

const readRulesFromForm = (formData: FormData): EditableRules => ({
  no_camp: formData.get("no_camp") === "on",
  no_bt: formData.get("no_bt") === "on",
  no_drive: formData.get("no_drive") === "on",
  travel_restricted: formData.get("travel_restricted") === "on",
  adults_only: formData.get("adults_only") === "on",
  earliest_start: normalizeTime(String(formData.get("earliest_start") ?? "")),
  latest_end: normalizeTime(String(formData.get("latest_end") ?? "")),
  midday_block_start: normalizeTime(String(formData.get("midday_block_start") ?? "")),
  midday_block_end: normalizeTime(String(formData.get("midday_block_end") ?? "")),
});

/**
 * Admin edits to a coach's rules. For every changed rule we write the history
 * ledger BEFORE the new value, then update the denormalized `coaches` columns:
 *   1. Close any open `coach_rules` row (set effective_to = today), or — if none
 *      exists yet — insert a closed row capturing the old value so the prior
 *      state is never lost (CURSOR_CONTEXT.md: never delete; end-date old rules).
 *   2. Insert the new open row (effective_from = today, effective_to = null).
 *   3. Update the matching `coaches` columns to the new current state.
 */
export const updateCoachRules = async (
  _prevState: RulesFormState,
  formData: FormData,
): Promise<RulesFormState> => {
  await requireAdminCoach();

  const coachId = String(formData.get("coach_id") ?? "");
  if (!coachId) {
    return { error: "Missing coach id.", message: null, savedAt: null };
  }

  const supabase = createClient();

  const { data: coach, error: loadError } = await supabase
    .from("coaches")
    .select(
      "id, full_name, initials, title, season, season_start, season_end, earliest_start, latest_end, midday_block_start, midday_block_end, no_camp, no_bt, no_drive, travel_restricted, program_restriction, is_admin, is_active, onboarding_status, created_at",
    )
    .eq("id", coachId)
    .maybeSingle<CoachRecord>();

  if (loadError) {
    return { error: `Could not load coach: ${loadError.message}`, message: null, savedAt: null };
  }
  if (!coach) {
    return { error: "Coach not found.", message: null, savedAt: null };
  }

  const current = toEditableRules(coach);
  const next = readRulesFromForm(formData);
  const changes = diffRules(current, next);

  if (changes.length === 0) {
    return { error: null, message: "No changes to save.", savedAt: Date.now() };
  }

  const effectiveDate = today();
  const coachCreatedDate = coach.created_at.slice(0, 10);

  for (const change of changes) {
    const { data: closedRows, error: closeError } = await supabase
      .from("coach_rules")
      .update({ effective_to: effectiveDate })
      .eq("coach_id", coachId)
      .eq("rule_type", change.ruleType)
      .is("effective_to", null)
      .select("id");

    if (closeError) {
      return { error: `Could not archive existing rule: ${closeError.message}`, message: null, savedAt: null };
    }

    // No open ledger row existed (rule only lived as a coaches column until now).
    // Record the prior value as a closed row so history stays complete.
    if (!closedRows || closedRows.length === 0) {
      const { error: backfillError } = await supabase.from("coach_rules").insert({
        coach_id: coachId,
        rule_type: change.ruleType,
        priority: change.priority,
        value: change.previousValue,
        effective_from: coachCreatedDate,
        effective_to: effectiveDate,
      });

      if (backfillError) {
        return { error: `Could not record prior rule: ${backfillError.message}`, message: null, savedAt: null };
      }
    }

    const { error: insertError } = await supabase.from("coach_rules").insert({
      coach_id: coachId,
      rule_type: change.ruleType,
      priority: change.priority,
      value: change.nextValue,
      effective_from: effectiveDate,
      effective_to: null,
    });

    if (insertError) {
      return { error: `Could not save new rule: ${insertError.message}`, message: null, savedAt: null };
    }
  }

  const { error: updateError } = await supabase
    .from("coaches")
    .update(toCoachColumns(next))
    .eq("id", coachId);

  if (updateError) {
    return { error: `Could not update coach: ${updateError.message}`, message: null, savedAt: null };
  }

  revalidatePath(`/admin/coaches/${coachId}`);
  revalidatePath("/admin/coaches");

  const label = changes.length === 1 ? "1 rule" : `${changes.length} rules`;
  return { error: null, message: `Saved ${label}.`, savedAt: Date.now() };
};
