/**
 * Data & Reports Pilot — shared report shapes.
 * Pure types only; no React, Next, or Supabase imports.
 */

export type ReportPeriod = {
  startDate: string; // YYYY-MM-DD
  endDate: string;
};

/** Default summer 2025 season window from CURSOR_CONTEXT.md. */
export const SUMMER_2025: ReportPeriod = {
  startDate: "2025-06-01",
  endDate: "2025-08-21",
};

export type ReportFilters = {
  period: ReportPeriod;
  publishedOnly: boolean;
  weekStartDate?: string;
};

export type CoachWorkloadRow = {
  coachId: string;
  fullName: string;
  title: string | null;
  totalMinutes: number;
  sessionCount: number;
  contractedMinutesWeekly: number;
  varianceMinutesWeekly: number;
  utilizationPct: number;
};

export type WeeklyCoverageRow = {
  weekStartDate: string;
  weekLabel: string;
  totalSessions: number;
  staffedSessions: number;
  coveragePct: number;
  gapCount: number;
};

export type ProgramHoursRow = {
  programType: string;
  totalMinutes: number;
  sessionCount: number;
};

export type TournamentRosterRow = {
  tournamentId: string;
  tournamentName: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isLocal: boolean;
  coachCount: number;
  studentCount: number;
  coaches: string[];
};

export type TravelSummaryRow = {
  coachId: string;
  fullName: string;
  travelWeekCount: number;
  tournamentCount: number;
  consecutiveTravelWeeks: number;
};

export type CourtUtilizationRow = {
  courtZone: string;
  courtLabel: string;
  sessionCount: number;
  totalMinutes: number;
  utilizationPct: number;
};

export type WeeklyReportSummary = {
  period: ReportPeriod;
  weekStartDate: string;
  weekLabel: string;
  coverage: WeeklyCoverageRow;
  coachHours: CoachWorkloadRow[];
  programHours: ProgramHoursRow[];
  courtUtilization: CourtUtilizationRow[];
  travelSummary: TravelSummaryRow[];
  tournamentRosters: TournamentRosterRow[];
};

export type HoursAnalysisReport = {
  period: ReportPeriod;
  coaches: CoachWorkloadRow[];
  programHours: ProgramHoursRow[];
  totals: {
    totalMinutes: number;
    avgMinutesPerCoach: number;
    coachCount: number;
    overContractedCount: number;
    underContractedCount: number;
  };
};
