import { describe, expect, it } from "vitest";

import type { AssignmentContext, AvailabilityRecord } from "@/lib/conflicts";
import type { GridCoach, GridSession } from "./model";
import { toSessionContext } from "./model";
import type { GroupRequirement, GroupRoster, RosterMember } from "./roster";
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
  headcount: null,
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

const member = (
  programId: string,
  coachId: string,
  role: RosterMember["role"],
): RosterMember => ({
  id: `roster:${programId}:${coachId}`,
  programId,
  coachId,
  role,
});

const roster = (leads: RosterMember[], assistants: RosterMember[] = []): GroupRoster => ({
  leads,
  assistants,
});

const requirement = (
  programId: string,
  leads: number,
  assistants: number,
): GroupRequirement => ({
  programId,
  programName: "Group",
  programType: "competitive",
  requiredLeadCount: leads,
  requiredAssistantCount: assistants,
  baseCapacity: null,
});

const activeContext = (
  coachId: string,
  session: GridSession,
  role: "lead" | "assistant" = "lead",
): AssignmentContext => ({
  id: `existing:${coachId}:${session.id}`,
  coachId,
  sessionId: session.id,
  weekStartDate: WEEK,
  role,
  status: "active",
  session: toSessionContext(session),
});

describe("generateSchedule (roster-first, CURSOR_ANSWERS Q1/Q5)", () => {
  it("places the group's rostered lead and assistants into the group's session", () => {
    const session = buildSession();
    const lead = buildCoach({ id: "lead", fullName: "Lena Lead" });
    const assistant = buildCoach({ id: "asst", fullName: "Andy Assistant" });

    const result = generateSchedule({
      weekStartDate: WEEK,
      sessions: [session],
      coaches: [lead, assistant],
      availability: [],
      rosterByProgram: new Map([
        ["program-1", roster([member("program-1", "lead", "lead")], [member("program-1", "asst", "assistant")])],
      ]),
      requirementByProgram: new Map([["program-1", requirement("program-1", 1, 1)]]),
    });

    expect(result.openSlotCount).toBe(2);
    expect(result.staffedCount).toBe(2);
    expect(result.gaps).toHaveLength(0);
    expect(result.planned).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ coachId: "lead", role: "lead" }),
        expect.objectContaining({ coachId: "asst", role: "assistant" }),
      ]),
    );
  });

  it("never pulls from the general pool — an absent roster coach becomes a gap", () => {
    const session = buildSession();
    const lead = buildCoach({ id: "lead", fullName: "Lena Lead" });
    const outsider = buildCoach({ id: "outsider", fullName: "Otto Outsider" });
    const availability: AvailabilityRecord[] = [
      { coachId: "lead", weekStartDate: WEEK, dayOfWeek: "monday", status: "pto" },
    ];

    const result = generateSchedule({
      weekStartDate: WEEK,
      sessions: [session],
      coaches: [lead, outsider],
      availability,
      rosterByProgram: new Map([
        ["program-1", roster([member("program-1", "lead", "lead")])],
      ]),
      requirementByProgram: new Map([["program-1", requirement("program-1", 1, 0)]]),
    });

    expect(result.staffedCount).toBe(0);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({ coachId: "lead", role: "lead" });
    // The outsider must never be auto-assigned (Q4: suggestions only).
    expect(result.planned).toHaveLength(0);
  });

  it("flags (never silently double-books) a coach rostered as lead on two simultaneous groups", () => {
    const sessionA = buildSession({ id: "a", programId: "pa", programName: "A Group" });
    const sessionB = buildSession({
      id: "b",
      programId: "pb",
      programName: "B Group",
      courtLabel: "Hard 8-11",
      courtNumbers: ["Hard 8", "Hard 9"],
    });
    const sharedLead = buildCoach({ id: "shared", fullName: "Shared Lead" });

    const result = generateSchedule({
      weekStartDate: WEEK,
      sessions: [sessionA, sessionB],
      coaches: [sharedLead],
      availability: [],
      rosterByProgram: new Map([
        ["pa", roster([member("pa", "shared", "lead")])],
        ["pb", roster([member("pb", "shared", "lead")])],
      ]),
      requirementByProgram: new Map([
        ["pa", requirement("pa", 1, 0)],
        ["pb", requirement("pb", 1, 0)],
      ]),
    });

    expect(result.staffedCount).toBe(1);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].coachId).toBe("shared");
    expect(result.gaps[0].reason).toContain("Double-booked");
  });

  it("reports a setup gap when the requirement exceeds the roster", () => {
    const session = buildSession();
    const lead = buildCoach({ id: "lead" });

    const result = generateSchedule({
      weekStartDate: WEEK,
      sessions: [session],
      coaches: [lead],
      availability: [],
      rosterByProgram: new Map([
        ["program-1", roster([member("program-1", "lead", "lead")])],
      ]),
      requirementByProgram: new Map([["program-1", requirement("program-1", 1, 2)]]),
    });

    expect(result.staffedCount).toBe(1);
    expect(result.gaps).toHaveLength(2);
    expect(result.gaps.every((gap) => gap.reason.includes("Season Setup"))).toBe(true);
  });

  it("counts existing active assignments toward the requirement and never duplicates", () => {
    const session = buildSession();
    const lead = buildCoach({ id: "lead" });

    const result = generateSchedule({
      weekStartDate: WEEK,
      sessions: [session],
      coaches: [lead],
      availability: [],
      existingAssignments: [activeContext("lead", session, "lead")],
      rosterByProgram: new Map([
        ["program-1", roster([member("program-1", "lead", "lead")])],
      ]),
      requirementByProgram: new Map([["program-1", requirement("program-1", 1, 0)]]),
    });

    expect(result.openSlotCount).toBe(0);
    expect(result.planned).toHaveLength(0);
    expect(result.gaps).toHaveLength(0);
  });

  it("surfaces the engine's rule reason when a roster coach is blocked (e.g. No Camp)", () => {
    const campSession = buildSession({
      id: "camp",
      programId: "camp-program",
      programName: "Junior Camp AM",
      type: "camp",
    });
    const noCampCoach = buildCoach({ id: "nc", fullName: "Nora NoCamp", noCamp: true });

    const result = generateSchedule({
      weekStartDate: WEEK,
      sessions: [campSession],
      coaches: [noCampCoach],
      availability: [],
      rosterByProgram: new Map([
        ["camp-program", roster([member("camp-program", "nc", "lead")])],
      ]),
      requirementByProgram: new Map([["camp-program", requirement("camp-program", 1, 0)]]),
    });

    expect(result.staffedCount).toBe(0);
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].coachId).toBe("nc");
  });
});
