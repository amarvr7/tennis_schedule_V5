/**
 * Outlier detection — cases where standard rules don't fit cleanly and need
 * manual admin sign-off before publishing a travel roster.
 */

import type { Tournament, TournamentAssignment, TournamentCoach } from "./types";
import type { TournamentCandidateResult } from "./assign";
import { evaluateTournamentCandidates } from "./assign";
import type { EvaluateTournamentCandidatesInput } from "./assign";

export type OutlierReason =
  | "no_program"
  | "no_eligible_coach"
  | "all_coaches_blocked"
  | "travel_restricted_away"
  | "max_travel_exhausted"
  | "unassigned_lead";

export interface TournamentOutlier {
  tournamentId: string;
  tournamentName: string;
  reason: OutlierReason;
  message: string;
  coachIds: string[];
}

export const detectTournamentOutliers = (
  tournament: Tournament,
  candidates: TournamentCandidateResult[],
  assignments: TournamentAssignment[],
): TournamentOutlier[] => {
  const outliers: TournamentOutlier[] = [];

  if (!tournament.programId) {
    outliers.push({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      reason: "no_program",
      message: "Tournament has no linked program — level-based assignment cannot run.",
      coachIds: [],
    });
  }

  const activeAssignments = assignments.filter((a) => a.status !== "archived");
  const eligible = candidates.filter((c) => c.blocking.length === 0);

  if (eligible.length === 0 && activeAssignments.length === 0) {
    outliers.push({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      reason: "no_eligible_coach",
      message: "No coach passes all hard rules for this tournament.",
      coachIds: candidates.map((c) => c.coach.id),
    });
  }

  const maxTravelBlocked = candidates.filter((c) =>
    c.blocking.some((conflict) => conflict.type === "max_travel"),
  );
  if (maxTravelBlocked.length === candidates.length && candidates.length > 0) {
    outliers.push({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      reason: "max_travel_exhausted",
      message: "Every coach is blocked by the max-travel rule — manual override required.",
      coachIds: maxTravelBlocked.map((c) => c.coach.id),
    });
  }

  if (!tournament.isLocal) {
    const restrictedAssigned = activeAssignments.filter((assignment) => {
      const candidate = candidates.find((c) => c.coach.id === assignment.coachId);
      return candidate?.blocking.some((c) => c.type === "travel_restricted");
    });
    if (restrictedAssigned.length > 0) {
      outliers.push({
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        reason: "travel_restricted_away",
        message: "A Bradenton-only coach is assigned to an away tournament.",
        coachIds: restrictedAssigned.map((a) => a.coachId),
      });
    }
  }

  const hasLead = activeAssignments.some((a) => a.role === "lead");
  if (!hasLead && activeAssignments.length > 0) {
    outliers.push({
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      reason: "unassigned_lead",
      message: "Tournament roster has no lead coach assigned.",
      coachIds: activeAssignments.map((a) => a.coachId),
    });
  }

  return outliers;
};

/** Scan a date range and return outliers for every non-archived tournament. */
export const scanOutliers = (
  tournaments: Tournament[],
  coaches: TournamentCoach[],
  allAssignments: TournamentAssignment[],
  tournamentsById: Map<string, Tournament>,
  availability: EvaluateTournamentCandidatesInput["availability"],
  programTypesById?: Map<string, string | null>,
): TournamentOutlier[] => {
  const outliers: TournamentOutlier[] = [];

  for (const tournament of tournaments) {
    if (tournament.isArchived || tournament.isCanceled) continue;

    const tournamentAssignments = allAssignments.filter(
      (a) => a.tournamentId === tournament.id && a.status !== "archived",
    );

    const candidates = evaluateTournamentCandidates({
      tournament,
      coaches,
      role: "lead",
      tournamentAssignments,
      allAssignments,
      tournamentsById,
      availability,
      rotationHistory: allAssignments,
      programTypesById,
    });

    outliers.push(
      ...detectTournamentOutliers(tournament, candidates, tournamentAssignments),
    );
  }

  return outliers;
};
