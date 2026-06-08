import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import { createClient } from "@/lib/supabase/server";
import {
  buildCampusByZone,
  toGridAssignment,
  toGridCoach,
  toGridSession,
  toAvailabilityRecord,
  type GridAssignment,
  type GridCoach,
  type GridSession,
  type RawAssignment,
  type RawAvailability,
  type RawCoach,
  type RawCourtZone,
  type RawSession,
} from "@/lib/schedule/model";
import type { AvailabilityRecord } from "@/lib/conflicts";
import { normalizeWeekStart } from "@/lib/schedule/grid";
import { ScheduleBuilder } from "./ScheduleBuilder";

export const metadata = {
  title: "Schedule Builder · IMG Academy Tennis",
};

const SESSION_SELECT =
  "id, program_id, day_of_week, start_time, end_time, court_zone, court_numbers, surface, notes, programs ( id, name, type )";
const COACH_SELECT =
  "id, full_name, initials, title, season, season_start, season_end, earliest_start, latest_end, midday_block_start, midday_block_end, no_camp, no_bt, no_drive, program_restriction, is_active";

type SearchParams = { week?: string };

const AdminSchedulePage = async ({
  searchParams,
}: {
  searchParams: SearchParams;
}) => {
  await requireAdminCoach();
  const supabase = createClient();

  const weekStartDate = normalizeWeekStart(searchParams.week);

  const [sessionsRes, coachesRes, zonesRes, assignmentsRes, availabilityRes] =
    await Promise.all([
      supabase.from("sessions").select(SESSION_SELECT),
      supabase.from("coaches").select(COACH_SELECT).eq("is_active", true).order("full_name"),
      supabase.from("court_zones").select("name, location, blocks_main_campus_10am"),
      supabase
        .from("weekly_assignments")
        .select("id, session_id, coach_id, week_start_date, role, status, is_published")
        .eq("week_start_date", weekStartDate),
      supabase
        .from("coach_availability")
        .select("coach_id, week_start_date, day_of_week, status")
        .eq("week_start_date", weekStartDate),
    ]);

  const loadError =
    sessionsRes.error?.message ??
    coachesRes.error?.message ??
    assignmentsRes.error?.message ??
    null;

  const campusByZone = buildCampusByZone((zonesRes.data ?? []) as RawCourtZone[]);

  const sessions: GridSession[] = ((sessionsRes.data ?? []) as unknown as RawSession[])
    .map((row) => toGridSession(row, campusByZone))
    .filter((session): session is GridSession => session !== null);

  const coaches: GridCoach[] = ((coachesRes.data ?? []) as RawCoach[]).map(toGridCoach);

  const assignments: GridAssignment[] = ((assignmentsRes.data ?? []) as RawAssignment[]).map(
    toGridAssignment,
  );

  const availability: AvailabilityRecord[] = ((availabilityRes.data ?? []) as RawAvailability[])
    .map(toAvailabilityRecord)
    .filter((record): record is AvailabilityRecord => record !== null);

  return (
    <ScheduleBuilder
      weekStartDate={weekStartDate}
      sessions={sessions}
      coaches={coaches}
      initialAssignments={assignments}
      availability={availability}
      loadError={loadError}
    />
  );
};

export default AdminSchedulePage;
