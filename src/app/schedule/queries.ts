import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AvailabilityRecord } from "@/lib/conflicts";
import { toAvailabilityRecord, type RawAvailability } from "@/lib/schedule/model";
import type { RawMyAssignment } from "@/lib/schedule/myWeek";

/**
 * Shared data access for the coach read-only view. Row Level Security already
 * scopes every query to the calling coach's own rows (see RLS policies), so
 * these helpers never filter by coach_id — they simply load "my" data.
 */

const MY_ASSIGNMENT_SELECT =
  "id, role, status, is_published, week_start_date, " +
  "sessions ( id, day_of_week, start_time, end_time, court_zone, court_numbers, surface, programs ( id, name, type ) )";

/** This coach's active, published assignments for the given week. */
export const loadMyAssignments = async (
  supabase: SupabaseClient,
  weekStartDate: string,
): Promise<{ rows: RawMyAssignment[]; error: string | null }> => {
  const { data, error } = await supabase
    .from("weekly_assignments")
    .select(MY_ASSIGNMENT_SELECT)
    .eq("week_start_date", weekStartDate)
    .eq("status", "active")
    .eq("is_published", true);

  return {
    rows: (data ?? []) as unknown as RawMyAssignment[],
    error: error?.message ?? null,
  };
};

/** This coach's availability rows for the given week (PTO / traveling / rest). */
export const loadMyAvailability = async (
  supabase: SupabaseClient,
  weekStartDate: string,
): Promise<AvailabilityRecord[]> => {
  const { data } = await supabase
    .from("coach_availability")
    .select("coach_id, week_start_date, day_of_week, status")
    .eq("week_start_date", weekStartDate);

  return ((data ?? []) as RawAvailability[])
    .map(toAvailabilityRecord)
    .filter((record): record is AvailabilityRecord => record !== null);
};
