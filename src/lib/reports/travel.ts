/**
 * Tournament travel roster summaries for management reports.
 */

import {
  buildAllTravelWeekStartsByCoach,
  consecutiveTravelWeeksByCoach,
} from "@/lib/tournaments/travelWeeks";
import type { Tournament, TournamentAssignment } from "@/lib/tournaments/types";
import type { ReportPeriod, TournamentRosterRow, TravelSummaryRow } from "./types";

export type RawTournamentReportCoach = {
  id: string;
  fullName: string;
};

const inPeriod = (dateStr: string | null, period: ReportPeriod): boolean => {
  if (!dateStr) return false;
  return dateStr >= period.startDate && dateStr <= period.endDate;
};

/** Published tournament rosters overlapping the report period. */
export const buildTournamentRosters = (
  tournaments: Tournament[],
  assignments: TournamentAssignment[],
  coachesById: Map<string, RawTournamentReportCoach>,
  period: ReportPeriod,
): TournamentRosterRow[] => {
  const publishedAssignments = assignments.filter((a) => a.status === "published");

  return tournaments
    .filter(
      (t) =>
        !t.isCanceled &&
        !t.isArchived &&
        t.publishedAt &&
        (inPeriod(t.startDate, period) || inPeriod(t.endDate, period)),
    )
    .map((tournament) => {
      const roster = publishedAssignments.filter((a) => a.tournamentId === tournament.id);
      const coachIds = [...new Set(roster.map((a) => a.coachId))];
      const coaches = coachIds
        .map((id) => coachesById.get(id)?.fullName ?? "Unknown")
        .sort();
      const students = roster
        .map((a) => a.studentName)
        .filter((name): name is string => Boolean(name));

      return {
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        location: tournament.location,
        startDate: tournament.startDate,
        endDate: tournament.endDate,
        isLocal: tournament.isLocal,
        coachCount: coachIds.length,
        studentCount: students.length,
        coaches,
      };
    })
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
};

/** Per-coach travel week and tournament counts. */
export const buildTravelSummary = (
  coachIds: string[],
  coachesById: Map<string, RawTournamentReportCoach>,
  tournaments: Tournament[],
  assignments: TournamentAssignment[],
  weekStartDate: string,
  period: ReportPeriod,
): TravelSummaryRow[] => {
  const tournamentsById = new Map(tournaments.map((t) => [t.id, t]));
  const published = assignments.filter((a) => a.status === "published");

  const travelWeeksByCoach = buildAllTravelWeekStartsByCoach(coachIds, {
    tournamentAssignments: published,
    tournamentsById,
  });

  const consecutiveByCoach = consecutiveTravelWeeksByCoach(
    coachIds,
    weekStartDate,
    travelWeeksByCoach,
  );

  return coachIds
    .map((coachId) => {
      const coach = coachesById.get(coachId);
      const travelWeeks = travelWeeksByCoach.get(coachId) ?? new Set();
      const periodWeeks = [...travelWeeks].filter(
        (w) => w >= period.startDate && w <= period.endDate,
      );

      const tournamentCount = published.filter((a) => {
        if (a.coachId !== coachId) return false;
        const t = tournamentsById.get(a.tournamentId);
        return t && (inPeriod(t.startDate, period) || inPeriod(t.endDate, period));
      }).length;

      return {
        coachId,
        fullName: coach?.fullName ?? "Unknown",
        travelWeekCount: periodWeeks.length,
        tournamentCount,
        consecutiveTravelWeeks: consecutiveByCoach.get(coachId) ?? 0,
      };
    })
    .filter((row) => row.travelWeekCount > 0 || row.tournamentCount > 0)
    .sort((a, b) => b.travelWeekCount - a.travelWeekCount);
};
