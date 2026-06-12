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
} from "@/lib/schedule/model";
import type { AvailabilityRecord } from "@/lib/conflicts";
import { normalizeWeekStart } from "@/lib/schedule/grid";
import {
  loadScheduleWeek,
  loadSeasonSettings,
  loadStaffingConfig,
  loadSubHistory,
  loadWeekSessionRows,
} from "@/lib/schedule/load";
import { loadWeekChangeLog } from "@/lib/schedule/changeLog";
import { SUMMER_2025 } from "@/lib/reports/types";
import { CoverageReport } from "./CoverageReport";

export const metadata = {
  title: "Coverage · IMG Academy Tennis",
};

const COACH_SELECT =
  "id, full_name, initials, title, season, season_start, season_end, earliest_start, latest_end, midday_block_start, midday_block_end, no_camp, no_bt, no_drive, program_restriction, is_active";

const ASSIGNMENT_SELECT =
  "id, session_id, coach_id, week_start_date, role, status, is_published, sub, subbing_for_coach_id";

type SearchParams = { week?: string };

const CoveragePage = async ({ searchParams }: { searchParams: SearchParams }) => {
  await requireAdminCoach();
  const supabase = createClient();

  const weekStartDate = normalizeWeekStart(searchParams.week);
  const scheduleWeek = await loadScheduleWeek(supabase, weekStartDate);

  const [
    sessionsRes,
    staffingConfig,
    settings,
    subHistory,
    changeLog,
    coachesRes,
    zonesRes,
    assignmentsRes,
    availabilityRes,
  ] = await Promise.all([
    loadWeekSessionRows(supabase, weekStartDate, scheduleWeek !== null),
    loadStaffingConfig(supabase),
    loadSeasonSettings(supabase),
    loadSubHistory(supabase, SUMMER_2025.startDate),
    loadWeekChangeLog(supabase, weekStartDate),
    supabase.from("coaches").select(COACH_SELECT).eq("is_active", true).order("full_name"),
    supabase.from("court_zones").select("name, location, blocks_main_campus_10am"),
    supabase
      .from("weekly_assignments")
      .select(ASSIGNMENT_SELECT)
      .eq("week_start_date", weekStartDate),
    supabase
      .from("coach_availability")
      .select("coach_id, week_start_date, day_of_week, status")
      .eq("week_start_date", weekStartDate),
  ]);

  const campusByZone = buildCampusByZone((zonesRes.data ?? []) as RawCourtZone[]);

  const sessions: GridSession[] = sessionsRes.rows
    .map((row) => toGridSession(row, campusByZone))
    .filter((session): session is GridSession => session !== null);

  const durations: Array<[string, number]> = sessionsRes.rows.map((row) => [
    row.id,
    row.duration_minutes ?? 0,
  ]);

  const coaches: GridCoach[] = ((coachesRes.data ?? []) as RawCoach[]).map(toGridCoach);

  const assignments: GridAssignment[] = ((assignmentsRes.data ?? []) as RawAssignment[]).map(
    toGridAssignment,
  );

  const availability: AvailabilityRecord[] = ((availabilityRes.data ?? []) as RawAvailability[])
    .map(toAvailabilityRecord)
    .filter((record): record is AvailabilityRecord => record !== null);

  return (
    <CoverageReport
      weekStartDate={weekStartDate}
      campHeadcount={scheduleWeek?.campHeadcount ?? null}
      sessions={sessions}
      durations={durations}
      coaches={coaches}
      assignments={assignments}
      availability={availability}
      rosterMembers={staffingConfig.rosterMembers}
      requirements={staffingConfig.requirements}
      settings={settings}
      subHistory={subHistory}
      changeLog={changeLog}
      loadError={sessionsRes.error ?? coachesRes.error?.message ?? null}
    />
  );
};

export default CoveragePage;
