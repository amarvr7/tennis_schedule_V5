/**
 * Grid layout helpers — pure functions that turn the flat session list into the
 * day-columns × time-slot-rows structure the builder renders, plus the week
 * navigation date math. No React / Supabase here.
 */

import type { DayOfWeek } from "@/lib/conflicts";
import { formatTime } from "@/lib/coaches/rules";
import type { GridSession } from "./model";

/** Columns of the grid: Monday–Saturday (Sunday is not scheduled). */
export const WEEKDAYS: ReadonlyArray<{ key: DayOfWeek; label: string; short: string }> = [
  { key: "monday", label: "Monday", short: "Mon" },
  { key: "tuesday", label: "Tuesday", short: "Tue" },
  { key: "wednesday", label: "Wednesday", short: "Wed" },
  { key: "thursday", label: "Thursday", short: "Thu" },
  { key: "friday", label: "Friday", short: "Fri" },
  { key: "saturday", label: "Saturday", short: "Sat" },
];

export interface TimeSlot {
  key: string; // "HH:MM-HH:MM"
  startTime: string;
  endTime: string;
  label: string; // "8:00 AM – 10:00 AM"
}

const slotKey = (startTime: string, endTime: string): string => `${startTime}-${endTime}`;

/** Distinct (start, end) windows present in the sessions, sorted chronologically. */
export const buildTimeSlots = (sessions: GridSession[]): TimeSlot[] => {
  const byKey = new Map<string, TimeSlot>();

  for (const session of sessions) {
    const key = slotKey(session.startTime, session.endTime);
    if (byKey.has(key)) continue;
    byKey.set(key, {
      key,
      startTime: session.startTime,
      endTime: session.endTime,
      label: `${formatTime(session.startTime)} – ${formatTime(session.endTime)}`,
    });
  }

  return [...byKey.values()].sort(
    (a, b) =>
      a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime),
  );
};

/** Sessions for one grid cell (a given day + time slot), program-name ordered. */
export const sessionsForCell = (
  sessions: GridSession[],
  day: DayOfWeek,
  slot: TimeSlot,
): GridSession[] =>
  sessions
    .filter(
      (session) =>
        session.dayOfWeek === day &&
        session.startTime === slot.startTime &&
        session.endTime === slot.endTime,
    )
    .sort((a, b) => a.programName.localeCompare(b.programName));

// -----------------------------------------------------------------------------
// Week date math (all in UTC to avoid timezone drift on date-only values)
// -----------------------------------------------------------------------------

/** ISO "YYYY-MM-DD" for the Monday of the week containing `date`. */
export const mondayOf = (date: Date): string => {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayIndex = (utc.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  utc.setUTCDate(utc.getUTCDate() - dayIndex);
  return utc.toISOString().slice(0, 10);
};

/** Monday of the current week. */
export const currentWeekStart = (): string => mondayOf(new Date());

/** Validate / normalize a "YYYY-MM-DD" string to a Monday, or fall back to now. */
export const normalizeWeekStart = (value: string | null | undefined): string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return currentWeekStart();
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return currentWeekStart();
  return mondayOf(parsed);
};

/** Shift a week-start Monday by a number of weeks (+/-), returning a new Monday. */
export const shiftWeek = (weekStartDate: string, deltaWeeks: number): string => {
  const date = new Date(`${weekStartDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaWeeks * 7);
  return mondayOf(date);
};

/** The calendar date of a given weekday within a week, as "YYYY-MM-DD". */
export const dateForDay = (weekStartDate: string, day: DayOfWeek): string => {
  const index = WEEKDAYS.findIndex((weekday) => weekday.key === day);
  const date = new Date(`${weekStartDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + (index < 0 ? 0 : index));
  return date.toISOString().slice(0, 10);
};

/** Human label for a week range, e.g. "Jun 2 – Jun 7, 2025". */
export const formatWeekRange = (weekStartDate: string): string => {
  const start = new Date(`${weekStartDate}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 5); // Monday → Saturday

  const startLabel = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const endLabel = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${startLabel} – ${endLabel}`;
};

export { formatTime };
