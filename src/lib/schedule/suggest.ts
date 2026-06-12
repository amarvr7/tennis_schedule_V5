/**
 * Substitute suggestions — the only "optimization" in the system
 * (CURSOR_ANSWERS.md Q4). A coach qualifies only if ALL pass:
 *
 *   1. No rule conflicts and not booked in the same time block — both come
 *      from the shared engine via `evaluateCandidate` (double booking, no_camp,
 *      no_bt, time windows, midday blocks, court zone, season, PTO, travel,
 *      rest days, …).
 *   2. Active for the current season (inactive coaches are filtered out).
 *   3. Their OWN group does not train in that same block — even if they are
 *      not assigned to it, they belong on their own court.
 *
 * Ranking uses ROTATION, not familiarity: the coach who has subbed least
 * often / least recently this season ranks first, so sub duty is spread and
 * no coach repeatedly loses touch with their own group. Tiebreak: lowest
 * assigned hours that week. Nothing is ever auto-assigned — these are
 * suggestions for the admin to pick from. Pure module.
 */

import type { AssignmentContext, AvailabilityRecord, Conflict } from "@/lib/conflicts";
import type { GridAssignment, GridCoach, GridSession } from "./model";
import type { RosterMember } from "./roster";
import { evaluateCandidate, partitionConflicts } from "./conflicts";

export interface SubHistoryEntry {
  coachId: string;
  /** Date of the sub assignment, ISO "YYYY-MM-DD" (week start is fine). */
  date: string;
}

export interface SubSuggestion {
  coachId: string;
  coachName: string;
  initials: string | null;
  title: string | null;
  /** Times this coach has subbed this season (rotation rank, ascending). */
  subCountSeason: number;
  /** Most recent sub date this season, or null if they have never subbed. */
  lastSubDate: string | null;
  /** Minutes already assigned this week (tiebreak, ascending). */
  weekMinutes: number;
  /** Soft (non-blocking) warnings the admin should see before picking. */
  warnings: Conflict[];
}

export interface SubSuggestionInput {
  session: GridSession;
  role: "lead" | "assistant";
  weekStartDate: string;
  coaches: GridCoach[];
  /** All sessions of the week — used for the own-group-trains-now exclusion. */
  weekSessions: GridSession[];
  /** Active assignments for the week (engine context + week-load tiebreak). */
  assignments: GridAssignment[];
  activeContexts: AssignmentContext[];
  availability: AvailabilityRecord[];
  /** Every live roster membership this season (coach → their own groups). */
  rosterMembers: RosterMember[];
  /** This season's sub assignments, for the rotation ranking. */
  subHistory: SubHistoryEntry[];
  /** sessionId → duration minutes, for the week-load tiebreak. */
  durationBySession: Map<string, number>;
  /** The absent coach being covered — excluded from suggestions. */
  excludeCoachIds?: string[];
}

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const blocksOverlap = (a: GridSession, b: GridSession): boolean =>
  a.dayOfWeek === b.dayOfWeek &&
  toMinutes(a.startTime) < toMinutes(b.endTime) &&
  toMinutes(b.startTime) < toMinutes(a.endTime);

/** Ranked, fully-qualified substitute suggestions for one open slot. */
export const rankSubSuggestions = (input: SubSuggestionInput): SubSuggestion[] => {
  const {
    session,
    role,
    weekStartDate,
    coaches,
    weekSessions,
    assignments,
    activeContexts,
    availability,
    rosterMembers,
    subHistory,
    durationBySession,
    excludeCoachIds = [],
  } = input;

  const excluded = new Set(excludeCoachIds);

  // coachId → programIds of the coach's own groups this season.
  const ownProgramsByCoach = new Map<string, Set<string>>();
  for (const member of rosterMembers) {
    const programs = ownProgramsByCoach.get(member.coachId) ?? new Set<string>();
    programs.add(member.programId);
    ownProgramsByCoach.set(member.coachId, programs);
  }

  // Programs that train in the target block.
  const programsInBlock = new Set<string>();
  for (const other of weekSessions) {
    if (other.programId && blocksOverlap(other, session)) {
      programsInBlock.add(other.programId);
    }
  }

  // Rotation stats from the season's sub history.
  const subCountByCoach = new Map<string, number>();
  const lastSubByCoach = new Map<string, string>();
  for (const entry of subHistory) {
    subCountByCoach.set(entry.coachId, (subCountByCoach.get(entry.coachId) ?? 0) + 1);
    const last = lastSubByCoach.get(entry.coachId);
    if (!last || entry.date > last) lastSubByCoach.set(entry.coachId, entry.date);
  }

  // Week load per coach (snapshotted durations, active assignments only).
  const weekMinutesByCoach = new Map<string, number>();
  for (const assignment of assignments) {
    if (assignment.status !== "active") continue;
    const duration = durationBySession.get(assignment.sessionId) ?? 0;
    weekMinutesByCoach.set(
      assignment.coachId,
      (weekMinutesByCoach.get(assignment.coachId) ?? 0) + duration,
    );
  }

  const alreadyOnSession = new Set(
    activeContexts
      .filter((context) => context.sessionId === session.id)
      .map((context) => context.coachId),
  );

  const suggestions: SubSuggestion[] = [];

  for (const coach of coaches) {
    if (!coach.isActive) continue;
    if (excluded.has(coach.id)) continue;
    if (alreadyOnSession.has(coach.id)) continue;

    // Their own group trains in this block — keep them with their group.
    const ownPrograms = ownProgramsByCoach.get(coach.id);
    if (ownPrograms && [...ownPrograms].some((programId) => programsInBlock.has(programId))) {
      continue;
    }

    // Full rule pass (double booking, PTO, travel, rest, time windows, …).
    const conflicts = evaluateCandidate(
      coach,
      session,
      weekStartDate,
      activeContexts,
      availability,
      role,
    );
    const { blocking, warnings } = partitionConflicts(conflicts);
    if (blocking.length > 0) continue;

    suggestions.push({
      coachId: coach.id,
      coachName: coach.fullName,
      initials: coach.initials,
      title: coach.title,
      subCountSeason: subCountByCoach.get(coach.id) ?? 0,
      lastSubDate: lastSubByCoach.get(coach.id) ?? null,
      weekMinutes: weekMinutesByCoach.get(coach.id) ?? 0,
      warnings,
    });
  }

  return suggestions.sort(
    (a, b) =>
      a.subCountSeason - b.subCountSeason ||
      (a.lastSubDate ?? "").localeCompare(b.lastSubDate ?? "") ||
      a.weekMinutes - b.weekMinutes ||
      a.coachName.localeCompare(b.coachName),
  );
};
