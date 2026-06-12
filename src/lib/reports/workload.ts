/**
 * Coach workload / hours analysis — aggregates duration_minutes snapshots.
 */

import { contractedMinutesWeekly } from "./contracted";
import type {
  CoachWorkloadRow,
  HoursAnalysisReport,
  ProgramHoursRow,
  ReportPeriod,
} from "./types";

export type RawWorkloadAssignment = {
  coachId: string;
  coachName: string;
  coachTitle: string | null;
  contractedWeeklyHours: number | null;
  durationMinutes: number;
  programType: string | null;
  weekStartDate: string;
  status: string;
  isPublished: boolean;
};

const isCountable = (
  row: RawWorkloadAssignment,
  publishedOnly: boolean,
): boolean => {
  if (row.status !== "active") return false;
  if (publishedOnly && !row.isPublished) return false;
  return row.durationMinutes > 0;
};

const inPeriod = (weekStartDate: string, period: ReportPeriod): boolean =>
  weekStartDate >= period.startDate && weekStartDate <= period.endDate;

/** Sum coach hours for a date range from assignment snapshots. */
export const buildCoachWorkload = (
  rows: RawWorkloadAssignment[],
  period: ReportPeriod,
  publishedOnly = true,
): CoachWorkloadRow[] => {
  const byCoach = new Map<
    string,
    {
      fullName: string;
      title: string | null;
      contractedWeeklyHours: number | null;
      minutes: number;
      count: number;
    }
  >();

  for (const row of rows) {
    if (!inPeriod(row.weekStartDate, period)) continue;
    if (!isCountable(row, publishedOnly)) continue;

    const existing = byCoach.get(row.coachId) ?? {
      fullName: row.coachName,
      title: row.coachTitle,
      contractedWeeklyHours: row.contractedWeeklyHours,
      minutes: 0,
      count: 0,
    };
    existing.minutes += row.durationMinutes;
    existing.count += 1;
    byCoach.set(row.coachId, existing);
  }

  const weeksInPeriod = countWeeksInPeriod(period);

  return [...byCoach.entries()]
    .map(([coachId, data]) => {
      const contracted = contractedMinutesWeekly(data.title, data.contractedWeeklyHours);
      const avgWeeklyMinutes = weeksInPeriod > 0 ? data.minutes / weeksInPeriod : 0;
      const variance = avgWeeklyMinutes - contracted;
      const utilizationPct =
        contracted > 0 ? Math.round((avgWeeklyMinutes / contracted) * 100) : 0;

      return {
        coachId,
        fullName: data.fullName,
        title: data.title,
        totalMinutes: data.minutes,
        sessionCount: data.count,
        contractedMinutesWeekly: contracted,
        varianceMinutesWeekly: Math.round(variance),
        utilizationPct,
      };
    })
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
};

/** Hours grouped by program type. */
export const buildProgramHours = (
  rows: RawWorkloadAssignment[],
  period: ReportPeriod,
  publishedOnly = true,
): ProgramHoursRow[] => {
  const byType = new Map<string, { minutes: number; count: number }>();

  for (const row of rows) {
    if (!inPeriod(row.weekStartDate, period)) continue;
    if (!isCountable(row, publishedOnly)) continue;

    const type = row.programType ?? "unknown";
    const existing = byType.get(type) ?? { minutes: 0, count: 0 };
    existing.minutes += row.durationMinutes;
    existing.count += 1;
    byType.set(type, existing);
  }

  return [...byType.entries()]
    .map(([programType, data]) => ({
      programType,
      totalMinutes: data.minutes,
      sessionCount: data.count,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
};

/** Full hours analysis with summary totals. */
export const buildHoursAnalysis = (
  rows: RawWorkloadAssignment[],
  period: ReportPeriod,
  publishedOnly = true,
): HoursAnalysisReport => {
  const coaches = buildCoachWorkload(rows, period, publishedOnly);
  const programHours = buildProgramHours(rows, period, publishedOnly);

  const totalMinutes = coaches.reduce((sum, c) => sum + c.totalMinutes, 0);
  const overContractedCount = coaches.filter((c) => c.varianceMinutesWeekly > 60).length;
  const underContractedCount = coaches.filter((c) => c.varianceMinutesWeekly < -60).length;

  return {
    period,
    coaches,
    programHours,
    totals: {
      totalMinutes,
      avgMinutesPerCoach: coaches.length > 0 ? Math.round(totalMinutes / coaches.length) : 0,
      coachCount: coaches.length,
      overContractedCount,
      underContractedCount,
    },
  };
};

/** Coach hours for a single week (used in weekly report). */
export const buildWeeklyCoachHours = (
  rows: RawWorkloadAssignment[],
  weekStartDate: string,
  publishedOnly = true,
): CoachWorkloadRow[] =>
  buildCoachWorkload(rows, { startDate: weekStartDate, endDate: weekStartDate }, publishedOnly);

const countWeeksInPeriod = (period: ReportPeriod): number => {
  const start = new Date(`${period.startDate}T00:00:00Z`);
  const end = new Date(`${period.endDate}T00:00:00Z`);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diffMs / (7 * 86_400_000)) + 1);
};
