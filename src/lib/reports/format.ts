/**
 * Report formatting — CSV rows and HTML snippets for dashboard / export.
 */

import type {
  CoachWorkloadRow,
  CourtUtilizationRow,
  HoursAnalysisReport,
  TournamentRosterRow,
  TravelSummaryRow,
  WeeklyCoverageRow,
  WeeklyReportSummary,
} from "./types";

const escapeCsv = (value: string | number | null | undefined): string => {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const csvRow = (cells: Array<string | number | null | undefined>): string =>
  cells.map(escapeCsv).join(",");

export const formatMinutesAsHours = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

/** Coach workload table as CSV. */
export const coachWorkloadToCsv = (rows: CoachWorkloadRow[]): string => {
  const header = csvRow([
    "Coach",
    "Title",
    "Total Hours",
    "Sessions",
    "Contracted Weekly Hours",
    "Variance (min/week)",
    "Utilization %",
  ]);
  const body = rows.map((row) =>
    csvRow([
      row.fullName,
      row.title,
      (row.totalMinutes / 60).toFixed(1),
      row.sessionCount,
      (row.contractedMinutesWeekly / 60).toFixed(0),
      row.varianceMinutesWeekly,
      row.utilizationPct,
    ]),
  );
  return [header, ...body].join("\n");
};

/** Hours analysis multi-section CSV. */
export const hoursAnalysisToCsv = (report: HoursAnalysisReport): string => {
  const sections = [
    `# Hours Analysis: ${report.period.startDate} to ${report.period.endDate}`,
    `# Total coach-hours: ${(report.totals.totalMinutes / 60).toFixed(1)}`,
    `# Coaches: ${report.totals.coachCount}`,
    "",
    coachWorkloadToCsv(report.coaches),
    "",
    "Program Type,Total Hours,Sessions",
    ...report.programHours.map((row) =>
      csvRow([row.programType, (row.totalMinutes / 60).toFixed(1), row.sessionCount]),
    ),
  ];
  return sections.join("\n");
};

/** Weekly coverage trend CSV. */
export const coverageToCsv = (rows: WeeklyCoverageRow[]): string => {
  const header = csvRow(["Week", "Staffed", "Total", "Coverage %", "Gaps"]);
  const body = rows.map((row) =>
    csvRow([
      row.weekLabel,
      row.staffedSessions,
      row.totalSessions,
      row.coveragePct,
      row.gapCount,
    ]),
  );
  return [header, ...body].join("\n");
};

/** Tournament roster summary CSV. */
export const tournamentRostersToCsv = (rows: TournamentRosterRow[]): string => {
  const header = csvRow([
    "Tournament",
    "Location",
    "Start",
    "End",
    "Local",
    "Coaches",
    "Students",
    "Coach Names",
  ]);
  const body = rows.map((row) =>
    csvRow([
      row.tournamentName,
      row.location,
      row.startDate,
      row.endDate,
      row.isLocal ? "Yes" : "No",
      row.coachCount,
      row.studentCount,
      row.coaches.join("; "),
    ]),
  );
  return [header, ...body].join("\n");
};

/** Court utilization CSV. */
export const courtUtilizationToCsv = (rows: CourtUtilizationRow[]): string => {
  const header = csvRow(["Zone", "Courts", "Sessions", "Total Hours", "Utilization %"]);
  const body = rows.map((row) =>
    csvRow([
      row.courtZone,
      row.courtLabel,
      row.sessionCount,
      (row.totalMinutes / 60).toFixed(1),
      row.utilizationPct,
    ]),
  );
  return [header, ...body].join("\n");
};

/** Travel summary CSV. */
export const travelSummaryToCsv = (rows: TravelSummaryRow[]): string => {
  const header = csvRow([
    "Coach",
    "Travel Weeks",
    "Tournaments",
    "Consecutive Travel Weeks",
  ]);
  const body = rows.map((row) =>
    csvRow([
      row.fullName,
      row.travelWeekCount,
      row.tournamentCount,
      row.consecutiveTravelWeeks,
    ]),
  );
  return [header, ...body].join("\n");
};

/** Full weekly report as multi-section CSV (Excel-compatible). */
export const weeklyReportToCsv = (report: WeeklyReportSummary): string => {
  const sections = [
    `# Weekly Report: ${report.weekLabel}`,
    "",
    "Coverage",
    csvRow(["Week", "Staffed", "Total", "Coverage %", "Gaps"]),
    csvRow([
      report.weekLabel,
      report.coverage.staffedSessions,
      report.coverage.totalSessions,
      report.coverage.coveragePct,
      report.coverage.gapCount,
    ]),
    "",
    "Coach Hours",
    coachWorkloadToCsv(report.coachHours),
    "",
    "Court Utilization",
    courtUtilizationToCsv(report.courtUtilization),
    "",
    "Travel Summary",
    travelSummaryToCsv(report.travelSummary),
    "",
    "Tournament Rosters",
    tournamentRostersToCsv(report.tournamentRosters),
  ];
  return sections.join("\n");
};

/** HTML summary for Teams / email (Adaptive Card body). */
export const weeklyReportToHtml = (report: WeeklyReportSummary): string => {
  const topCoaches = report.coachHours.slice(0, 5);
  const coachLines = topCoaches
    .map(
      (c) =>
        `<li>${c.fullName}: ${formatMinutesAsHours(c.totalMinutes)} (${c.sessionCount} sessions)</li>`,
    )
    .join("");

  const rosterLines = report.tournamentRosters
    .slice(0, 5)
    .map(
      (t) =>
        `<li>${t.tournamentName} — ${t.coachCount} coaches, ${t.studentCount} students</li>`,
    )
    .join("");

  return `
<h2>Weekly Schedule Report — ${report.weekLabel}</h2>
<p><strong>Coverage:</strong> ${report.coverage.staffedSessions}/${report.coverage.totalSessions} sessions staffed (${report.coverage.coveragePct}%)</p>
${report.coverage.gapCount > 0 ? `<p style="color:#c00"><strong>${report.coverage.gapCount} gaps</strong> need attention.</p>` : ""}
<h3>Top Coach Hours</h3>
<ul>${coachLines || "<li>No published assignments</li>"}</ul>
<h3>Tournament Travel</h3>
<ul>${rosterLines || "<li>No tournaments this period</li>"}</ul>
<p><em>Generated by IMG Academy Tennis — Data &amp; Reports Pilot</em></p>
`.trim();
};
