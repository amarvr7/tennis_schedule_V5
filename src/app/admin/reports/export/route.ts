import { type NextRequest, NextResponse } from "next/server";

import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import { normalizeWeekStart } from "@/lib/schedule/grid";
import {
  coachWorkloadToCsv,
  coverageToCsv,
  hoursAnalysisToCsv,
  tournamentRostersToCsv,
  weeklyReportToCsv,
} from "@/lib/reports/format";
import { buildCoverageTrend } from "@/lib/reports/coverage";
import { buildHoursAnalysis } from "@/lib/reports/workload";
import { buildWeeklyReport } from "@/lib/reports/weekly";
import { buildTournamentRosters } from "@/lib/reports/travel";
import {
  loadCoaches,
  loadSessionCoverage,
  loadTournamentData,
  loadWorkloadRows,
} from "@/lib/reports/load";
import { SUMMER_2025 } from "@/lib/reports/types";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /admin/reports/export?type=weekly|hours|coverage|tournaments&week=YYYY-MM-DD
 * Streams CSV reports (Excel-compatible) for admin download.
 */
export const GET = async (request: NextRequest) => {
  await requireAdminCoach();

  const type = request.nextUrl.searchParams.get("type") ?? "weekly";
  const week = normalizeWeekStart(request.nextUrl.searchParams.get("week"));
  const start = request.nextUrl.searchParams.get("start") ?? SUMMER_2025.startDate;
  const end = request.nextUrl.searchParams.get("end") ?? SUMMER_2025.endDate;
  const period = { startDate: start, endDate: end };

  const supabase = createClient();

  let csv = "";
  let filename = "report.csv";

  if (type === "weekly") {
    const [workloadRows, sessionData, coaches, tournamentData] = await Promise.all([
      loadWorkloadRows(supabase, period),
      loadSessionCoverage(supabase, period),
      loadCoaches(supabase),
      loadTournamentData(supabase),
    ]);

    const report = buildWeeklyReport({
      period,
      weekStartDate: week,
      workloadRows,
      coverageSessions: sessionData.coverage,
      courtSessions: sessionData.courts,
      tournaments: tournamentData.tournaments,
      tournamentAssignments: tournamentData.assignments,
      coaches,
    });

    csv = weeklyReportToCsv(report);
    filename = `weekly-report-${week}.csv`;
  } else if (type === "hours") {
    const workloadRows = await loadWorkloadRows(supabase, period);
    const analysis = buildHoursAnalysis(workloadRows, period, true);
    csv = hoursAnalysisToCsv(analysis);
    filename = `coach-hours-${start}-to-${end}.csv`;
  } else if (type === "coverage") {
    const sessionData = await loadSessionCoverage(supabase, period);
    const weekStarts = [...new Set(sessionData.coverage.map((s) => s.weekStartDate))].sort();
    const trend = buildCoverageTrend(sessionData.coverage, weekStarts, true);
    csv = coverageToCsv(trend);
    filename = `coverage-trend-${start}-to-${end}.csv`;
  } else if (type === "tournaments") {
    const [coaches, tournamentData] = await Promise.all([
      loadCoaches(supabase),
      loadTournamentData(supabase),
    ]);
    const coachesById = new Map(coaches.map((c) => [c.id, c]));
    const rosters = buildTournamentRosters(
      tournamentData.tournaments,
      tournamentData.assignments,
      coachesById,
      period,
    );
    csv = tournamentRostersToCsv(rosters);
    filename = `tournament-rosters-${start}-to-${end}.csv`;
  } else if (type === "coaches") {
    const workloadRows = await loadWorkloadRows(supabase, period);
    const coaches = buildHoursAnalysis(workloadRows, period, true).coaches;
    csv = coachWorkloadToCsv(coaches);
    filename = `coach-workload-${start}-to-${end}.csv`;
  } else {
    return new NextResponse("Unknown export type", { status: 400 });
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
};
