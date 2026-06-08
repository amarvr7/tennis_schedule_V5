/**
 * Schedule Architect — the generative core of the system.
 *
 * Pure, framework-free constraint-satisfaction engine. Given the week's
 * sessions, the active coach roster, availability (PTO / travel / rest), and
 * the program → head-coach / coach → primary-program links, it produces a
 * complete weekly DRAFT: one lead coach per open session, plus a report of any
 * sessions it could not staff and why.
 *
 * Design (CURSOR_CONTEXT.md "Core Rules"):
 *   - No React / Next / Supabase imports here. The exact same logic runs in a
 *     server action and in tests.
 *   - It does not re-implement the rules: every placement is validated through
 *     the shared engine in `@/lib/conflicts` (via `evaluateCandidate`), so the
 *     generated draft is free of HARD/SYSTEM (blocking) conflicts by
 *     construction — only soft warnings can survive, surfaced for review.
 *
 * Algorithm — backtracking CSP with branch-and-bound, tuned to MAXIMIZE the
 * number of fully-staffed sessions:
 *   1. Open sessions = sessions with no existing ACTIVE assignment.
 *   2. Precompute, per open session, the statically-eligible coaches (those
 *      with no blocking conflict against the pre-existing assignments), tagged
 *      with a preference reason (head coach → primary-program coach → any
 *      available coach) and any soft warnings. This is the expensive rule pass
 *      and it runs once.
 *   3. Search the open sessions choosing the most-constrained one first (MRV).
 *      The only assignment-to-assignment constraint among the coaches we place
 *      is double booking — a coach cannot hold two time-overlapping sessions —
 *      which is enforced with a fast interval check during the search. Preferred
 *      candidates are tried first, so the first optimal solution favours head
 *      coaches. Branch-and-bound prunes branches that cannot beat the best
 *      staffing found, and a node budget keeps generation bounded.
 */

import type {
  AssignmentContext,
  AvailabilityRecord,
  Conflict,
  ConflictConfig,
  DayOfWeek,
} from "@/lib/conflicts";
import type { GridCoach, GridSession } from "./model";
import { evaluateCandidate, partitionConflicts } from "./conflicts";

/** Why a coach was chosen for a session, in descending priority order. */
export type PlacementReason = "head_coach" | "primary_program" | "available";

export interface PlannedAssignment {
  sessionId: string;
  coachId: string;
  role: "lead";
  reason: PlacementReason;
  /** Soft (non-blocking) conflicts the admin should be aware of. */
  warnings: Conflict[];
}

export interface ScheduleGap {
  sessionId: string;
  programName: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  courtLabel: string;
  reason: string;
}

export interface GenerationInput {
  weekStartDate: string;
  /** Every configured session for the week (the recurring template). */
  sessions: GridSession[];
  /** Active coach roster the solver may draw from. */
  coaches: GridCoach[];
  availability: AvailabilityRecord[];
  /**
   * Already-active assignments for the week (e.g. placed by hand). Their
   * sessions are treated as already staffed and left untouched; their coaches'
   * existing time commitments are respected so the solver never double-books.
   */
  existingAssignments?: AssignmentContext[];
  /** programId → coachId of the program's designated head coach. */
  headCoachByProgram?: Map<string, string>;
  /** coachId → programId of the coach's home program. */
  primaryProgramByCoach?: Map<string, string>;
  /** coachId → consecutive travel weeks before this week (Max Travel rule). */
  consecutiveTravelWeeksByCoach?: Map<string, number>;
  config?: Partial<ConflictConfig>;
  /** Backtracking node budget; caps worst-case search time. */
  maxNodes?: number;
}

export interface GenerationResult {
  planned: PlannedAssignment[];
  gaps: ScheduleGap[];
  /** Open sessions the solver tried to staff (excludes already-active ones). */
  openSessionCount: number;
  staffedCount: number;
  warningCount: number;
  nodesExplored: number;
  /** True if the node budget was hit and the result is a best-effort draft. */
  hitNodeLimit: boolean;
}

const DEFAULT_MAX_NODES = 50_000;

const REASON_RANK: Record<PlacementReason, number> = {
  head_coach: 0,
  primary_program: 1,
  available: 2,
};

/** A pre-vetted coach for one session, with its preference + soft warnings. */
interface Candidate {
  coachId: string;
  reason: PlacementReason;
  rank: number;
  warnings: Conflict[];
  coachName: string;
}

/** A time interval a coach already occupies on a given day. */
interface Interval {
  day: DayOfWeek;
  start: number; // minutes since midnight
  end: number;
}

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return Number.NaN;
  return hours * 60 + minutes;
};

/** Strict half-open overlap on the same day: [aStart, aEnd) ∩ [bStart, bEnd). */
const overlaps = (a: Interval, b: Interval): boolean =>
  a.day === b.day && a.start < b.end && b.start < a.end;

const intervalForSession = (session: GridSession): Interval => ({
  day: session.dayOfWeek,
  start: toMinutes(session.startTime),
  end: toMinutes(session.endTime),
});

/** Resolve the preference reason for assigning `coach` to `session`. */
const placementReason = (
  coach: GridCoach,
  session: GridSession,
  headCoachByProgram: Map<string, string>,
  primaryProgramByCoach: Map<string, string>,
): PlacementReason => {
  if (session.programId && headCoachByProgram.get(session.programId) === coach.id) {
    return "head_coach";
  }
  if (session.programId && primaryProgramByCoach.get(coach.id) === session.programId) {
    return "primary_program";
  }
  return "available";
};

/**
 * Build the statically-eligible candidate list for one session: every active
 * coach with no blocking conflict against the pre-existing assignments, sorted
 * by preference (head coach first) then name for deterministic output.
 */
const buildCandidates = (
  session: GridSession,
  coaches: GridCoach[],
  weekStartDate: string,
  existing: AssignmentContext[],
  availability: AvailabilityRecord[],
  headCoachByProgram: Map<string, string>,
  primaryProgramByCoach: Map<string, string>,
  consecutiveTravelWeeksByCoach: Map<string, number>,
  config?: Partial<ConflictConfig>,
): Candidate[] =>
  coaches
    .filter((coach) => coach.isActive)
    .map((coach) => {
      const conflicts = evaluateCandidate(
        coach,
        session,
        weekStartDate,
        existing,
        availability,
        "lead",
        config,
        consecutiveTravelWeeksByCoach.get(coach.id),
      );
      const { blocking, warnings } = partitionConflicts(conflicts);
      if (blocking.length > 0) return null;

      const reason = placementReason(
        coach,
        session,
        headCoachByProgram,
        primaryProgramByCoach,
      );
      return {
        coachId: coach.id,
        reason,
        rank: REASON_RANK[reason],
        warnings,
        coachName: coach.fullName,
      } satisfies Candidate;
    })
    .filter((candidate): candidate is Candidate => candidate !== null)
    .sort((a, b) => a.rank - b.rank || a.coachName.localeCompare(b.coachName));

/**
 * Generate a complete weekly draft. Pure: returns the planned assignments and
 * the staffing gaps without touching any store.
 */
export const generateSchedule = (input: GenerationInput): GenerationResult => {
  const {
    weekStartDate,
    sessions,
    coaches,
    availability,
    existingAssignments = [],
    headCoachByProgram = new Map(),
    primaryProgramByCoach = new Map(),
    consecutiveTravelWeeksByCoach = new Map(),
    config,
    maxNodes = DEFAULT_MAX_NODES,
  } = input;

  // Sessions already covered by an active assignment are left as-is.
  const staffedSessionIds = new Set(
    existingAssignments
      .filter((assignment) => assignment.status === "active")
      .map((assignment) => assignment.sessionId),
  );

  const openSessions = sessions.filter(
    (session) => !staffedSessionIds.has(session.id),
  );

  // Pre-vet candidates once (the only full rule pass).
  const candidatesBySession = new Map<string, Candidate[]>();
  const sessionById = new Map<string, GridSession>();
  for (const session of openSessions) {
    sessionById.set(session.id, session);
    candidatesBySession.set(
      session.id,
      buildCandidates(
        session,
        coaches,
        weekStartDate,
        existingAssignments,
        availability,
        headCoachByProgram,
        primaryProgramByCoach,
        consecutiveTravelWeeksByCoach,
        config,
      ),
    );
  }

  // Seed each coach's occupied intervals from the existing active assignments.
  const occupied = new Map<string, Interval[]>();
  for (const assignment of existingAssignments) {
    if (assignment.status !== "active") continue;
    const list = occupied.get(assignment.coachId) ?? [];
    list.push({
      day: assignment.session.dayOfWeek,
      start: toMinutes(assignment.session.startTime),
      end: toMinutes(assignment.session.endTime),
    });
    occupied.set(assignment.coachId, list);
  }

  /** Candidates still placeable given who is already booked when (double booking). */
  const feasibleCandidates = (sessionId: string): Candidate[] => {
    const session = sessionById.get(sessionId);
    if (!session) return [];
    const slot = intervalForSession(session);
    return (candidatesBySession.get(sessionId) ?? []).filter((candidate) => {
      const intervals = occupied.get(candidate.coachId);
      if (!intervals) return true;
      return !intervals.some((interval) => overlaps(interval, slot));
    });
  };

  let nodesExplored = 0;
  let hitNodeLimit = false;

  const placement = new Map<string, Candidate>();
  let best: Map<string, Candidate> = new Map();

  const search = (remaining: string[], staffed: number): void => {
    if (hitNodeLimit) return;

    nodesExplored += 1;
    if (nodesExplored > maxNodes) {
      hitNodeLimit = true;
      if (staffed > best.size) best = new Map(placement);
      return;
    }

    // Branch-and-bound: stop if even staffing all remaining can't beat best.
    if (staffed + remaining.length <= best.size) return;

    if (remaining.length === 0) {
      if (staffed > best.size) best = new Map(placement);
      return;
    }

    // MRV — pick the most-constrained session (fewest live candidates).
    let pickIndex = 0;
    let pickFeasible = feasibleCandidates(remaining[0]);
    for (let i = 1; i < remaining.length; i += 1) {
      const feasible = feasibleCandidates(remaining[i]);
      if (feasible.length < pickFeasible.length) {
        pickIndex = i;
        pickFeasible = feasible;
        if (pickFeasible.length === 0) break;
      }
    }

    const sessionId = remaining[pickIndex];
    const rest = remaining.filter((_, index) => index !== pickIndex);

    // No coach can take it — record the gap and move on (staffing unchanged).
    if (pickFeasible.length === 0) {
      search(rest, staffed);
      return;
    }

    const session = sessionById.get(sessionId)!;
    const slot = intervalForSession(session);

    for (const candidate of pickFeasible) {
      placement.set(sessionId, candidate);
      const intervals = occupied.get(candidate.coachId) ?? [];
      intervals.push(slot);
      occupied.set(candidate.coachId, intervals);

      search(rest, staffed + 1);

      intervals.pop();
      placement.delete(sessionId);
      if (hitNodeLimit) return;
    }
  };

  search(
    openSessions.map((session) => session.id),
    0,
  );

  // Assemble the result from the best placement found.
  const planned: PlannedAssignment[] = [];
  let warningCount = 0;
  for (const [sessionId, candidate] of best) {
    planned.push({
      sessionId,
      coachId: candidate.coachId,
      role: "lead",
      reason: candidate.reason,
      warnings: candidate.warnings,
    });
    warningCount += candidate.warnings.length;
  }

  const gaps: ScheduleGap[] = openSessions
    .filter((session) => !best.has(session.id))
    .map((session) => {
      const hadCandidates = (candidatesBySession.get(session.id) ?? []).length > 0;
      const reason = hadCandidates
        ? "Every eligible coach is already booked in an overlapping session."
        : "No coach passed the hard rules (availability, time window, or program limits).";
      return {
        sessionId: session.id,
        programName: session.programName,
        dayOfWeek: session.dayOfWeek,
        startTime: session.startTime,
        endTime: session.endTime,
        courtLabel: session.courtLabel,
        reason,
      };
    });

  return {
    planned,
    gaps,
    openSessionCount: openSessions.length,
    staffedCount: planned.length,
    warningCount,
    nodesExplored,
    hitNodeLimit,
  };
};
