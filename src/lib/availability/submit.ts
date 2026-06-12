/**
 * Persist coach availability from a magic-link form submission.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AvailabilityStatus } from "@/lib/conflicts";
import type { DayOfWeek } from "@/lib/conflicts";

import type { DayAvailabilityInput } from "./types";

export type TokenLookup = {
  requestId: string;
  coachId: string;
  weekStartDate: string;
  collectionStatus: "open" | "closed";
  coachName: string;
  existingDays: Partial<Record<DayOfWeek, AvailabilityStatus>>;
  existingNotes: string | null;
};

export const loadRequestByToken = async (
  supabase: SupabaseClient,
  token: string,
): Promise<TokenLookup | null> => {
  const { data, error } = await supabase
    .from("availability_requests")
    .select(
      `id, coach_id, status, responded_at,
       collection:availability_collections ( week_start_date, status ),
       coach:coaches ( full_name )`,
    )
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return null;

  const collection = Array.isArray(data.collection) ? data.collection[0] : data.collection;
  const coach = Array.isArray(data.coach) ? data.coach[0] : data.coach;

  if (!collection) return null;

  const { data: availability } = await supabase
    .from("coach_availability")
    .select("day_of_week, status, notes")
    .eq("coach_id", data.coach_id)
    .eq("week_start_date", collection.week_start_date);

  const existingDays: Partial<Record<DayOfWeek, AvailabilityStatus>> = {};
  let existingNotes: string | null = null;

  for (const row of availability ?? []) {
    if (row.day_of_week) {
      existingDays[row.day_of_week as DayOfWeek] = row.status as AvailabilityStatus;
      if (row.notes && !existingNotes) existingNotes = row.notes;
    }
  }

  return {
    requestId: data.id,
    coachId: data.coach_id,
    weekStartDate: collection.week_start_date,
    collectionStatus: collection.status,
    coachName: coach?.full_name ?? "Coach",
    existingDays,
    existingNotes,
  };
};

/** Upsert per-day availability and mark the request responded. */
export const submitAvailability = async (
  supabase: SupabaseClient,
  input: {
    token: string;
    days: DayAvailabilityInput[];
    notes: string | null;
  },
): Promise<{ ok: boolean; error: string | null }> => {
  const lookup = await loadRequestByToken(supabase, input.token);
  if (!lookup) {
    return { ok: false, error: "This link is invalid or has expired." };
  }

  if (lookup.collectionStatus !== "open") {
    return {
      ok: false,
      error: "The availability window is closed. Contact Tennis Operations.",
    };
  }

  const { data: existingRows } = await supabase
    .from("coach_availability")
    .select("id, day_of_week")
    .eq("coach_id", lookup.coachId)
    .eq("week_start_date", lookup.weekStartDate);

  const existingByDay = new Map(
    (existingRows ?? [])
      .filter((row) => row.day_of_week)
      .map((row) => [row.day_of_week as string, row.id as string]),
  );

  const trimmedNotes = input.notes?.trim() || null;
  const now = new Date().toISOString();

  for (const day of input.days) {
    const existingId = existingByDay.get(day.dayOfWeek);

    if (existingId) {
      const { error } = await supabase
        .from("coach_availability")
        .update({
          status: day.status,
          notes: trimmedNotes,
        })
        .eq("id", existingId);

      if (error) return { ok: false, error: error.message };
      continue;
    }

    const { error } = await supabase.from("coach_availability").insert({
      coach_id: lookup.coachId,
      week_start_date: lookup.weekStartDate,
      day_of_week: day.dayOfWeek,
      status: day.status,
      notes: trimmedNotes,
    });

    if (error) return { ok: false, error: error.message };
  }

  const { error: requestError } = await supabase
    .from("availability_requests")
    .update({
      status: "responded",
      responded_at: now,
    })
    .eq("id", lookup.requestId);

  if (requestError) return { ok: false, error: requestError.message };

  return { ok: true, error: null };
};
