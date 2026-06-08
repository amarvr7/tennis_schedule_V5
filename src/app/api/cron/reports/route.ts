import { type NextRequest, NextResponse } from "next/server";

import { currentWeekStart } from "@/lib/schedule/grid";
import { buildWeeklyReport } from "@/lib/reports/weekly";
import {
  loadCoaches,
  loadSessionCoverage,
  loadTournamentData,
  loadWorkloadRows,
} from "@/lib/reports/load";
import { postWeeklySummaryToTeams } from "@/lib/reports/teams";
import { SUMMER_2025 } from "@/lib/reports/types";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Cron trigger for automated weekly Teams summary.
 * Vercel Cron: configure in vercel.json with CRON_SECRET header check.
 *
 * Triggers:
 * - weekly (default): post-approval summary for current week
 * - monthly: end-of-month hours snapshot (returns JSON, no Teams post)
 */
export const GET = async (request: NextRequest) => {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const trigger = request.nextUrl.searchParams.get("trigger") ?? "weekly";
  const supabase = createServiceClient();
  const week = currentWeekStart();

  const [workloadRows, sessionData, coaches, tournamentData] = await Promise.all([
    loadWorkloadRows(supabase, SUMMER_2025),
    loadSessionCoverage(supabase, SUMMER_2025),
    loadCoaches(supabase),
    loadTournamentData(supabase),
  ]);

  if (trigger === "monthly") {
    const totalMinutes = workloadRows
      .filter((r) => r.status === "active" && r.isPublished)
      .reduce((sum, r) => sum + r.durationMinutes, 0);

    return NextResponse.json({
      ok: true,
      trigger: "monthly",
      period: SUMMER_2025,
      totalCoachMinutes: totalMinutes,
      coachCount: new Set(workloadRows.map((r) => r.coachId)).size,
    });
  }

  const report = buildWeeklyReport({
    period: SUMMER_2025,
    weekStartDate: week,
    publishedOnly: true,
    workloadRows,
    coverageSessions: sessionData.coverage,
    courtSessions: sessionData.courts,
    tournaments: tournamentData.tournaments,
    tournamentAssignments: tournamentData.assignments,
    coaches,
  });

  const teamsResult = await postWeeklySummaryToTeams(report);

  return NextResponse.json({
    ok: teamsResult.ok,
    trigger: "weekly",
    week,
    coverage: report.coverage,
    teamsSkipped: teamsResult.skipped,
    teamsError: teamsResult.error,
  });
};
