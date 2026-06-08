/**
 * Weekly staffing coverage — staffed vs. total sessions per week.
 */

import { formatWeekRange } from "@/lib/schedule/grid";
import type { WeeklyCoverageRow } from "./types";

export type RawCoverageSession = {
  sessionId: string;
  weekStartDate: string;
  hasActiveAssignment: boolean;
  isPublished: boolean;
};

const inWeek = (weekStartDate: string, targetWeek: string): boolean =>
  weekStartDate === targetWeek;

/** Coverage for one week. */
export const buildWeeklyCoverage = (
  sessions: RawCoverageSession[],
  weekStartDate: string,
  publishedOnly = true,
): WeeklyCoverageRow => {
  const weekSessions = sessions.filter((s) => inWeek(s.weekStartDate, weekStartDate));
  const countable = publishedOnly
    ? weekSessions.filter((s) => s.isPublished || s.hasActiveAssignment)
    : weekSessions;

  const totalSessions = countable.length;
  const staffedSessions = countable.filter((s) => s.hasActiveAssignment).length;
  const gapCount = totalSessions - staffedSessions;
  const coveragePct =
    totalSessions > 0 ? Math.round((staffedSessions / totalSessions) * 100) : 0;

  return {
    weekStartDate,
    weekLabel: formatWeekRange(weekStartDate),
    totalSessions,
    staffedSessions,
    coveragePct,
    gapCount,
  };
};

/** Coverage trend across multiple weeks. */
export const buildCoverageTrend = (
  sessions: RawCoverageSession[],
  weekStarts: string[],
  publishedOnly = true,
): WeeklyCoverageRow[] =>
  weekStarts.map((week) => buildWeeklyCoverage(sessions, week, publishedOnly));
