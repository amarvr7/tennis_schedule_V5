/**
 * Week staffing evaluation — drives the coverage report (CURSOR_ANSWERS.md
 * Q1/Q3/Q4). Measures, per session: missing leads, short assistants, and
 * substitutes in use, then classifies every deficit:
 *
 *   - fyi         Single-day absence of a rostered coach with no other duty
 *                 that day — the group runs one coach short by default, no
 *                 sub (Q4). Also used for standing rule conflicts, which are
 *                 a season-setup problem rather than a fill request.
 *   - needs_fill  Multi-day absence (2+ days), or the SECONDARY duty of a
 *                 coach who was double-delivering that day (Q4) — these rows
 *                 trigger the "Find coach" suggestion flow.
 *   - setup_gap   No coach rostered for the slot at all (Season Setup is
 *                 incomplete).
 *
 * Nothing here assigns anyone; classification only. Pure module.
 */

import type { AvailabilityRecord, Conflict, DayOfWeek } from "@/lib/conflicts";
import type { GridAssignment, GridCoach, GridSession } from "./model";
import type { GroupRequirement, GroupRoster, RosterRole } from "./roster";
import { adultsCoachesNeeded, campOverflowCoaches, type SeasonSettings } from "./season";
import { evaluateCandidate, partitionConflicts, buildActiveContexts } from "./conflicts";

export type DeficitSeverity = "fyi" | "needs_fill" | "setup_gap";

/** One unfilled roster slot (or absence-hit assignment) in the week. */
export interface StaffingDeficit {
  sessionId: string;
  programName: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  courtLabel: string;
  role: RosterRole;
  /** The rostered/assigned coach the deficit traces back to, if any. */
  coachId: string | null;
  coachName: string | null;
  severity: DeficitSeverity;
  reason: string;
}

export interface SessionStaffing {
  sessionId: string;
  programId: string;
  programName: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  requiredLeads: number;
  requiredAssistants: number;
  assignedLeads: number;
  assignedAssistants: number;
  /** Substitute assignments currently active on the session (Q1 reporting). */
  subCount: number;
}

/**
 * One adults session whose entered head count needs more coaches than are
 * assigned (1 coach per `adultsPerCoach` adults). Warn-only, like camp:
 * nothing is blocked or auto-assigned — the admin decides.
 */
export interface AdultsStaffingWarning {
  sessionId: string;
  programName: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  headcount: number;
  coachesNeeded: number;
  coachesAssigned: number;
  extraNeeded: number;
  message: string;
}

export interface WeekStaffing {
  sessions: SessionStaffing[];
  deficits: StaffingDeficit[];
  /** "Camp may need +N coaches" warning, or null (Q3 — warn, never block). */
  campWarning: string | null;
  /** Adults sessions short of the 1-coach-per-N-adults ratio (warn-only). */
  adultsWarnings: AdultsStaffingWarning[];
  totals: {
    missingLeads: number;
    shortAssistants: number;
    sessionsUsingSubs: number;
    needsFill: number;
    fyi: number;
  };
}

export interface WeekStaffingInput {
  weekStartDate: string;
  sessions: GridSession[];
  coaches: GridCoach[];
  assignments: GridAssignment[];
  availability: AvailabilityRecord[];
  rosterByProgram: Map<string, GroupRoster>;
  requirementByProgram: Map<string, GroupRequirement>;
  campHeadcount: number | null;
  settings: SeasonSettings;
}

const ABSENT_STATUSES = new Set(["pto", "traveling", "rest", "orientation"]);

/** Days a coach is absent this week; whole-week rows count as every day. */
const buildAbsentDaysByCoach = (
  availability: AvailabilityRecord[],
  weekStartDate: string,
): Map<string, Set<DayOfWeek | "all">> => {
  const byCoach = new Map<string, Set<DayOfWeek | "all">>();

  for (const record of availability) {
    if (record.weekStartDate !== weekStartDate) continue;
    if (!ABSENT_STATUSES.has(record.status)) continue;

    const days = byCoach.get(record.coachId) ?? new Set<DayOfWeek | "all">();
    days.add(record.dayOfWeek ?? "all");
    byCoach.set(record.coachId, days);
  }

  return byCoach;
};

const isAbsentOn = (
  absentDays: Set<DayOfWeek | "all"> | undefined,
  day: DayOfWeek,
): boolean => !!absentDays && (absentDays.has("all") || absentDays.has(day));

const absentDayCount = (absentDays: Set<DayOfWeek | "all"> | undefined): number => {
  if (!absentDays) return 0;
  if (absentDays.has("all")) return 7;
  return absentDays.size;
};

const firstBlockingMessage = (conflicts: Conflict[]): string | null => {
  const { blocking } = partitionConflicts(conflicts);
  return blocking[0]?.message ?? null;
};

/**
 * Evaluate one week's staffing against the season rosters + requirements.
 */
export const buildWeekStaffing = (input: WeekStaffingInput): WeekStaffing => {
  const {
    weekStartDate,
    sessions,
    coaches,
    assignments,
    availability,
    rosterByProgram,
    requirementByProgram,
    campHeadcount,
    settings,
  } = input;

  const coachById = new Map(coaches.map((coach) => [coach.id, coach]));
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const activeContexts = buildActiveContexts(assignments, sessionsById);
  const absentDaysByCoach = buildAbsentDaysByCoach(availability, weekStartDate);

  const activeAssignments = assignments.filter(
    (assignment) => assignment.status === "active",
  );

  const assignmentsBySession = new Map<string, GridAssignment[]>();
  for (const assignment of activeAssignments) {
    const list = assignmentsBySession.get(assignment.sessionId) ?? [];
    list.push(assignment);
    assignmentsBySession.set(assignment.sessionId, list);
  }

  // Per coach per day: how many duties they hold (for double-delivering, Q4).
  const dutiesByCoachDay = new Map<string, number>();
  for (const assignment of activeAssignments) {
    const session = sessionsById.get(assignment.sessionId);
    if (!session) continue;
    const key = `${assignment.coachId}:${session.dayOfWeek}`;
    dutiesByCoachDay.set(key, (dutiesByCoachDay.get(key) ?? 0) + 1);
  }

  const sessionRows: SessionStaffing[] = [];
  const deficits: StaffingDeficit[] = [];

  const deficitBase = (session: GridSession, role: RosterRole) => ({
    sessionId: session.id,
    programName: session.programName,
    dayOfWeek: session.dayOfWeek,
    startTime: session.startTime,
    endTime: session.endTime,
    courtLabel: session.courtLabel,
    role,
  });

  /** Q4 absence classification for a single rostered coach's missing slot. */
  const classifyAbsence = (
    coach: GridCoach,
    session: GridSession,
  ): { severity: DeficitSeverity; reason: string } => {
    const absentDays = absentDaysByCoach.get(coach.id);
    const daysOut = absentDayCount(absentDays);

    if (daysOut >= 2) {
      return {
        severity: "needs_fill",
        reason: `${coach.fullName} is out ${daysOut === 7 ? "all week" : `${daysOut} days`} — suggested fills apply to all their slots.`,
      };
    }

    const duties = dutiesByCoachDay.get(`${coach.id}:${session.dayOfWeek}`) ?? 0;
    if (duties >= 1) {
      // Their primary (roster) duty absorbs the absence; this missing slot is
      // on top of a day they were already delivering elsewhere → secondary.
      return {
        severity: "needs_fill",
        reason: `${coach.fullName} is out and was double-delivering — this secondary slot needs a fill.`,
      };
    }

    return {
      severity: "fyi",
      reason: `${coach.fullName} is out for the day — group runs one coach short (no sub by default).`,
    };
  };

  for (const session of sessions) {
    if (!session.programId) continue;

    const requirement = requirementByProgram.get(session.programId);
    const requiredLeads = requirement?.requiredLeadCount ?? 1;
    const requiredAssistants = requirement?.requiredAssistantCount ?? 0;
    const roster = rosterByProgram.get(session.programId) ?? { leads: [], assistants: [] };

    const sessionAssignments = assignmentsBySession.get(session.id) ?? [];
    const assignedLeads = sessionAssignments.filter((a) => a.role === "lead").length;
    const assignedAssistants = sessionAssignments.filter(
      (a) => a.role === "assistant",
    ).length;
    const subCount = sessionAssignments.filter((a) => a.sub).length;
    const assignedCoachIds = new Set(sessionAssignments.map((a) => a.coachId));

    sessionRows.push({
      sessionId: session.id,
      programId: session.programId,
      programName: session.programName,
      dayOfWeek: session.dayOfWeek,
      startTime: session.startTime,
      endTime: session.endTime,
      requiredLeads,
      requiredAssistants,
      assignedLeads,
      assignedAssistants,
      subCount,
    });

    const evaluateMissingRole = (role: RosterRole, required: number, assigned: number) => {
      let missing = required - assigned;
      if (missing <= 0) return;

      const rosterMembers = (role === "lead" ? roster.leads : roster.assistants).filter(
        (member) => !assignedCoachIds.has(member.coachId),
      );

      for (const member of rosterMembers) {
        if (missing <= 0) return;
        missing -= 1;

        const coach = coachById.get(member.coachId);
        if (!coach || !coach.isActive) {
          deficits.push({
            ...deficitBase(session, role),
            coachId: member.coachId,
            coachName: coach?.fullName ?? null,
            severity: "setup_gap",
            reason: "Rostered coach is inactive — update Season Setup.",
          });
          continue;
        }

        if (isAbsentOn(absentDaysByCoach.get(coach.id), session.dayOfWeek)) {
          const { severity, reason } = classifyAbsence(coach, session);
          deficits.push({
            ...deficitBase(session, role),
            coachId: coach.id,
            coachName: coach.fullName,
            severity,
            reason,
          });
          continue;
        }

        // Not absent — a standing rule keeps them out (or they're booked
        // elsewhere). Surface the engine's reason; this is informational.
        const blocking = firstBlockingMessage(
          evaluateCandidate(coach, session, weekStartDate, activeContexts, availability, role),
        );
        deficits.push({
          ...deficitBase(session, role),
          coachId: coach.id,
          coachName: coach.fullName,
          severity: "fyi",
          reason: blocking ?? `${coach.fullName} is rostered but not assigned.`,
        });
      }

      // Requirement exceeds the roster — Season Setup is incomplete.
      for (let i = 0; i < missing; i += 1) {
        deficits.push({
          ...deficitBase(session, role),
          coachId: null,
          coachName: null,
          severity: "setup_gap",
          reason: "No coach rostered for this slot — add one in Season Setup.",
        });
      }
    };

    evaluateMissingRole("lead", requiredLeads, assignedLeads);
    evaluateMissingRole("assistant", requiredAssistants, assignedAssistants);
  }

  // Adults ratio warnings: enrollment differs per day and AM/PM track, so the
  // head count lives on each session. 1 coach per settings.adultsPerCoach
  // adults; warn only, never block or auto-assign (owner decision, mirrors Q3).
  const adultsWarnings: AdultsStaffingWarning[] = [];
  for (const session of sessions) {
    if (session.type !== "adults" || session.headcount === null) continue;

    const coachesNeeded = adultsCoachesNeeded(session.headcount, settings);
    const coachesAssigned = (assignmentsBySession.get(session.id) ?? []).length;
    const extraNeeded = coachesNeeded - coachesAssigned;
    if (extraNeeded <= 0) continue;

    adultsWarnings.push({
      sessionId: session.id,
      programName: session.programName,
      dayOfWeek: session.dayOfWeek,
      startTime: session.startTime,
      endTime: session.endTime,
      headcount: session.headcount,
      coachesNeeded,
      coachesAssigned,
      extraNeeded,
      message: `${session.programName} has ${session.headcount} adults — needs ${coachesNeeded} ${coachesNeeded === 1 ? "coach" : "coaches"} (1 per ${settings.adultsPerCoach}), ${coachesAssigned} assigned. May need +${extraNeeded}.`,
    });
  }

  // Camp overflow warning (Q3): warn only, never block or auto-assign.
  let campWarning: string | null = null;
  const campRequirement = [...requirementByProgram.values()].find(
    (requirement) => requirement.programType === "camp" && requirement.baseCapacity !== null,
  );
  if (campRequirement && campHeadcount !== null) {
    const extra = campOverflowCoaches(campHeadcount, campRequirement.baseCapacity, settings);
    if (extra > 0) {
      campWarning = `Camp head count is ${campHeadcount} (base capacity ${campRequirement.baseCapacity}) — camp may need +${extra} ${extra === 1 ? "coach" : "coaches"}.`;
    }
  }

  return {
    sessions: sessionRows,
    deficits,
    campWarning,
    adultsWarnings,
    totals: {
      missingLeads: deficits.filter((d) => d.role === "lead").length,
      shortAssistants: deficits.filter((d) => d.role === "assistant").length,
      sessionsUsingSubs: sessionRows.filter((row) => row.subCount > 0).length,
      needsFill: deficits.filter((d) => d.severity === "needs_fill").length,
      fyi: deficits.filter((d) => d.severity === "fyi").length,
    },
  };
};
