/**
 * Server-side view model for the tournament planner UI.
 */

import type { AvailabilityRecord } from "@/lib/conflicts";
import { scanOutliers, type TournamentOutlier } from "@/lib/tournaments/outliers";
import { buildTravelRoster, type TravelRoster } from "@/lib/tournaments/roster";
import type { TournamentProgram } from "@/lib/tournaments/load";
import type {
  Tournament,
  TournamentAssignment,
  TournamentCoach,
} from "@/lib/tournaments/types";

export type TournamentPlannerView = {
  tournaments: Tournament[];
  assignments: TournamentAssignment[];
  coaches: TournamentCoach[];
  programs: TournamentProgram[];
  availability: AvailabilityRecord[];
  outliers: TournamentOutlier[];
  roster: TravelRoster;
  phaseASchema: boolean;
  programsById: Record<string, TournamentProgram>;
};

const addDays = (dateStr: string, days: number): string => {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const buildTournamentPlannerView = (input: {
  tournaments: Tournament[];
  assignments: TournamentAssignment[];
  coaches: TournamentCoach[];
  programs: TournamentProgram[];
  availability: AvailabilityRecord[];
  phaseASchema: boolean;
  rosterDays?: number;
}): TournamentPlannerView => {
  const tournamentsById = new Map(input.tournaments.map((t) => [t.id, t]));
  const coachesById = new Map(input.coaches.map((c) => [c.id, c]));
  const programTypesById = new Map(input.programs.map((p) => [p.id, p.type]));

  const today = new Date().toISOString().slice(0, 10);
  const rosterEnd = addDays(today, input.rosterDays ?? 56);

  const outliers = scanOutliers(
    input.tournaments,
    input.coaches,
    input.assignments,
    tournamentsById,
    input.availability,
    programTypesById,
  );

  const roster = buildTravelRoster(
    today,
    rosterEnd,
    input.tournaments,
    input.assignments,
    coachesById,
  );

  const programsById = Object.fromEntries(input.programs.map((p) => [p.id, p]));

  return {
    tournaments: input.tournaments,
    assignments: input.assignments,
    coaches: input.coaches,
    programs: input.programs,
    availability: input.availability,
    outliers,
    roster,
    phaseASchema: input.phaseASchema,
    programsById,
  };
};
