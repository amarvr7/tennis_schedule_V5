/**
 * Composes the full weekly management report from raw data slices.
 */

import { formatWeekRange } from "@/lib/schedule/grid";
import { buildCourtUtilization } from "./courts";
import { buildWeeklyCoverage } from "./coverage";
import { buildTravelSummary } from "./travel";
import { buildProgramHours, buildWeeklyCoachHours } from "./workload";
import type {
  ReportPeriod,
  WeeklyReportSummary,
} from "./types";
import type { RawCourtSession } from "./courts";
import type { RawCoverageSession } from "./coverage";
import type { RawTournamentReportCoach } from "./travel";
import type { RawWorkloadAssignment } from "./workload";
import type { Tournament, TournamentAssignment } from "@/lib/tournaments/types";
import { buildTournamentRosters } from "./travel";

export type WeeklyReportInput = {
  period: ReportPeriod;
  weekStartDate: string;
  publishedOnly?: boolean;
  workloadRows: RawWorkloadAssignment[];
  coverageSessions: RawCoverageSession[];
  courtSessions: RawCourtSession[];
  tournaments: Tournament[];
  tournamentAssignments: TournamentAssignment[];
  coaches: RawTournamentReportCoach[];
};

/** Assemble all report sections for one week. */
export const buildWeeklyReport = (input: WeeklyReportInput): WeeklyReportSummary => {
  const publishedOnly = input.publishedOnly ?? true;
  const coachesById = new Map(input.coaches.map((c) => [c.id, c]));
  const coachIds = input.coaches.map((c) => c.id);

  return {
    period: input.period,
    weekStartDate: input.weekStartDate,
    weekLabel: formatWeekRange(input.weekStartDate),
    coverage: buildWeeklyCoverage(input.coverageSessions, input.weekStartDate, publishedOnly),
    coachHours: buildWeeklyCoachHours(input.workloadRows, input.weekStartDate, publishedOnly),
    programHours: buildProgramHours(input.workloadRows, {
      startDate: input.weekStartDate,
      endDate: input.weekStartDate,
    }, publishedOnly),
    courtUtilization: buildCourtUtilization(input.courtSessions, input.weekStartDate),
    travelSummary: buildTravelSummary(
      coachIds,
      coachesById,
      input.tournaments,
      input.tournamentAssignments,
      input.weekStartDate,
      input.period,
    ),
    tournamentRosters: buildTournamentRosters(
      input.tournaments,
      input.tournamentAssignments,
      coachesById,
      input.period,
    ),
  };
};
