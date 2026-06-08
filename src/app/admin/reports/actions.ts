"use server";

import { revalidatePath } from "next/cache";

import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import { normalizeWeekStart } from "@/lib/schedule/grid";
import { buildCoverageTrend } from "@/lib/reports/coverage";
import { buildHoursAnalysis } from "@/lib/reports/workload";
import { buildWeeklyReport } from "@/lib/reports/weekly";
import {
  loadCoaches,
  loadSessionCoverage,
  loadTournamentData,
  loadWorkloadRows,
} from "@/lib/reports/load";
import { postWeeklySummaryToTeams } from "@/lib/reports/teams";
import { SUMMER_2025, type ReportPeriod } from "@/lib/reports/types";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; error: string | null };

export type ReportsDashboardData = {
  period: ReportPeriod;
  weekStartDate: string;
  weeklyReport: ReturnType<typeof buildWeeklyReport>;
  hoursAnalysis: ReturnType<typeof buildHoursAnalysis>;
  coverageTrend: ReturnType<typeof buildCoverageTrend>;
};

const fail = (error: string): ActionResult => ({ ok: false, error });

export const loadReportsData = async (
  weekStartDate?: string,
  period?: ReportPeriod,
): Promise<ReportsDashboardData> => {
  await requireAdminCoach();

  const supabase = createClient();
  const reportPeriod = period ?? SUMMER_2025;
  const week = normalizeWeekStart(weekStartDate);

  const [workloadRows, sessionData, coaches, tournamentData] = await Promise.all([
    loadWorkloadRows(supabase, reportPeriod),
    loadSessionCoverage(supabase, reportPeriod),
    loadCoaches(supabase),
    loadTournamentData(supabase),
  ]);

  const weeklyReport = buildWeeklyReport({
    period: reportPeriod,
    weekStartDate: week,
    publishedOnly: true,
    workloadRows,
    coverageSessions: sessionData.coverage,
    courtSessions: sessionData.courts,
    tournaments: tournamentData.tournaments,
    tournamentAssignments: tournamentData.assignments,
    coaches,
  });

  const hoursAnalysis = buildHoursAnalysis(workloadRows, reportPeriod, true);

  const weekStarts = [
    ...new Set(workloadRows.map((r) => r.weekStartDate)),
  ].sort();
  const coverageTrend = buildCoverageTrend(
    sessionData.coverage,
    weekStarts.length > 0 ? weekStarts : [week],
    true,
  );

  return {
    period: reportPeriod,
    weekStartDate: week,
    weeklyReport,
    hoursAnalysis,
    coverageTrend,
  };
};

/** Post the current week's summary to Microsoft Teams. */
export const postTeamsSummary = async (
  weekStartDate?: string,
): Promise<ActionResult & { skipped?: boolean }> => {
  await requireAdminCoach();

  const data = await loadReportsData(weekStartDate);
  const result = await postWeeklySummaryToTeams(data.weeklyReport);

  if (!result.ok) return fail(result.error ?? "Teams post failed.");

  revalidatePath("/admin/reports");
  return { ok: true, error: null, skipped: result.skipped };
};
