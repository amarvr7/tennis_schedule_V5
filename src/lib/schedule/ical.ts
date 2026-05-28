/**
 * iCalendar (RFC 5545) builder — pure, framework-free. Turns a coach's week of
 * `MySession`s into a downloadable `.ics` string. No React / Next / Supabase.
 *
 * Times are emitted as floating local times (no TZID / no "Z" suffix) so each
 * event lands at the wall-clock time the academy runs it, regardless of the
 * device's timezone — the correct semantics for an on-site weekly schedule.
 */

import type { DayOfWeek } from "@/lib/conflicts";
import { dateForDay } from "./grid";
import type { MySession } from "./myWeek";

const PRODID = "-//Tennis Academy//Scheduling App//EN";

/** Escape a TEXT value per RFC 5545 §3.3.11 (backslash, semicolon, comma, newline). */
const escapeText = (value: string): string =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

/** "YYYY-MM-DD" + "HH:MM" → "YYYYMMDDTHHMMSS" (floating local time). */
const toIcsDateTime = (date: string, time: string): string => {
  const compactDate = date.replace(/-/g, "");
  const [hours, minutes] = time.split(":");
  return `${compactDate}T${hours.padStart(2, "0")}${(minutes ?? "00").padStart(2, "0")}00`;
};

/** Fold a content line to the 75-octet limit (RFC 5545 §3.1) using CRLF + space. */
const foldLine = (line: string): string => {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let remaining = line;
  chunks.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    chunks.push(` ${remaining.slice(0, 74)}`);
    remaining = remaining.slice(74);
  }
  return chunks.join("\r\n");
};

/** A UTC timestamp like "20250601T120000Z" for DTSTAMP. */
const utcStamp = (now: Date): string =>
  `${now.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;

const eventLines = (
  session: MySession,
  weekStartDate: string,
  stamp: string,
): string[] => {
  const date = dateForDay(weekStartDate, session.dayOfWeek as DayOfWeek);
  const start = toIcsDateTime(date, session.startTime);
  const end = toIcsDateTime(date, session.endTime);
  const roleSuffix = session.role ? ` (${session.role})` : "";
  const description = [
    session.group ? `Group: ${session.group}` : null,
    session.role ? `Role: ${session.role}` : null,
    session.surface ? `Surface: ${session.surface}` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return [
    "BEGIN:VEVENT",
    `UID:${session.assignmentId}@tennis-academy`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeText(`${session.sessionName}${roleSuffix}`)}`,
    `LOCATION:${escapeText(session.courts)}`,
    ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
    "END:VEVENT",
  ];
};

/**
 * Build a full VCALENDAR document for the coach's week. `sessions` is the flat
 * list (any order); pass `now` for deterministic output in tests.
 */
export const buildWeekIcs = (
  sessions: MySession[],
  weekStartDate: string,
  calendarName: string,
  now: Date = new Date(),
): string => {
  const stamp = utcStamp(now);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    ...sessions.flatMap((session) => eventLines(session, weekStartDate, stamp)),
    "END:VCALENDAR",
  ];

  return `${lines.map(foldLine).join("\r\n")}\r\n`;
};

/** A filesystem-safe attachment name, e.g. "my-schedule-2025-06-02.ics". */
export const icsFileName = (weekStartDate: string): string =>
  `my-schedule-${weekStartDate}.ics`;
