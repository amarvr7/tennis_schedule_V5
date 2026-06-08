/**
 * Travel roster builder — coach × tournament matrix for a date window.
 */

import type { Tournament, TournamentAssignment } from "./types";
import type { TournamentCoach } from "./types";

export interface RosterEntry {
  tournamentId: string;
  tournamentName: string;
  startDate: string | null;
  endDate: string | null;
  isLocal: boolean;
  programId: string | null;
  publishedAt: string | null;
  assignments: Array<{
    assignmentId: string;
    coachId: string;
    coachName: string;
    role: string | null;
    studentName: string | null;
    status: string;
  }>;
}

export interface TravelRoster {
  fromDate: string;
  toDate: string;
  entries: RosterEntry[];
  coachCount: number;
  tournamentCount: number;
}

const overlapsRange = (
  start: string | null,
  end: string | null,
  fromDate: string,
  toDate: string,
): boolean => {
  if (!start || !end) return false;
  return start <= toDate && end >= fromDate;
};

/** Build a travel roster for tournaments overlapping [fromDate, toDate]. */
export const buildTravelRoster = (
  fromDate: string,
  toDate: string,
  tournaments: Tournament[],
  assignments: TournamentAssignment[],
  coachesById: Map<string, TournamentCoach>,
): TravelRoster => {
  const activeTournaments = tournaments.filter(
    (t) =>
      !t.isArchived &&
      !t.isCanceled &&
      overlapsRange(t.startDate, t.endDate, fromDate, toDate),
  );

  const coachIds = new Set<string>();

  const entries: RosterEntry[] = activeTournaments.map((tournament) => {
    const tournamentAssignments = assignments.filter(
      (a) => a.tournamentId === tournament.id && a.status !== "archived",
    );

    for (const assignment of tournamentAssignments) {
      coachIds.add(assignment.coachId);
    }

    return {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      startDate: tournament.startDate,
      endDate: tournament.endDate,
      isLocal: tournament.isLocal,
      programId: tournament.programId,
      publishedAt: tournament.publishedAt,
      assignments: tournamentAssignments.map((assignment) => {
        const coach = coachesById.get(assignment.coachId);
        return {
          assignmentId: assignment.id,
          coachId: assignment.coachId,
          coachName: coach?.fullName ?? "Unknown coach",
          role: assignment.role,
          studentName: assignment.studentName,
          status: assignment.status,
        };
      }),
    };
  });

  entries.sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));

  return {
    fromDate,
    toDate,
    entries,
    coachCount: coachIds.size,
    tournamentCount: entries.length,
  };
};
