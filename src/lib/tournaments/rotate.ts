/**
 * Travel rotation fairness — scores coaches so local tournaments rotate evenly.
 *
 * Rotation pools come from coach notes in CURSOR_CONTEXT (JR/IJ on Comp Boys 2,
 * NM frequent travel, CL Tuesday exception). Phase B will move these to DB config;
 * for now we encode the documented exceptions as pure scoring adjustments.
 */

import type { Tournament, TournamentAssignment, TournamentCoach } from "./types";
import { mondayOfWeek } from "./travelWeeks";

/** Coach initials with documented rotation exceptions. */
const FREQUENT_TRAVEL_INITIALS = new Set(["NM", "AV", "JGZ", "XP"]);
const ROTATION_POOL_INITIALS = new Set(["JR", "IJ"]);
const TUESDAY_TRAVEL_EXCEPTION_INITIALS = new Set(["CL"]);

const localAssignmentsInLastYear = (
  coachId: string,
  history: TournamentAssignment[],
  tournamentsById?: Map<string, Tournament>,
): number => {
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);

  return history.filter((assignment) => {
    if (assignment.coachId !== coachId) return false;
    if (assignment.status === "archived") return false;
    const created = new Date(assignment.createdAt);
    if (created < cutoff) return false;
    if (!tournamentsById) return true;
    const tournament = tournamentsById.get(assignment.tournamentId);
    return tournament?.isLocal ?? false;
  }).length;
};

/**
 * Higher score = more deserving of the next local tournament assignment.
 * Coaches with fewer recent local assignments score higher.
 */
export const scoreRotationFairness = (
  coach: TournamentCoach,
  tournament: Tournament,
  history: TournamentAssignment[],
  tournamentsById?: Map<string, Tournament>,
): number => {
  const initials = coach.initials?.toUpperCase() ?? "";
  let score = 100;

  const recentCount = localAssignmentsInLastYear(
    coach.id,
    history,
    tournamentsById,
  );
  score -= recentCount * 25;

  if (tournament.isLocal && ROTATION_POOL_INITIALS.has(initials)) {
    score += 15;
  }

  if (FREQUENT_TRAVEL_INITIALS.has(initials)) {
    score -= 10;
  }

  if (
    TUESDAY_TRAVEL_EXCEPTION_INITIALS.has(initials) &&
    tournament.startDate &&
    mondayOfWeek(tournament.startDate) === tournament.startDate
  ) {
    score += 5;
  }

  if (tournament.programId && coach.primaryProgramId === tournament.programId) {
    score += 20;
  }

  return score;
};

/** Summarize rotation fairness across a program pool for admin reports. */
export const buildRotationReport = (
  coaches: TournamentCoach[],
  history: TournamentAssignment[],
  tournamentsById: Map<string, Tournament>,
): Array<{ coachId: string; fullName: string; localAssignmentsLastYear: number; score: number }> =>
  coaches
    .map((coach) => {
      const localAssignmentsLastYear = localAssignmentsInLastYear(
        coach.id,
        history,
        tournamentsById,
      );
      const sampleTournament: Tournament = {
        id: "report",
        name: "Rotation report",
        location: null,
        isLocal: true,
        startDate: null,
        endDate: null,
        daysCount: null,
        tournamentType: "local",
        programId: coach.primaryProgramId,
        isCanceled: false,
        isArchived: false,
        publishedAt: null,
        notes: null,
      };
      return {
        coachId: coach.id,
        fullName: coach.fullName,
        localAssignmentsLastYear,
        score: scoreRotationFairness(coach, sampleTournament, history, tournamentsById),
      };
    })
    .sort((a, b) => b.score - a.score);
