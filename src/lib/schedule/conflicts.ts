/**
 * Schedule-level conflict orchestration. Thin, pure wrappers around the engine
 * in `@/lib/conflicts` that adapt the grid view-models into the engine's
 * `ConflictCheckInput` and aggregate results for (a) the grid badges and (b)
 * the assignment panel's per-coach availability. No React / Supabase here, so
 * the exact same logic runs on the server (page load) and in the browser
 * (immediately after an assignment), per the requirement that assigning a coach
 * runs `checkAllConflicts` from `/lib/conflicts.ts`.
 */

import {
  type AssignmentContext,
  type AvailabilityRecord,
  type Conflict,
  type ConflictCheckInput,
  type ConflictConfig,
  checkAllConflicts,
} from "@/lib/conflicts";
import type { GridAssignment, GridCoach, GridSession } from "./model";
import { toSessionContext } from "./model";

/** A conflict is blocking when it is a hard or system (auto-block) rule. */
export const isBlocking = (conflict: Conflict): boolean =>
  conflict.severity === "hard" || conflict.severity === "system";

export interface PartitionedConflicts {
  blocking: Conflict[];
  warnings: Conflict[];
}

export const partitionConflicts = (conflicts: Conflict[]): PartitionedConflicts => ({
  blocking: conflicts.filter(isBlocking),
  warnings: conflicts.filter((conflict) => !isBlocking(conflict)),
});

const SYNTHETIC_ID_PREFIX = "candidate";

/** Build the engine's AssignmentContext for a stored assignment + its session. */
const toAssignmentContext = (
  assignment: GridAssignment,
  session: GridSession,
): AssignmentContext => ({
  id: assignment.id,
  coachId: assignment.coachId,
  sessionId: assignment.sessionId,
  weekStartDate: assignment.weekStartDate,
  role: assignment.role,
  status: assignment.status,
  session: toSessionContext(session),
});

/** All active assignments in the week, resolved against their sessions. */
export const buildActiveContexts = (
  assignments: GridAssignment[],
  sessionsById: Map<string, GridSession>,
): AssignmentContext[] =>
  assignments
    .filter((assignment) => assignment.status === "active")
    .map((assignment) => {
      const session = sessionsById.get(assignment.sessionId);
      return session ? toAssignmentContext(assignment, session) : null;
    })
    .filter((context): context is AssignmentContext => context !== null);

export interface ConflictEngineData {
  sessionsById: Map<string, GridSession>;
  coachesById: Map<string, GridCoach>;
  availability: AvailabilityRecord[];
}

/**
 * Run every conflict rule for every active assignment in the week and group the
 * results by session id. Drives the red conflict badges on the grid.
 */
export const computeSessionConflicts = (
  assignments: GridAssignment[],
  { sessionsById, coachesById, availability }: ConflictEngineData,
): Map<string, Conflict[]> => {
  const activeContexts = buildActiveContexts(assignments, sessionsById);
  const bySession = new Map<string, Conflict[]>();

  for (const context of activeContexts) {
    const coach = coachesById.get(context.coachId);
    if (!coach) continue;

    const conflicts = checkAllConflicts({
      assignment: context,
      coach,
      weekAssignments: activeContexts,
      availability,
    });
    if (conflicts.length === 0) continue;

    const existing = bySession.get(context.sessionId) ?? [];
    existing.push(...conflicts);
    bySession.set(context.sessionId, existing);
  }

  return bySession;
};

/**
 * Evaluate a hypothetical assignment of one coach to one session. Used by the
 * panel to decide whether a coach is selectable (no blocking conflicts) and to
 * surface the reasons when they are not.
 */
export const evaluateCandidate = (
  coach: GridCoach,
  session: GridSession,
  weekStartDate: string,
  activeContexts: AssignmentContext[],
  availability: AvailabilityRecord[],
  role: AssignmentContext["role"] = "lead",
  config?: Partial<ConflictConfig>,
  consecutiveTravelWeeks?: number,
): Conflict[] => {
  const candidate: AssignmentContext = {
    id: `${SYNTHETIC_ID_PREFIX}:${coach.id}:${session.id}`,
    coachId: coach.id,
    sessionId: session.id,
    weekStartDate,
    role,
    status: "active",
    session: toSessionContext(session),
  };

  const input: ConflictCheckInput = {
    assignment: candidate,
    coach,
    // Include the candidate so double / court double booking can see it against
    // the rest of the week.
    weekAssignments: [...activeContexts, candidate],
    availability,
    consecutiveTravelWeeks,
    config,
  };

  return checkAllConflicts(input);
};

export const computeSessionConflictsWithTravel = (
  assignments: GridAssignment[],
  data: ConflictEngineData,
  consecutiveTravelWeeksByCoach: Map<string, number>,
): Map<string, Conflict[]> => {
  const activeContexts = buildActiveContexts(assignments, data.sessionsById);
  const bySession = new Map<string, Conflict[]>();

  for (const context of activeContexts) {
    const coach = data.coachesById.get(context.coachId);
    if (!coach) continue;

    const conflicts = checkAllConflicts({
      assignment: context,
      coach,
      weekAssignments: activeContexts,
      availability: data.availability,
      consecutiveTravelWeeks: consecutiveTravelWeeksByCoach.get(context.coachId),
    });
    if (conflicts.length === 0) continue;

    const existing = bySession.get(context.sessionId) ?? [];
    existing.push(...conflicts);
    bySession.set(context.sessionId, existing);
  }

  return bySession;
};
