/**
 * Weekly draft generation — roster-first placement (CURSOR_ANSWERS.md Q1/Q5).
 *
 * The season roster IS the schedule: each group's coach team is fixed at
 * season setup, so generating a week means re-placing the SAME rostered
 * people into the group's sessions — never reshuffling coaches across groups
 * and never optimizing. A slot a roster coach cannot fill (PTO, travel, rule
 * conflict, double-booked with their other group) is reported as a gap for
 * the admin; nothing is ever auto-assigned from the general pool (Q4 —
 * substitutes are suggestion-only, picked manually via "Find coach").
 *
 * Pure, framework-free. Every placement is validated through the shared
 * engine in `@/lib/conflicts` (via `evaluateCandidate`), so the generated
 * draft is free of HARD/SYSTEM conflicts by construction. A coach rostered
 * as lead on two groups that train in the same block is placed once and
 * flagged on the second — never silently double-booked (Q1 edge case).
 */

import type {
  AssignmentContext,
  AvailabilityRecord,
  Conflict,
  ConflictConfig,
  DayOfWeek,
} from "@/lib/conflicts";
import type { GridCoach, GridSession } from "./model";
import type { GroupRequirement, GroupRoster, RosterRole } from "./roster";
import { evaluateCandidate, partitionConflicts } from "./conflicts";

export interface PlannedAssignment {
  sessionId: string;
  coachId: string;
  role: RosterRole;
  /** Soft (non-blocking) conflicts the admin should be aware of. */
  warnings: Conflict[];
}

/** One roster slot the generator could not fill, with the reason why. */
export interface ScheduleGap {
  sessionId: string;
  programName: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  courtLabel: string;
  role: RosterRole;
  /** The rostered coach who could not be placed, if the slot has one. */
  coachId: string | null;
  coachName: string | null;
  reason: string;
}

export interface GenerationInput {
  weekStartDate: string;
  /** The week's sessions (cloned from the master template). */
  sessions: GridSession[];
  /** Active coach roster, used to resolve roster members + run the rules. */
  coaches: GridCoach[];
  availability: AvailabilityRecord[];
  /**
   * Already-active assignments for the week (e.g. placed by hand). They count
   * toward each session's requirement and their time commitments are
   * respected so the generator never double-books.
   */
  existingAssignments?: AssignmentContext[];
  /** programId → the group's season coach team (Q1). */
  rosterByProgram: Map<string, GroupRoster>;
  /** programId → required lead/assistant counts (Q1). */
  requirementByProgram: Map<string, GroupRequirement>;
  /** coachId → consecutive travel weeks before this week (Max Travel rule). */
  consecutiveTravelWeeksByCoach?: Map<string, number>;
  config?: Partial<ConflictConfig>;
}

export interface GenerationResult {
  planned: PlannedAssignment[];
  gaps: ScheduleGap[];
  /** Total roster slots the generator tried to fill (excludes already-staffed). */
  openSlotCount: number;
  staffedCount: number;
  warningCount: number;
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

const DAY_ORDER: Record<DayOfWeek, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

/** Deterministic session order: day → start time → program name. */
const bySchedulePosition = (a: GridSession, b: GridSession): number =>
  DAY_ORDER[a.dayOfWeek] - DAY_ORDER[b.dayOfWeek] ||
  a.startTime.localeCompare(b.startTime) ||
  a.programName.localeCompare(b.programName);

const DEFAULT_REQUIREMENT = { requiredLeadCount: 1, requiredAssistantCount: 0 };

/**
 * Generate a weekly draft by placing each group's rostered team into the
 * group's sessions. Pure: returns the planned assignments and the unfilled
 * roster slots without touching any store.
 */
export const generateSchedule = (input: GenerationInput): GenerationResult => {
  const {
    weekStartDate,
    sessions,
    coaches,
    availability,
    existingAssignments = [],
    rosterByProgram,
    requirementByProgram,
    consecutiveTravelWeeksByCoach = new Map(),
    config,
  } = input;

  const coachById = new Map(coaches.map((coach) => [coach.id, coach]));

  const activeExisting = existingAssignments.filter(
    (assignment) => assignment.status === "active",
  );

  // Existing role counts + assigned coaches per session (already staffed slots).
  const existingBySession = new Map<string, AssignmentContext[]>();
  for (const assignment of activeExisting) {
    const list = existingBySession.get(assignment.sessionId) ?? [];
    list.push(assignment);
    existingBySession.set(assignment.sessionId, list);
  }

  // Occupied time per coach, seeded from existing active assignments and grown
  // as the generator places people (the never-double-book invariant).
  const occupied = new Map<string, Interval[]>();
  const occupy = (coachId: string, interval: Interval): void => {
    const intervals = occupied.get(coachId) ?? [];
    intervals.push(interval);
    occupied.set(coachId, intervals);
  };
  const isBusy = (coachId: string, interval: Interval): boolean =>
    (occupied.get(coachId) ?? []).some((existing) => overlaps(existing, interval));

  for (const assignment of activeExisting) {
    occupy(assignment.coachId, {
      day: assignment.session.dayOfWeek,
      start: toMinutes(assignment.session.startTime),
      end: toMinutes(assignment.session.endTime),
    });
  }

  const planned: PlannedAssignment[] = [];
  const gaps: ScheduleGap[] = [];
  let openSlotCount = 0;
  let warningCount = 0;

  // Grows with each placement so later rule checks (double booking, court
  // double booking, court zone) see the draft built so far.
  const liveContexts: AssignmentContext[] = [...activeExisting];

  const gapFor = (
    session: GridSession,
    role: RosterRole,
    coach: GridCoach | null,
    reason: string,
  ): ScheduleGap => ({
    sessionId: session.id,
    programName: session.programName,
    dayOfWeek: session.dayOfWeek,
    startTime: session.startTime,
    endTime: session.endTime,
    courtLabel: session.courtLabel,
    role,
    coachId: coach?.id ?? null,
    coachName: coach?.fullName ?? null,
    reason,
  });

  const placeRole = (
    session: GridSession,
    role: RosterRole,
    requiredCount: number,
    rosterCoachIds: string[],
  ): void => {
    const existing = existingBySession.get(session.id) ?? [];
    const alreadyAssignedIds = new Set(existing.map((assignment) => assignment.coachId));
    const alreadyInRole = existing.filter((assignment) => assignment.role === role).length;

    let remaining = requiredCount - alreadyInRole;
    if (remaining <= 0) return;

    const slot = intervalForSession(session);

    for (const coachId of rosterCoachIds) {
      if (remaining <= 0) return;
      if (alreadyAssignedIds.has(coachId)) continue;

      openSlotCount += 1;

      const coach = coachById.get(coachId);
      if (!coach || !coach.isActive) {
        gaps.push(gapFor(session, role, coach ?? null, "Rostered coach is inactive."));
        remaining -= 1;
        continue;
      }

      // Q1 edge case: rostered on two groups training in the same block —
      // place the first, flag the second. Never silently double-book.
      if (isBusy(coach.id, slot)) {
        gaps.push(
          gapFor(
            session,
            role,
            coach,
            "Double-booked: already placed in another session in this time block.",
          ),
        );
        remaining -= 1;
        continue;
      }

      const conflicts = evaluateCandidate(
        coach,
        session,
        weekStartDate,
        liveContexts,
        availability,
        role,
        config,
        consecutiveTravelWeeksByCoach.get(coach.id),
      );
      const { blocking, warnings } = partitionConflicts(conflicts);

      if (blocking.length > 0) {
        gaps.push(gapFor(session, role, coach, blocking[0].message));
        remaining -= 1;
        continue;
      }

      planned.push({ sessionId: session.id, coachId: coach.id, role, warnings });
      warningCount += warnings.length;
      occupy(coach.id, slot);
      liveContexts.push({
        id: `planned:${coach.id}:${session.id}`,
        coachId: coach.id,
        sessionId: session.id,
        weekStartDate,
        role,
        status: "active",
        session: {
          id: session.id,
          type: session.type,
          dayOfWeek: session.dayOfWeek,
          startTime: session.startTime,
          endTime: session.endTime,
          campus: session.campus,
          courtNumbers: session.courtNumbers,
        },
      });
      remaining -= 1;
    }

    // Roster smaller than the requirement — season setup is incomplete.
    for (let i = 0; i < remaining; i += 1) {
      openSlotCount += 1;
      gaps.push(
        gapFor(session, role, null, "No coach rostered for this slot (see Season Setup)."),
      );
    }
  };

  for (const session of [...sessions].sort(bySchedulePosition)) {
    if (!session.programId) continue;

    const requirement = requirementByProgram.get(session.programId) ?? DEFAULT_REQUIREMENT;
    const roster = rosterByProgram.get(session.programId) ?? { leads: [], assistants: [] };

    placeRole(
      session,
      "lead",
      requirement.requiredLeadCount,
      roster.leads.map((member) => member.coachId),
    );
    placeRole(
      session,
      "assistant",
      requirement.requiredAssistantCount,
      roster.assistants.map((member) => member.coachId),
    );
  }

  return {
    planned,
    gaps,
    openSlotCount,
    staffedCount: planned.length,
    warningCount,
  };
};
