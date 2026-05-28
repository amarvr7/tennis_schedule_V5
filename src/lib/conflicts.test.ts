import { describe, expect, it } from "vitest";

import {
  type AssignmentContext,
  type AvailabilityRecord,
  type ConflictCheckInput,
  type ConflictCoach,
  type SessionContext,
  checkAllConflicts,
  checkCourtZone,
  checkDoubleBooking,
  checkMiddayBlock,
  checkNoCamp,
} from "@/lib/conflicts";

// -----------------------------------------------------------------------------
// Builders — small, overridable factories keep each test focused on one rule.
// -----------------------------------------------------------------------------

const WEEK = "2025-06-02"; // a Monday inside the summer season

const buildSession = (overrides: Partial<SessionContext> = {}): SessionContext => ({
  id: "session-1",
  type: "developmental",
  dayOfWeek: "monday",
  startTime: "10:00",
  endTime: "11:30",
  campus: "main",
  courtNumbers: ["Hard 15"],
  ...overrides,
});

const buildAssignment = (
  overrides: Partial<AssignmentContext> = {},
): AssignmentContext => {
  const session = buildSession(overrides.session);
  return {
    id: "assignment-1",
    coachId: "coach-1",
    sessionId: session.id,
    weekStartDate: WEEK,
    role: "lead",
    status: "active",
    ...overrides,
    session,
  };
};

const buildCoach = (overrides: Partial<ConflictCoach> = {}): ConflictCoach => ({
  id: "coach-1",
  title: "Assistant Coach",
  season: "year_round",
  seasonStart: null,
  seasonEnd: null,
  earliestStart: null,
  latestEnd: null,
  middayBlockStart: null,
  middayBlockEnd: null,
  noCamp: false,
  noBt: false,
  programRestriction: null,
  ...overrides,
});

const buildInput = (overrides: Partial<ConflictCheckInput> = {}): ConflictCheckInput => ({
  assignment: buildAssignment(),
  coach: buildCoach(),
  weekAssignments: [],
  availability: [],
  ...overrides,
});

// -----------------------------------------------------------------------------
// Required case 1 — Coach with No Camp assigned to a camp session.
// -----------------------------------------------------------------------------

describe("No Camp rule", () => {
  it("blocks a No Camp coach assigned to a camp session", () => {
    const input = buildInput({
      coach: buildCoach({ noCamp: true }),
      assignment: buildAssignment({ session: buildSession({ type: "camp" }) }),
    });

    const conflict = checkNoCamp(input);

    expect(conflict).not.toBeNull();
    expect(conflict?.type).toBe("no_camp");
    expect(conflict?.severity).toBe("hard");
    expect(conflict?.coachId).toBe("coach-1");
  });

  it("allows a No Camp coach on a non-camp session", () => {
    const input = buildInput({
      coach: buildCoach({ noCamp: true }),
      assignment: buildAssignment({ session: buildSession({ type: "developmental" }) }),
    });

    expect(checkNoCamp(input)).toBeNull();
  });

  it("allows a camp session when the coach is not flagged No Camp", () => {
    const input = buildInput({
      coach: buildCoach({ noCamp: false }),
      assignment: buildAssignment({ session: buildSession({ type: "camp" }) }),
    });

    expect(checkNoCamp(input)).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Required case 2 — Midday block coach assigned to a session overlapping 12-1pm.
// -----------------------------------------------------------------------------

describe("Midday block rule", () => {
  it("blocks a session overlapping the coach's 12:00-13:00 midday block", () => {
    const input = buildInput({
      coach: buildCoach({ middayBlockStart: "12:00", middayBlockEnd: "13:00" }),
      assignment: buildAssignment({
        session: buildSession({ startTime: "11:30", endTime: "12:30" }),
      }),
    });

    const conflict = checkMiddayBlock(input);

    expect(conflict).not.toBeNull();
    expect(conflict?.type).toBe("midday_block");
  });

  it("allows a session that ends exactly when the block starts (no overlap)", () => {
    const input = buildInput({
      coach: buildCoach({ middayBlockStart: "12:00", middayBlockEnd: "13:00" }),
      assignment: buildAssignment({
        session: buildSession({ startTime: "11:00", endTime: "12:00" }),
      }),
    });

    expect(checkMiddayBlock(input)).toBeNull();
  });

  it("does nothing when the coach has no midday block configured", () => {
    const input = buildInput({
      assignment: buildAssignment({
        session: buildSession({ startTime: "12:00", endTime: "13:00" }),
      }),
    });

    expect(checkMiddayBlock(input)).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Required case 3 — West Campus at 8am then main campus at 10am (court zone).
// -----------------------------------------------------------------------------

describe("Court zone rule", () => {
  const westMorning = buildAssignment({
    id: "assignment-west",
    sessionId: "session-west",
    session: buildSession({
      id: "session-west",
      startTime: "08:00",
      endTime: "09:30",
      campus: "west",
      courtNumbers: ["West Clay 1"],
    }),
  });

  it("blocks a 10am main-campus session after an 8am West Campus session", () => {
    const input = buildInput({
      assignment: buildAssignment({
        id: "assignment-main",
        sessionId: "session-main",
        session: buildSession({
          id: "session-main",
          startTime: "10:00",
          endTime: "11:30",
          campus: "main",
        }),
      }),
      weekAssignments: [westMorning],
    });

    const conflict = checkCourtZone(input);

    expect(conflict).not.toBeNull();
    expect(conflict?.type).toBe("court_zone");
    expect(conflict?.message).toContain("West Campus");
  });

  it("allows the main-campus session when enough transfer time exists", () => {
    const input = buildInput({
      assignment: buildAssignment({
        id: "assignment-main",
        sessionId: "session-main",
        session: buildSession({
          id: "session-main",
          startTime: "13:00",
          endTime: "14:30",
          campus: "main",
        }),
      }),
      weekAssignments: [westMorning],
    });

    expect(checkCourtZone(input)).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Required case 4 — Same coach double booked at the same time.
// -----------------------------------------------------------------------------

describe("Double booking rule", () => {
  it("blocks the same coach booked into an overlapping session", () => {
    const existing = buildAssignment({
      id: "assignment-existing",
      sessionId: "session-existing",
      session: buildSession({
        id: "session-existing",
        startTime: "10:00",
        endTime: "11:00",
      }),
    });

    const input = buildInput({
      assignment: buildAssignment({
        id: "assignment-new",
        sessionId: "session-new",
        session: buildSession({
          id: "session-new",
          startTime: "10:30",
          endTime: "11:30",
        }),
      }),
      weekAssignments: [existing],
    });

    const conflict = checkDoubleBooking(input);

    expect(conflict).not.toBeNull();
    expect(conflict?.type).toBe("double_booking");
  });

  it("allows back-to-back sessions that do not overlap", () => {
    const existing = buildAssignment({
      id: "assignment-existing",
      sessionId: "session-existing",
      session: buildSession({
        id: "session-existing",
        startTime: "09:00",
        endTime: "10:00",
      }),
    });

    const input = buildInput({
      assignment: buildAssignment({
        id: "assignment-new",
        sessionId: "session-new",
        session: buildSession({
          id: "session-new",
          startTime: "10:00",
          endTime: "11:00",
        }),
      }),
      weekAssignments: [existing],
    });

    expect(checkDoubleBooking(input)).toBeNull();
  });

  it("does not flag an overlap on a different day", () => {
    const existing = buildAssignment({
      id: "assignment-existing",
      sessionId: "session-existing",
      session: buildSession({
        id: "session-existing",
        dayOfWeek: "tuesday",
        startTime: "10:00",
        endTime: "11:00",
      }),
    });

    const input = buildInput({
      assignment: buildAssignment({
        session: buildSession({ dayOfWeek: "monday", startTime: "10:00", endTime: "11:00" }),
      }),
      weekAssignments: [existing],
    });

    expect(checkDoubleBooking(input)).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Engine aggregation + clean baseline.
// -----------------------------------------------------------------------------

describe("checkAllConflicts", () => {
  it("returns no conflicts for a clean assignment", () => {
    expect(checkAllConflicts(buildInput())).toEqual([]);
  });

  it("aggregates multiple simultaneous conflicts", () => {
    const ptoRecord: AvailabilityRecord = {
      coachId: "coach-1",
      weekStartDate: WEEK,
      dayOfWeek: "monday",
      status: "pto",
    };

    const input = buildInput({
      coach: buildCoach({ noCamp: true }),
      assignment: buildAssignment({
        session: buildSession({ type: "camp", dayOfWeek: "monday" }),
      }),
      availability: [ptoRecord],
    });

    const types = checkAllConflicts(input).map((conflict) => conflict.type);

    expect(types).toContain("no_camp");
    expect(types).toContain("pto");
  });
});
