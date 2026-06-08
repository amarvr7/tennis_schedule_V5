import { describe, expect, it } from "vitest";

import type { AssignmentContext, AvailabilityRecord } from "@/lib/conflicts";
import type { GridCoach, GridSession } from "./model";
import { toSessionContext } from "./model";
import { generateSchedule } from "./generate";

const WEEK = "2025-06-02"; // a Monday inside the summer season

const buildSession = (overrides: Partial<GridSession> = {}): GridSession => ({
  id: "session-1",
  programId: "program-1",
  programName: "Competitive Girls 1",
  type: "competitive",
  dayOfWeek: "monday",
  startTime: "08:00",
  endTime: "10:00",
  campus: "main",
  courtZone: "Zone C",
  courtLabel: "Hard 15-18",
  courtNumbers: ["Hard 15", "Hard 16", "Hard 17", "Hard 18"],
  ...overrides,
});

const buildCoach = (overrides: Partial<GridCoach> = {}): GridCoach => ({
  id: "coach-1",
  fullName: "Aaron Coach",
  initials: "AC",
  title: "Head Coach",
  season: "year_round",
  seasonStart: null,
  seasonEnd: null,
  earliestStart: null,
  latestEnd: null,
  middayBlockStart: null,
  middayBlockEnd: null,
  noCamp: false,
  noBt: false,
  noDrive: false,
  programRestriction: null,
  isActive: true,
  ...overrides,
});

const activeContext = (
  coachId: string,
  session: GridSession,
): AssignmentContext => ({
  id: `existing:${coachId}:${session.id}`,
  coachId,
  sessionId: session.id,
  weekStartDate: WEEK,
  role: "lead",
  status: "active",
  session: toSessionContext(session),
});

describe("generateSchedule", () => {
  it("staffs an open session with an available coach", () => {
    const session = buildSession();
    const coach = buildCoach();

    const result = generateSchedule({
      weekStartDate: WEEK,
      sessions: [session],
      coaches: [coach],
      availability: [],
    });

    expect(result.openSessionCount).toBe(1);
    expect(result.staffedCount).toBe(1);
    expect(result.gaps).toHaveLength(0);
    expect(result.planned[0]).toMatchObject({
      sessionId: session.id,
      coachId: coach.id,
      role: "lead",
      reason: "available",
    });
  });

  it("prefers the program's head coach over a generic available coach", () => {
    const session = buildSession();
    const headCoach = buildCoach({ id: "head", fullName: "Zoe Head" });
    const filler = buildCoach({ id: "filler", fullName: "Aaron Filler" });

    const result = generateSchedule({
      weekStartDate: WEEK,
      sessions: [session],
      coaches: [filler, headCoach],
      availability: [],
      headCoachByProgram: new Map([[session.programId!, headCoach.id]]),
    });

    expect(result.planned[0].coachId).toBe(headCoach.id);
    expect(result.planned[0].reason).toBe("head_coach");
  });

  it("prefers a coach's primary program over an unrelated session", () => {
    const session = buildSession();
    const homeCoach = buildCoach({ id: "home", fullName: "Zed Home" });
    const filler = buildCoach({ id: "filler", fullName: "Aaron Filler" });

    const result = generateSchedule({
      weekStartDate: WEEK,
      sessions: [session],
      coaches: [filler, homeCoach],
      availability: [],
      primaryProgramByCoach: new Map([[homeCoach.id, session.programId!]]),
    });

    expect(result.planned[0].coachId).toBe(homeCoach.id);
    expect(result.planned[0].reason).toBe("primary_program");
  });

  it("never double-books a coach across overlapping sessions", () => {
    const morningA = buildSession({ id: "a", programName: "Comp Girls 1" });
    const morningB = buildSession({
      id: "b",
      programName: "Comp Boys 1",
      courtLabel: "Hard 8-11",
      courtNumbers: ["Hard 8", "Hard 9", "Hard 10", "Hard 11"],
    });
    const onlyCoach = buildCoach({ id: "solo" });

    const result = generateSchedule({
      weekStartDate: WEEK,
      sessions: [morningA, morningB],
      coaches: [onlyCoach],
      availability: [],
    });

    expect(result.staffedCount).toBe(1);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].reason).toContain("already booked");
  });

  it("maximizes coverage when a greedy preference would strand a session", () => {
    // Two overlapping sessions. A is open to both coaches; B is a camp session
    // that coachOnlyA (No Camp) cannot take. Preference would greedily put the
    // shared coach on A (their home program), stranding B — the solver must
    // instead give A to coachOnlyA and B to coachShared to staff both.
    const sessionA = buildSession({ id: "a", programId: "pa", programName: "A" });
    const sessionB = buildSession({
      id: "b",
      programId: "pb",
      programName: "Junior Camp",
      type: "camp",
      courtLabel: "Hard 8-11",
      courtNumbers: ["Hard 8", "Hard 9"],
    });
    const coachShared = buildCoach({ id: "shared", fullName: "Shared Coach" });
    const coachOnlyA = buildCoach({ id: "onlyA", fullName: "Only A", noCamp: true });

    const result = generateSchedule({
      weekStartDate: WEEK,
      sessions: [sessionA, sessionB],
      coaches: [coachShared, coachOnlyA],
      availability: [],
      // coachShared is the home/head coach of A, so preference pulls them to A.
      headCoachByProgram: new Map([["pa", coachShared.id]]),
    });

    expect(result.staffedCount).toBe(2);
    expect(result.gaps).toHaveLength(0);
    const bySession = new Map(result.planned.map((p) => [p.sessionId, p.coachId]));
    expect(bySession.get("a")).toBe(coachOnlyA.id);
    expect(bySession.get("b")).toBe(coachShared.id);
  });

  it("reports a gap with a hard-rule reason when no coach is eligible", () => {
    const session = buildSession();
    const ptoCoach = buildCoach({ id: "pto" });
    const availability: AvailabilityRecord[] = [
      { coachId: ptoCoach.id, weekStartDate: WEEK, dayOfWeek: "monday", status: "pto" },
    ];

    const result = generateSchedule({
      weekStartDate: WEEK,
      sessions: [session],
      coaches: [ptoCoach],
      availability,
    });

    expect(result.staffedCount).toBe(0);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].reason).toContain("hard rules");
  });

  it("leaves already-staffed sessions untouched and respects their time", () => {
    const morning = buildSession({ id: "m" });
    const overlapping = buildSession({
      id: "o",
      programName: "Overlap",
      courtLabel: "Hard 8-11",
      courtNumbers: ["Hard 8"],
    });
    const coach = buildCoach({ id: "busy" });

    const result = generateSchedule({
      weekStartDate: WEEK,
      sessions: [morning, overlapping],
      coaches: [coach],
      availability: [],
      // Coach already leads `morning`; only `overlapping` is open and it
      // overlaps in time, so the coach cannot also take it.
      existingAssignments: [activeContext(coach.id, morning)],
    });

    expect(result.openSessionCount).toBe(1);
    expect(result.staffedCount).toBe(0);
    expect(result.gaps[0].sessionId).toBe("o");
  });
});
