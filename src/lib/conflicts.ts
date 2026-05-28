/**
 * Conflict detection engine — pure, framework-free domain logic.
 *
 * Source of truth: CURSOR_CONTEXT.md "Conflict Detection — Write These as Pure
 * Functions" (the 15 rules) plus "Hard Rules" for exact logic.
 *
 * Design principles (from CURSOR_CONTEXT.md "Core Rules"):
 *   - All conflict detection is pure functions, separate from any UI.
 *   - Times and group compositions are CONFIGURATION DATA, not hardcoded logic.
 *     Every magic value (meeting times, season window, travel cap, campus
 *     transfer buffer) lives in `ConflictConfig` and is overridable per call —
 *     `DEFAULT_CONFIG` is only a fallback so callers can pass DB-sourced config.
 *
 * Each rule is its own exported pure function `(input) => Conflict | null`.
 * `checkAllConflicts` runs every rule and collects the non-null results.
 *
 * No React, Next, or Supabase imports here.
 */

import { normalizeTime } from "@/lib/coaches/rules";

// -----------------------------------------------------------------------------
// Shared domain types
// -----------------------------------------------------------------------------

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

/** Program/session type. Mirrors `programs.type`; `legacy` is treated as adults. */
export type SessionType =
  | "competitive"
  | "developmental"
  | "foundational"
  | "camp"
  | "adults"
  | "legacy"
  | "pro"
  | "bt"
  | "travel"
  | "saturday";

/** Physical location of a session's courts. Far campuses gate the zone rule. */
export type Campus = "main" | "west" | "legacy";

export type AssignmentRole = "lead" | "assistant" | "coverage";

export type AvailabilityStatus =
  | "available"
  | "pto"
  | "traveling"
  | "rest"
  | "orientation";

export type ConflictSeverity = "hard" | "soft" | "system";

export type ConflictType =
  | "double_booking"
  | "no_camp"
  | "no_bt"
  | "earliest_start"
  | "latest_end"
  | "midday_block"
  | "season"
  | "pto"
  | "travel_block"
  | "court_double_booking"
  | "court_zone"
  | "meeting_block"
  | "rest_day"
  | "program_restriction"
  | "max_travel";

/** Output shape, per CURSOR_CONTEXT.md: { type, severity, coachId, sessionId, message }. */
export interface Conflict {
  type: ConflictType;
  severity: ConflictSeverity;
  coachId: string;
  sessionId: string;
  message: string;
}

/** Denormalized session — `type` and `campus` are resolved from program/court_zone. */
export interface SessionContext {
  id: string;
  type: SessionType | null;
  dayOfWeek: DayOfWeek;
  startTime: string; // "HH:MM" or "HH:MM:SS"
  endTime: string;
  campus: Campus;
  courtNumbers: string[]; // normalized court identifiers, e.g. ["Hard 15", "Hard 16"]
}

/** A weekly assignment with its resolved session attached. */
export interface AssignmentContext {
  id: string;
  coachId: string;
  sessionId: string;
  weekStartDate: string; // "YYYY-MM-DD" (Monday)
  role: AssignmentRole | null;
  status: string; // active | pto | traveling | archived
  session: SessionContext;
}

/** Subset of `coaches` columns the rules need. */
export interface ConflictCoach {
  id: string;
  title: string | null;
  season: string; // year_round | summer_only | tbd
  seasonStart: string | null; // "YYYY-MM-DD"
  seasonEnd: string | null;
  earliestStart: string | null; // "HH:MM"
  latestEnd: string | null;
  middayBlockStart: string | null;
  middayBlockEnd: string | null;
  noCamp: boolean;
  noBt: boolean;
  programRestriction: string | null; // null | adults_only
}

/** A `coach_availability` row. `dayOfWeek === null` means the whole week. */
export interface AvailabilityRecord {
  coachId: string;
  weekStartDate: string;
  dayOfWeek: DayOfWeek | null;
  status: AvailabilityStatus;
}

export type CoachGroup = "head_coach" | "assistant";

/** A recurring meeting window that blocks overlapping sessions for a group. */
export interface MeetingBlock {
  dayOfWeek: DayOfWeek;
  start: string; // "HH:MM"
  end: string;
  appliesTo: CoachGroup;
}

/**
 * All tunable values live here so nothing is hardcoded in rule logic. Callers
 * pass DB-sourced config; `DEFAULT_CONFIG` is the documented fallback.
 */
export interface ConflictConfig {
  /** Meeting blocks — CURSOR_CONTEXT: Wed 11:00 assistants, Thu 11:15 head coaches. */
  meetingBlocks: MeetingBlock[];
  /** Minutes needed to cross between a far campus and main campus the same day. */
  campusTransferBufferMinutes: number;
  /** CURSOR_CONTEXT "Max Travel": 3 consecutive travel weeks max → block the 4th. */
  maxConsecutiveTravelWeeks: number;
  /** Summer season window for `summer_only` coaches (used when coach lacks dates). */
  summerSeasonStart: string; // "MM-DD"
  summerSeasonEnd: string; // "MM-DD"
}

export const DEFAULT_CONFIG: ConflictConfig = {
  meetingBlocks: [
    { dayOfWeek: "wednesday", start: "11:00", end: "11:30", appliesTo: "assistant" },
    { dayOfWeek: "thursday", start: "11:15", end: "11:45", appliesTo: "head_coach" },
  ],
  campusTransferBufferMinutes: 60,
  maxConsecutiveTravelWeeks: 3,
  summerSeasonStart: "06-01",
  summerSeasonEnd: "08-21",
};

/** Everything a rule needs to evaluate one candidate assignment. */
export interface ConflictCheckInput {
  /** The candidate assignment being validated. */
  assignment: AssignmentContext;
  /** The coach receiving the assignment, with their rule columns. */
  coach: ConflictCoach;
  /**
   * All other active assignments for the same week (every coach). Used for
   * double booking (same coach) and court double booking (any coach). The
   * candidate is filtered out by `id`.
   */
  weekAssignments: AssignmentContext[];
  /** Availability rows for this coach/week (PTO, traveling, rest). */
  availability: AvailabilityRecord[];
  /** Consecutive travel weeks already logged for this coach (for Max Travel). */
  consecutiveTravelWeeks?: number;
  /** Optional config override; merged over `DEFAULT_CONFIG`. */
  config?: Partial<ConflictConfig>;
}

// -----------------------------------------------------------------------------
// Time + date helpers
// -----------------------------------------------------------------------------

const DAY_INDEX: Record<DayOfWeek, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

/** Convert a "HH:MM"/"HH:MM:SS" time into minutes since midnight, or null. */
const toMinutes = (time: string | null | undefined): number | null => {
  const normalized = normalizeTime(time);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

/** Strict half-open overlap: [aStart, aEnd) intersects [bStart, bEnd). */
const timesOverlap = (
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean => {
  const as = toMinutes(aStart);
  const ae = toMinutes(aEnd);
  const bs = toMinutes(bStart);
  const be = toMinutes(bEnd);
  if (as === null || ae === null || bs === null || be === null) return false;
  return as < be && bs < ae;
};

/** Resolve the calendar date of an assignment from its week + day-of-week. */
const assignmentDate = (weekStartDate: string, dayOfWeek: DayOfWeek): Date | null => {
  const [year, month, day] = weekStartDate.split("-").map(Number);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + DAY_INDEX[dayOfWeek]);
  return date;
};

/** Build a UTC date from this assignment's year and a "MM-DD" config string. */
const dateFromMonthDay = (year: number, monthDay: string): Date | null => {
  const [month, day] = monthDay.split("-").map(Number);
  if (Number.isNaN(month) || Number.isNaN(day)) return null;
  return new Date(Date.UTC(year, month - 1, day));
};

/** Map a coach title to the group used for meeting blocks. */
export const getCoachGroup = (title: string | null): CoachGroup =>
  title?.toLowerCase().includes("head coach") ? "head_coach" : "assistant";

/** Far campuses (other side of campus) gate the court zone rule. */
const isFarCampus = (campus: Campus): boolean => campus === "west" || campus === "legacy";

const FAR_CAMPUS_LABEL: Record<Campus, string> = {
  main: "main campus",
  west: "West Campus",
  legacy: "Legacy",
};

const resolveConfig = (override?: Partial<ConflictConfig>): ConflictConfig => ({
  ...DEFAULT_CONFIG,
  ...override,
});

/** Other active assignments in the week, excluding the candidate itself. */
const otherActiveAssignments = (input: ConflictCheckInput): AssignmentContext[] =>
  input.weekAssignments.filter(
    (a) => a.id !== input.assignment.id && a.status === "active",
  );

/** Availability rows that apply to the candidate's specific day. */
const availabilityForDay = (input: ConflictCheckInput): AvailabilityRecord[] => {
  const { coach, assignment } = input;
  return input.availability.filter(
    (record) =>
      record.coachId === coach.id &&
      record.weekStartDate === assignment.weekStartDate &&
      (record.dayOfWeek === null || record.dayOfWeek === assignment.session.dayOfWeek),
  );
};

// -----------------------------------------------------------------------------
// The 15 rules — each pure: (input) => Conflict | null
// -----------------------------------------------------------------------------

/** 1. Double booking — same coach, same day, overlapping time, different session. */
export const checkDoubleBooking = (input: ConflictCheckInput): Conflict | null => {
  const { assignment, coach } = input;
  const { session } = assignment;

  const clash = otherActiveAssignments(input).find(
    (other) =>
      other.coachId === coach.id &&
      other.sessionId !== assignment.sessionId &&
      other.session.dayOfWeek === session.dayOfWeek &&
      timesOverlap(
        session.startTime,
        session.endTime,
        other.session.startTime,
        other.session.endTime,
      ),
  );

  if (!clash) return null;

  return {
    type: "double_booking",
    severity: "hard",
    coachId: coach.id,
    sessionId: session.id,
    message: `Coach is already booked ${clash.session.startTime}–${clash.session.endTime} on ${session.dayOfWeek}; cannot also take ${session.startTime}–${session.endTime}.`,
  };
};

/** 2. No camp — coach.no_camp && session.type === 'camp'. */
export const checkNoCamp = (input: ConflictCheckInput): Conflict | null => {
  const { coach, assignment } = input;
  if (!coach.noCamp || assignment.session.type !== "camp") return null;

  return {
    type: "no_camp",
    severity: "hard",
    coachId: coach.id,
    sessionId: assignment.session.id,
    message: "Coach is flagged No Camp and cannot be assigned to a camp session.",
  };
};

/** 3. No BT — coach.no_bt && session.type === 'bt'. */
export const checkNoBt = (input: ConflictCheckInput): Conflict | null => {
  const { coach, assignment } = input;
  if (!coach.noBt || assignment.session.type !== "bt") return null;

  return {
    type: "no_bt",
    severity: "hard",
    coachId: coach.id,
    sessionId: assignment.session.id,
    message: "Coach is flagged No BT and cannot be assigned to a Breakthrough session.",
  };
};

/** 4. Earliest start — session.start_time < coach.earliest_start. */
export const checkEarliestStart = (input: ConflictCheckInput): Conflict | null => {
  const { coach, assignment } = input;
  const earliest = toMinutes(coach.earliestStart);
  const start = toMinutes(assignment.session.startTime);
  if (earliest === null || start === null || start >= earliest) return null;

  return {
    type: "earliest_start",
    severity: "hard",
    coachId: coach.id,
    sessionId: assignment.session.id,
    message: `Session starts ${assignment.session.startTime}, before the coach's earliest start of ${coach.earliestStart}.`,
  };
};

/** 5. Latest end — session.end_time > coach.latest_end. */
export const checkLatestEnd = (input: ConflictCheckInput): Conflict | null => {
  const { coach, assignment } = input;
  const latest = toMinutes(coach.latestEnd);
  const end = toMinutes(assignment.session.endTime);
  if (latest === null || end === null || end <= latest) return null;

  return {
    type: "latest_end",
    severity: "hard",
    coachId: coach.id,
    sessionId: assignment.session.id,
    message: `Session ends ${assignment.session.endTime}, after the coach's latest end of ${coach.latestEnd}.`,
  };
};

/** 6. Midday block — session overlaps the coach's midday block window. */
export const checkMiddayBlock = (input: ConflictCheckInput): Conflict | null => {
  const { coach, assignment } = input;
  if (!coach.middayBlockStart || !coach.middayBlockEnd) return null;

  const { session } = assignment;
  if (
    !timesOverlap(
      session.startTime,
      session.endTime,
      coach.middayBlockStart,
      coach.middayBlockEnd,
    )
  ) {
    return null;
  }

  return {
    type: "midday_block",
    severity: "hard",
    coachId: coach.id,
    sessionId: session.id,
    message: `Session ${session.startTime}–${session.endTime} overlaps the coach's midday block (${coach.middayBlockStart}–${coach.middayBlockEnd}).`,
  };
};

/** 7. Season — summer_only coach assigned outside the summer window. */
export const checkSeason = (input: ConflictCheckInput): Conflict | null => {
  const { coach, assignment } = input;
  if (coach.season !== "summer_only") return null;

  const config = resolveConfig(input.config);
  const date = assignmentDate(assignment.weekStartDate, assignment.session.dayOfWeek);
  if (!date) return null;

  const year = date.getUTCFullYear();
  const start = coach.seasonStart
    ? new Date(`${coach.seasonStart}T00:00:00Z`)
    : dateFromMonthDay(year, config.summerSeasonStart);
  const end = coach.seasonEnd
    ? new Date(`${coach.seasonEnd}T00:00:00Z`)
    : dateFromMonthDay(year, config.summerSeasonEnd);
  if (!start || !end) return null;

  if (date >= start && date <= end) return null;

  return {
    type: "season",
    severity: "hard",
    coachId: coach.id,
    sessionId: assignment.session.id,
    message: `Summer-only coach assigned on ${date.toISOString().slice(0, 10)}, outside the summer season.`,
  };
};

/** 8. PTO — coach marked unavailable (pto) that day or week. */
export const checkPto = (input: ConflictCheckInput): Conflict | null => {
  const { coach, assignment } = input;
  const onPto = availabilityForDay(input).some((record) => record.status === "pto");
  if (!onPto) return null;

  return {
    type: "pto",
    severity: "hard",
    coachId: coach.id,
    sessionId: assignment.session.id,
    message: `Coach is on PTO on ${assignment.session.dayOfWeek} and cannot be assigned.`,
  };
};

/** 9. Travel block — coach marked traveling for the day/week. */
export const checkTravelBlock = (input: ConflictCheckInput): Conflict | null => {
  const { coach, assignment } = input;
  const traveling = availabilityForDay(input).some(
    (record) => record.status === "traveling",
  );
  if (!traveling) return null;

  return {
    type: "travel_block",
    severity: "hard",
    coachId: coach.id,
    sessionId: assignment.session.id,
    message: `Coach is traveling on ${assignment.session.dayOfWeek}; local assignments are blocked.`,
  };
};

/** 10. Court double booking — same court, same day, overlapping time, different session. */
export const checkCourtDoubleBooking = (input: ConflictCheckInput): Conflict | null => {
  const { assignment, coach } = input;
  const { session } = assignment;
  if (session.courtNumbers.length === 0) return null;

  const candidateCourts = new Set(session.courtNumbers);

  const clash = otherActiveAssignments(input).find((other) => {
    if (other.sessionId === assignment.sessionId) return false;
    if (other.session.dayOfWeek !== session.dayOfWeek) return false;
    if (
      !timesOverlap(
        session.startTime,
        session.endTime,
        other.session.startTime,
        other.session.endTime,
      )
    ) {
      return false;
    }
    return other.session.courtNumbers.some((court) => candidateCourts.has(court));
  });

  if (!clash) return null;

  const shared = clash.session.courtNumbers.filter((court) => candidateCourts.has(court));

  return {
    type: "court_double_booking",
    severity: "hard",
    coachId: coach.id,
    sessionId: session.id,
    message: `Court(s) ${shared.join(", ")} already booked ${clash.session.startTime}–${clash.session.endTime} on ${session.dayOfWeek}.`,
  };
};

/** 11. Court zone rule — early far-campus (West/Legacy) blocks a too-soon main-campus session. */
export const checkCourtZone = (input: ConflictCheckInput): Conflict | null => {
  const { assignment, coach } = input;
  const { session } = assignment;
  if (session.campus !== "main") return null;

  const config = resolveConfig(input.config);
  const candidateStart = toMinutes(session.startTime);
  if (candidateStart === null) return null;

  const blockingFarSession = otherActiveAssignments(input).find((other) => {
    if (other.coachId !== coach.id) return false;
    if (other.session.dayOfWeek !== session.dayOfWeek) return false;
    if (!isFarCampus(other.session.campus)) return false;

    const farEnd = toMinutes(other.session.endTime);
    const farStart = toMinutes(other.session.startTime);
    if (farEnd === null || farStart === null) return false;
    if (farStart >= candidateStart) return false; // far session must be earlier

    return candidateStart - farEnd < config.campusTransferBufferMinutes;
  });

  if (!blockingFarSession) return null;

  return {
    type: "court_zone",
    severity: "hard",
    coachId: coach.id,
    sessionId: session.id,
    message: `Coach is at ${FAR_CAMPUS_LABEL[blockingFarSession.session.campus]} (${blockingFarSession.session.startTime}–${blockingFarSession.session.endTime}); cannot reach main campus by ${session.startTime}.`,
  };
};

/** 12. Meeting block — session overlaps a group meeting (Wed assistants / Thu head coaches). */
export const checkMeetingBlock = (input: ConflictCheckInput): Conflict | null => {
  const { assignment, coach } = input;
  const { session } = assignment;
  const config = resolveConfig(input.config);
  const group = getCoachGroup(coach.title);

  const meeting = config.meetingBlocks.find(
    (block) =>
      block.appliesTo === group &&
      block.dayOfWeek === session.dayOfWeek &&
      timesOverlap(session.startTime, session.endTime, block.start, block.end),
  );

  if (!meeting) return null;

  return {
    type: "meeting_block",
    severity: "hard",
    coachId: coach.id,
    sessionId: session.id,
    message: `Session overlaps the ${meeting.dayOfWeek} ${meeting.start} ${group.replace("_", " ")} meeting block.`,
  };
};

/** 13. Rest day — coach is in an auto-blocked rest period. */
export const checkRestDay = (input: ConflictCheckInput): Conflict | null => {
  const { coach, assignment } = input;
  const resting = availabilityForDay(input).some((record) => record.status === "rest");
  if (!resting) return null;

  return {
    type: "rest_day",
    severity: "system",
    coachId: coach.id,
    sessionId: assignment.session.id,
    message: `Coach is in an auto-blocked rest period on ${assignment.session.dayOfWeek}.`,
  };
};

/** 14. Program restriction — adults_only coach in a non-adult session. */
export const checkProgramRestriction = (input: ConflictCheckInput): Conflict | null => {
  const { coach, assignment } = input;
  if (coach.programRestriction !== "adults_only") return null;

  const { type } = assignment.session;
  if (type === "adults" || type === "legacy") return null;

  return {
    type: "program_restriction",
    severity: "hard",
    coachId: coach.id,
    sessionId: assignment.session.id,
    message: `Adults-only coach cannot be assigned to a ${type ?? "non-adult"} session.`,
  };
};

/** 15. Max travel — block the 4th travel assignment after 3 consecutive travel weeks. */
export const checkMaxTravel = (input: ConflictCheckInput): Conflict | null => {
  const { coach, assignment } = input;
  if (assignment.session.type !== "travel") return null;

  const config = resolveConfig(input.config);
  const consecutive = input.consecutiveTravelWeeks ?? 0;
  if (consecutive < config.maxConsecutiveTravelWeeks) return null;

  return {
    type: "max_travel",
    severity: "hard",
    coachId: coach.id,
    sessionId: assignment.session.id,
    message: `Coach has ${consecutive} consecutive travel weeks (max ${config.maxConsecutiveTravelWeeks}); a home week is required before more travel.`,
  };
};

/** All 15 rules, ordered to match CURSOR_CONTEXT's Conflict Detection list. */
export const CONFLICT_RULES: ReadonlyArray<(input: ConflictCheckInput) => Conflict | null> = [
  checkDoubleBooking,
  checkNoCamp,
  checkNoBt,
  checkEarliestStart,
  checkLatestEnd,
  checkMiddayBlock,
  checkSeason,
  checkPto,
  checkTravelBlock,
  checkCourtDoubleBooking,
  checkCourtZone,
  checkMeetingBlock,
  checkRestDay,
  checkProgramRestriction,
  checkMaxTravel,
];

/**
 * Run every rule against one candidate assignment and collect the conflicts.
 * Returns an empty array when the assignment is clean.
 */
export const checkAllConflicts = (input: ConflictCheckInput): Conflict[] =>
  CONFLICT_RULES.reduce<Conflict[]>((conflicts, rule) => {
    const conflict = rule(input);
    if (conflict) conflicts.push(conflict);
    return conflicts;
  }, []);
