/**
 * Schedule data model — pure mappers between raw Supabase rows and the
 * denormalized shapes the grid + conflict engine consume. No React, Next, or
 * Supabase imports here so it is reusable by the server page, server actions,
 * client grid, and tests alike.
 *
 * Design (CURSOR_CONTEXT.md "Core Rules"): conflict detection is config-driven
 * and UI-free. Court zones, programs and sessions are configuration data read
 * from the database; this module only reshapes them — it hardcodes no times,
 * groups, or court compositions.
 */

import type {
  AssignmentRole,
  AvailabilityRecord,
  AvailabilityStatus,
  Campus,
  ConflictCoach,
  DayOfWeek,
  SessionContext,
  SessionType,
} from "@/lib/conflicts";
import { normalizeTime } from "@/lib/coaches/rules";

// -----------------------------------------------------------------------------
// Raw row shapes (exactly what the Supabase selects return)
// -----------------------------------------------------------------------------

export interface RawProgram {
  id: string;
  name: string;
  type: string | null;
}

export interface RawSession {
  id: string;
  program_id: string | null;
  day_of_week: string | null;
  start_time: string;
  end_time: string;
  court_zone: string | null;
  court_numbers: string | null;
  surface: string | null;
  notes: string | null;
  programs: RawProgram | null;
}

export interface RawCoach {
  id: string;
  full_name: string;
  initials: string | null;
  title: string | null;
  season: string;
  season_start: string | null;
  season_end: string | null;
  earliest_start: string | null;
  latest_end: string | null;
  midday_block_start: string | null;
  midday_block_end: string | null;
  no_camp: boolean;
  no_bt: boolean;
  program_restriction: string | null;
  is_active: boolean;
}

export interface RawAssignment {
  id: string;
  session_id: string;
  coach_id: string;
  week_start_date: string;
  role: string | null;
  status: string;
  is_published: boolean;
}

export interface RawAvailability {
  coach_id: string;
  week_start_date: string;
  day_of_week: string | null;
  status: string | null;
}

export interface RawCourtZone {
  name: string;
  location: string | null;
  blocks_main_campus_10am: boolean;
}

// -----------------------------------------------------------------------------
// Grid view models (serializable, passed from the server page to the client)
// -----------------------------------------------------------------------------

export interface GridSession {
  id: string;
  programId: string | null;
  programName: string;
  type: SessionType | null;
  dayOfWeek: DayOfWeek;
  startTime: string; // "HH:MM"
  endTime: string;
  campus: Campus;
  courtZone: string | null;
  courtLabel: string; // original range string, e.g. "Hard 15-18"
  courtNumbers: string[]; // expanded individual courts for double-booking checks
}

export interface GridCoach extends ConflictCoach {
  fullName: string;
  initials: string | null;
  isActive: boolean;
}

export interface GridAssignment {
  id: string;
  sessionId: string;
  coachId: string;
  role: AssignmentRole | null;
  status: string;
  isPublished: boolean;
  weekStartDate: string;
}

// -----------------------------------------------------------------------------
// Field-level helpers
// -----------------------------------------------------------------------------

const SESSION_TYPES: ReadonlyArray<SessionType> = [
  "competitive",
  "developmental",
  "foundational",
  "camp",
  "adults",
  "legacy",
  "pro",
  "bt",
  "travel",
  "saturday",
];

const DAYS: ReadonlyArray<DayOfWeek> = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const AVAILABILITY_STATUSES: ReadonlyArray<AvailabilityStatus> = [
  "available",
  "pto",
  "traveling",
  "rest",
  "orientation",
];

const ROLES: ReadonlyArray<AssignmentRole> = ["lead", "assistant", "coverage"];

const asSessionType = (value: string | null): SessionType | null =>
  value && (SESSION_TYPES as readonly string[]).includes(value)
    ? (value as SessionType)
    : null;

const asDay = (value: string | null): DayOfWeek | null =>
  value && (DAYS as readonly string[]).includes(value) ? (value as DayOfWeek) : null;

const asAvailabilityStatus = (value: string | null): AvailabilityStatus | null =>
  value && (AVAILABILITY_STATUSES as readonly string[]).includes(value)
    ? (value as AvailabilityStatus)
    : null;

const asRole = (value: string | null): AssignmentRole | null =>
  value && (ROLES as readonly string[]).includes(value) ? (value as AssignmentRole) : null;

/**
 * Expand a court range string into individual court identifiers so the Court
 * Double Booking rule can detect overlaps (e.g. "Hard 15-18" sharing court 16
 * with "Hard 16-19"). Falls back to comma-split tokens for non-range values
 * like "ST Hard".
 */
export const parseCourts = (value: string | null): string[] => {
  if (!value) return [];

  return value
    .split(",")
    .flatMap((token) => {
      const trimmed = token.trim();
      if (!trimmed) return [];

      const range = trimmed.match(/^(.*?)\s*(\d+)\s*[-–]\s*(\d+)$/);
      if (!range) return [trimmed];

      const [, prefix, startStr, endStr] = range;
      const start = Number(startStr);
      const end = Number(endStr);
      if (Number.isNaN(start) || Number.isNaN(end) || start > end) return [trimmed];

      const label = prefix.trim();
      const courts: string[] = [];
      for (let court = start; court <= end; court += 1) {
        courts.push(label ? `${label} ${court}` : String(court));
      }
      return courts;
    });
};

/**
 * Resolve the campus of a court zone. Far campuses (West Campus, Legacy) gate
 * the Court Zone Rule. Driven by the `court_zones` config rows rather than
 * hardcoded names.
 */
export const buildCampusByZone = (zones: RawCourtZone[]): Record<string, Campus> =>
  zones.reduce<Record<string, Campus>>((map, zone) => {
    const location = (zone.location ?? "").toLowerCase();
    if (location.includes("west")) {
      map[zone.name] = "west";
    } else if (location.includes("legacy")) {
      map[zone.name] = "legacy";
    } else {
      map[zone.name] = "main";
    }
    return map;
  }, {});

// -----------------------------------------------------------------------------
// Row → view-model mappers
// -----------------------------------------------------------------------------

/** Map a raw session row to a grid session, or null if it lacks a usable day/time. */
export const toGridSession = (
  row: RawSession,
  campusByZone: Record<string, Campus>,
): GridSession | null => {
  const dayOfWeek = asDay(row.day_of_week);
  const startTime = normalizeTime(row.start_time);
  const endTime = normalizeTime(row.end_time);
  if (!dayOfWeek || !startTime || !endTime) return null;

  return {
    id: row.id,
    programId: row.program_id,
    programName: row.programs?.name ?? "Unassigned program",
    type: asSessionType(row.programs?.type ?? null),
    dayOfWeek,
    startTime,
    endTime,
    campus: (row.court_zone && campusByZone[row.court_zone]) || "main",
    courtZone: row.court_zone,
    courtLabel: row.court_numbers ?? row.court_zone ?? "—",
    courtNumbers: parseCourts(row.court_numbers),
  };
};

export const toGridCoach = (row: RawCoach): GridCoach => ({
  id: row.id,
  fullName: row.full_name,
  initials: row.initials,
  title: row.title,
  season: row.season,
  seasonStart: row.season_start,
  seasonEnd: row.season_end,
  earliestStart: normalizeTime(row.earliest_start),
  latestEnd: normalizeTime(row.latest_end),
  middayBlockStart: normalizeTime(row.midday_block_start),
  middayBlockEnd: normalizeTime(row.midday_block_end),
  noCamp: row.no_camp,
  noBt: row.no_bt,
  programRestriction: row.program_restriction,
  isActive: row.is_active,
});

export const toGridAssignment = (row: RawAssignment): GridAssignment => ({
  id: row.id,
  sessionId: row.session_id,
  coachId: row.coach_id,
  role: asRole(row.role),
  status: row.status,
  isPublished: row.is_published,
  weekStartDate: row.week_start_date,
});

export const toAvailabilityRecord = (row: RawAvailability): AvailabilityRecord | null => {
  const status = asAvailabilityStatus(row.status);
  if (!status) return null;

  return {
    coachId: row.coach_id,
    weekStartDate: row.week_start_date,
    dayOfWeek: asDay(row.day_of_week),
    status,
  };
};

/** Turn a GridSession back into the conflict engine's SessionContext. */
export const toSessionContext = (session: GridSession): SessionContext => ({
  id: session.id,
  type: session.type,
  dayOfWeek: session.dayOfWeek,
  startTime: session.startTime,
  endTime: session.endTime,
  campus: session.campus,
  courtNumbers: session.courtNumbers,
});
