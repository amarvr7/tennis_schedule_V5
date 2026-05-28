/**
 * My Schedule (coach read-only view) — pure, framework-free shaping of a single
 * coach's published assignments for one week. No React / Next / Supabase here so
 * it is reusable by the server page, the iCal route handler, and tests.
 *
 * A coach's week is a flat list of `MySession`s (one per active+published
 * assignment), grouped by weekday for display. The "session name" is the
 * program name; the "group" is the program type (e.g. Competitive), which the
 * roster organizes coaches by.
 */

import type { AvailabilityRecord, DayOfWeek, SessionType } from "@/lib/conflicts";
import { formatTime, normalizeTime } from "@/lib/coaches/rules";
import { WEEKDAYS } from "./grid";

/** Raw weekly_assignments row joined with its session + program. */
export interface RawMyAssignment {
  id: string;
  role: string | null;
  status: string;
  is_published: boolean;
  week_start_date: string;
  sessions: {
    id: string;
    day_of_week: string | null;
    start_time: string;
    end_time: string;
    court_zone: string | null;
    court_numbers: string | null;
    surface: string | null;
    programs: { id: string; name: string; type: string | null } | null;
  } | null;
}

/** One session in the coach's week — the unit the view + iCal render. */
export interface MySession {
  assignmentId: string;
  sessionId: string;
  sessionName: string; // program name, e.g. "Competitive Boys 1 (Academy)"
  group: string | null; // program type, e.g. "competitive"
  dayOfWeek: DayOfWeek;
  startTime: string; // "HH:MM"
  endTime: string;
  timeLabel: string; // "8:00 AM – 10:00 AM"
  courts: string; // court label, e.g. "Hard 8-11"
  surface: string | null;
  role: string | null; // lead | assistant | coverage
}

/** A weekday plus the coach's sessions that day, time-ordered. */
export interface MyDay {
  key: DayOfWeek;
  label: string;
  short: string;
  sessions: MySession[];
}

const DAY_KEYS = new Set<string>(WEEKDAYS.map((day) => day.key));

const asDay = (value: string | null): DayOfWeek | null =>
  value && DAY_KEYS.has(value) ? (value as DayOfWeek) : null;

/** Title-case a program type for display, e.g. "competitive" → "Competitive". */
export const formatGroup = (group: string | null): string => {
  if (!group) return "—";
  return group.charAt(0).toUpperCase() + group.slice(1);
};

/** Map one joined assignment row to a `MySession`, or null when unrenderable. */
export const toMySession = (row: RawMyAssignment): MySession | null => {
  const session = row.sessions;
  if (!session) return null;

  const dayOfWeek = asDay(session.day_of_week);
  const startTime = normalizeTime(session.start_time);
  const endTime = normalizeTime(session.end_time);
  if (!dayOfWeek || !startTime || !endTime) return null;

  return {
    assignmentId: row.id,
    sessionId: session.id,
    sessionName: session.programs?.name ?? "Unassigned program",
    group: (session.programs?.type as SessionType | null) ?? null,
    dayOfWeek,
    startTime,
    endTime,
    timeLabel: `${formatTime(startTime)} – ${formatTime(endTime)}`,
    courts: session.court_numbers ?? session.court_zone ?? "—",
    surface: session.surface,
    role: row.role,
  };
};

/** Shape rows into the full Mon–Sat structure (empty days included). */
export const buildMyWeek = (rows: RawMyAssignment[]): MyDay[] => {
  const sessions = rows
    .map(toMySession)
    .filter((session): session is MySession => session !== null);

  return WEEKDAYS.map((day) => ({
    key: day.key,
    label: day.label,
    short: day.short,
    sessions: sessions
      .filter((session) => session.dayOfWeek === day.key)
      .sort(
        (a, b) =>
          a.startTime.localeCompare(b.startTime) ||
          a.sessionName.localeCompare(b.sessionName),
      ),
  }));
};

/** Total scheduled sessions in the week (across all days). */
export const countSessions = (week: MyDay[]): number =>
  week.reduce((total, day) => total + day.sessions.length, 0);

/**
 * Does the coach hold a `traveling` block for this week? Drives the "I'm Back"
 * button. A whole-week (dayOfWeek === null) or any single-day traveling row
 * counts as currently traveling.
 */
export const isTravelingThisWeek = (
  availability: AvailabilityRecord[],
  coachId: string,
  weekStartDate: string,
): boolean =>
  availability.some(
    (record) =>
      record.coachId === coachId &&
      record.weekStartDate === weekStartDate &&
      record.status === "traveling",
  );
