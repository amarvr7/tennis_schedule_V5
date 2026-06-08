/**
 * Tournament coach assignment — candidate evaluation and ranking.
 */

import type { AvailabilityRecord } from "@/lib/conflicts";
import {
  checkAllTournamentConflicts,
  isTournamentBlocking,
  type TournamentConflictInput,
} from "./conflicts";
import { getCoachTier, getProgramTierFromType } from "./tiers";
import type {
  Tournament,
  TournamentAssignment,
  TournamentAssignmentRole,
  TournamentCoach,
  TournamentConflict,
} from "./types";
import {
  consecutiveTravelWeeksBefore,
  buildTravelWeekStarts,
  mondayOfWeek,
} from "./travelWeeks";
import { scoreRotationFairness } from "./rotate";

export interface TournamentCandidateResult {
  coach: TournamentCoach;
  conflicts: TournamentConflict[];
  blocking: TournamentConflict[];
  warnings: TournamentConflict[];
  rotationScore: number;
  tierDelta: number;
  totalScore: number;
}

export interface EvaluateTournamentCandidatesInput {
  tournament: Tournament;
  coaches: TournamentCoach[];
  role: TournamentAssignmentRole;
  tournamentAssignments: TournamentAssignment[];
  allAssignments: TournamentAssignment[];
  tournamentsById: Map<string, Tournament>;
  availability: AvailabilityRecord[];
  /** Recent assignments for rotation fairness (typically last 12 months). */
  rotationHistory: TournamentAssignment[];
  /** programId → type, loaded from programs table in Phase B. */
  programTypesById?: Map<string, string | null>;
}

const partitionTournamentConflicts = (
  conflicts: TournamentConflict[],
): { blocking: TournamentConflict[]; warnings: TournamentConflict[] } => ({
  blocking: conflicts.filter(isTournamentBlocking),
  warnings: conflicts.filter((c) => !isTournamentBlocking(c)),
});

/**
 * Evaluate every active coach for a tournament role. Returns ranked candidates
 * (highest score first) with conflicts surfaced for the assignment panel.
 */
export const evaluateTournamentCandidates = (
  input: EvaluateTournamentCandidatesInput,
): TournamentCandidateResult[] => {
  const {
    tournament,
    coaches,
    role,
    tournamentAssignments,
    allAssignments,
    tournamentsById,
    availability,
    rotationHistory,
  } = input;

  const weekStart = tournament.startDate
    ? mondayOfWeek(tournament.startDate)
    : "1970-01-01";

  const results: TournamentCandidateResult[] = [];

  for (const coach of coaches) {
    if (!coach.isActive) continue;

    const travelWeeks = buildTravelWeekStarts(coach.id, {
      tournamentAssignments: allAssignments,
      tournamentsById,
      availability,
    });

    const conflictInput: TournamentConflictInput = {
      coach,
      tournament,
      role,
      tournamentAssignments,
      coachPublishedAssignments: allAssignments.filter(
        (a) => a.coachId === coach.id && a.status === "published",
      ),
      tournamentsById,
      availability: availability.filter((a) => a.coachId === coach.id),
      consecutiveTravelWeeksBefore: consecutiveTravelWeeksBefore(weekStart, travelWeeks),
    };

    const conflicts = checkAllTournamentConflicts(conflictInput);
    const { blocking, warnings } = partitionTournamentConflicts(conflicts);

    const rotationScore = scoreRotationFairness(coach, tournament, rotationHistory);
    const programType = tournament.programId
      ? input.programTypesById?.get(tournament.programId) ?? null
      : null;
    const tierDelta = getCoachTier(coach.title) - getProgramTierFromType(programType);
    const totalScore = rotationScore - tierDelta * 10 - blocking.length * 1000;

    results.push({
      coach,
      conflicts,
      blocking,
      warnings,
      rotationScore,
      tierDelta,
      totalScore,
    });
  }

  return results.sort((a, b) => b.totalScore - a.totalScore);
};

/** Best non-blocked candidate for auto-suggest, or null when none qualify. */
export const suggestTournamentCoach = (
  input: EvaluateTournamentCandidatesInput,
): TournamentCandidateResult | null => {
  const ranked = evaluateTournamentCandidates(input);
  return ranked.find((candidate) => candidate.blocking.length === 0) ?? null;
};

