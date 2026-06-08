/**
 * Tournament assignment conflict engine — pure functions.
 * Complements the weekly engine in `@/lib/conflicts` with travel-specific rules.
 */

import type { AvailabilityRecord } from "@/lib/conflicts";
import { DEFAULT_CONFIG } from "@/lib/conflicts";
import type {
  Tournament,
  TournamentAssignment,
  TournamentAssignmentRole,
  TournamentCoach,
  TournamentConflict,
} from "./types";

export interface TournamentConflictInput {
  coach: TournamentCoach;
  tournament: Tournament;
  role: TournamentAssignmentRole;
  /** Other active (draft or published) assignments for this tournament. */
  tournamentAssignments: TournamentAssignment[];
  /** All published assignments for this coach (for max-travel + double booking). */
  coachPublishedAssignments: TournamentAssignment[];
  tournamentsById: Map<string, Tournament>;
  availability: AvailabilityRecord[];
  consecutiveTravelWeeksBefore: number;
}

/** No travel outside Bradenton — WB and similar coaches. */
export const checkTournamentTravelRestricted = (
  input: TournamentConflictInput,
): TournamentConflict | null => {
  const { coach, tournament } = input;
  if (!coach.travelRestricted || tournament.isLocal) return null;

  return {
    type: "travel_restricted",
    severity: "hard",
    coachId: coach.id,
    tournamentId: tournament.id,
    message: `${coach.fullName} cannot travel outside Bradenton.`,
  };
};

/** No driving — PK, PVL, AD, KC. */
export const checkTournamentNoDrive = (
  input: TournamentConflictInput,
): TournamentConflict | null => {
  const { coach, tournament, role } = input;
  if (!coach.noDrive || role !== "driver") return null;

  return {
    type: "no_drive",
    severity: "hard",
    coachId: coach.id,
    tournamentId: tournament.id,
    message: `${coach.fullName} cannot be assigned as driver.`,
  };
};

/** PTO blocks tournament travel for overlapping weeks. */
export const checkTournamentPto = (
  input: TournamentConflictInput,
): TournamentConflict | null => {
  const { coach, tournament, availability } = input;
  if (!tournament.startDate) return null;

  const onPto = availabilityForCoach(coach.id, availability).some(
    (record) => record.status === "pto",
  );
  if (!onPto) return null;

  return {
    type: "pto",
    severity: "hard",
    coachId: coach.id,
    tournamentId: tournament.id,
    message: `${coach.fullName} is on PTO during this tournament window.`,
  };
};

/** Already traveling — blocks stacking away assignments without review. */
export const checkTournamentTravelBlock = (
  input: TournamentConflictInput,
): TournamentConflict | null => {
  const { coach, tournament, availability } = input;
  const traveling = availabilityForCoach(coach.id, availability).some(
    (record) => record.status === "traveling",
  );
  if (!traveling) return null;

  return {
    type: "travel_block",
    severity: "hard",
    coachId: coach.id,
    tournamentId: tournament.id,
    message: `${coach.fullName} is already marked traveling for this period.`,
  };
};

/** Rest day blocks tournament assignment. */
export const checkTournamentRestDay = (
  input: TournamentConflictInput,
): TournamentConflict | null => {
  const { coach, tournament, availability } = input;
  const resting = availabilityForCoach(coach.id, availability).some(
    (record) => record.status === "rest",
  );
  if (!resting) return null;

  return {
    type: "rest_day",
    severity: "system",
    coachId: coach.id,
    tournamentId: tournament.id,
    message: `${coach.fullName} is in a rest period during this tournament.`,
  };
};

/** Max travel — 3 consecutive travel weeks → block the 4th. */
export const checkTournamentMaxTravel = (
  input: TournamentConflictInput,
): TournamentConflict | null => {
  const { coach, tournament, consecutiveTravelWeeksBefore: consecutive } = input;
  const max = DEFAULT_CONFIG.maxConsecutiveTravelWeeks;
  if (consecutive < max) return null;

  return {
    type: "max_travel",
    severity: "hard",
    coachId: coach.id,
    tournamentId: tournament.id,
    message: `${coach.fullName} has ${consecutive} consecutive travel weeks (max ${max}); a home week is required.`,
  };
};

/** Coach already assigned to another overlapping published tournament. */
export const checkTournamentDoubleBooking = (
  input: TournamentConflictInput,
): TournamentConflict | null => {
  const { coach, tournament, coachPublishedAssignments, tournamentsById } = input;
  if (!tournament.startDate || !tournament.endDate) return null;

  const overlap = coachPublishedAssignments.find((assignment) => {
    if (assignment.tournamentId === tournament.id) return false;
    if (assignment.status !== "published") return false;
    const other = tournamentsById.get(assignment.tournamentId);
    if (!other?.startDate || !other.endDate) return false;
    return (
      tournament.startDate! <= other.endDate && other.startDate <= tournament.endDate!
    );
  });

  if (!overlap) return null;

  const otherTournament = tournamentsById.get(overlap.tournamentId);
  return {
    type: "double_tournament",
    severity: "hard",
    coachId: coach.id,
    tournamentId: tournament.id,
    message: `${coach.fullName} is already assigned to ${otherTournament?.name ?? "another tournament"} with overlapping dates.`,
  };
};

/**
 * Soft warning when coach's home program does not match the tournament program.
 * Level-based assignment prefers same-program coaches.
 */
export const checkTournamentProgramMismatch = (
  input: TournamentConflictInput,
): TournamentConflict | null => {
  const { coach, tournament } = input;
  if (!tournament.programId || !coach.primaryProgramId) return null;
  if (coach.primaryProgramId === tournament.programId) return null;

  return {
    type: "program_mismatch",
    severity: "soft",
    coachId: coach.id,
    tournamentId: tournament.id,
    message: `${coach.fullName} is not on the tournament's home program — review level fit.`,
  };
};

export const TOURNAMENT_CONFLICT_RULES: ReadonlyArray<
  (input: TournamentConflictInput) => TournamentConflict | null
> = [
  checkTournamentTravelRestricted,
  checkTournamentNoDrive,
  checkTournamentPto,
  checkTournamentTravelBlock,
  checkTournamentRestDay,
  checkTournamentMaxTravel,
  checkTournamentDoubleBooking,
  checkTournamentProgramMismatch,
];

export const checkAllTournamentConflicts = (
  input: TournamentConflictInput,
): TournamentConflict[] =>
  TOURNAMENT_CONFLICT_RULES.reduce<TournamentConflict[]>((acc, rule) => {
    const conflict = rule(input);
    if (conflict) acc.push(conflict);
    return acc;
  }, []);

export const isTournamentBlocking = (conflict: TournamentConflict): boolean =>
  conflict.severity === "hard" || conflict.severity === "system";

const availabilityForCoach = (
  coachId: string,
  availability: AvailabilityRecord[],
): AvailabilityRecord[] => availability.filter((record) => record.coachId === coachId);
