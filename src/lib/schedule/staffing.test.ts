import { describe, expect, it } from "vitest";

import type { AvailabilityRecord } from "@/lib/conflicts";
import type { GridAssignment, GridCoach, GridSession } from "./model";
import type { GroupRequirement, GroupRoster, RosterMember } from "./roster";
import { DEFAULT_SEASON_SETTINGS } from "./season";
import { buildWeekStaffing, type WeekStaffingInput } from "./staffing";

const WEEK = "2025-06-02";

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
  courtNumbers: ["Hard 15"],
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

const buildAssignment = (overrides: Partial<GridAssignment> = {}): GridAssignment => ({
  id: "assignment-1",
  sessionId: "session-1",
  coachId: "coach-1",
  role: "lead",
  status: "active",
  isPublished: true,
  weekStartDate: WEEK,
  sub: false,
  subbingForCoachId: null,
  ...overrides,
});

const member = (
  programId: string,
  coachId: string,
  role: RosterMember["role"],
): RosterMember => ({ id: `r:${programId}:${coachId}`, programId, coachId, role });

const requirement = (overrides: Partial<GroupRequirement> = {}): GroupRequirement => ({
  programId: "program-1",
  programName: "Competitive Girls 1",
  programType: "competitive",
  requiredLeadCount: 1,
  requiredAssistantCount: 0,
  baseCapacity: null,
  ...overrides,
});

const baseInput = (overrides: Partial<WeekStaffingInput> = {}): WeekStaffingInput => ({
  weekStartDate: WEEK,
  sessions: [buildSession()],
  coaches: [buildCoach()],
  assignments: [],
  availability: [],
  rosterByProgram: new Map<string, GroupRoster>([
    ["program-1", { leads: [member("program-1", "coach-1", "lead")], assistants: [] }],
  ]),
  requirementByProgram: new Map([["program-1", requirement()]]),
  campHeadcount: null,
  settings: DEFAULT_SEASON_SETTINGS,
  ...overrides,
});

describe("buildWeekStaffing (coverage report, CURSOR_ANSWERS Q1/Q3/Q4)", () => {
  it("classifies a single-day absence with no other duty as FYI (no sub by default)", () => {
    const availability: AvailabilityRecord[] = [
      { coachId: "coach-1", weekStartDate: WEEK, dayOfWeek: "monday", status: "pto" },
    ];

    const result = buildWeekStaffing(baseInput({ availability }));

    expect(result.deficits).toHaveLength(1);
    expect(result.deficits[0].severity).toBe("fyi");
    expect(result.totals.fyi).toBe(1);
    expect(result.totals.needsFill).toBe(0);
  });

  it("classifies a multi-day absence (2+ days) as needs_fill", () => {
    const availability: AvailabilityRecord[] = [
      { coachId: "coach-1", weekStartDate: WEEK, dayOfWeek: "monday", status: "pto" },
      { coachId: "coach-1", weekStartDate: WEEK, dayOfWeek: "tuesday", status: "pto" },
    ];

    const result = buildWeekStaffing(baseInput({ availability }));

    expect(result.deficits).toHaveLength(1);
    expect(result.deficits[0].severity).toBe("needs_fill");
  });

  it("flags the secondary slot of a double-delivering coach as needs_fill", () => {
    // The coach holds another active assignment the same day (their primary
    // delivery), so the missing roster slot is a secondary duty (Q4).
    const otherSession = buildSession({
      id: "session-2",
      programId: "program-2",
      programName: "Junior Camp AM",
      startTime: "10:00",
      endTime: "12:00",
    });
    const availability: AvailabilityRecord[] = [
      { coachId: "coach-1", weekStartDate: WEEK, dayOfWeek: "monday", status: "pto" },
    ];

    const result = buildWeekStaffing(
      baseInput({
        sessions: [buildSession(), otherSession],
        assignments: [
          buildAssignment({ id: "a2", sessionId: "session-2", coachId: "coach-1" }),
        ],
        availability,
      }),
    );

    const rosterDeficit = result.deficits.find((d) => d.sessionId === "session-1");
    expect(rosterDeficit?.severity).toBe("needs_fill");
    expect(rosterDeficit?.reason).toContain("double-delivering");
  });

  it("reports a setup gap when no coach is rostered for a required slot", () => {
    const result = buildWeekStaffing(
      baseInput({
        rosterByProgram: new Map<string, GroupRoster>([
          ["program-1", { leads: [], assistants: [] }],
        ]),
      }),
    );

    expect(result.deficits).toHaveLength(1);
    expect(result.deficits[0].severity).toBe("setup_gap");
  });

  it("warns (never blocks) when camp head count exceeds base capacity", () => {
    const campRequirement = requirement({
      programId: "camp-1",
      programName: "Junior Camp AM",
      programType: "camp",
      baseCapacity: 20,
    });

    const result = buildWeekStaffing(
      baseInput({
        sessions: [],
        rosterByProgram: new Map(),
        requirementByProgram: new Map([["camp-1", campRequirement]]),
        campHeadcount: 37, // 17 over → ceil(17 / 8) = 3 extra coaches
      }),
    );

    expect(result.campWarning).toContain("+3");
  });

  it("warns when an adults session is short of the 1-coach-per-4-adults ratio", () => {
    const adultsSession = buildSession({
      id: "adults-am",
      programId: "adults-1",
      programName: "Adults AM",
      type: "adults",
      startTime: "09:00",
      endTime: "10:30",
      headcount: 10, // ceil(10 / 4) = 3 coaches needed
    });

    const result = buildWeekStaffing(
      baseInput({
        sessions: [adultsSession],
        assignments: [
          buildAssignment({ id: "adults-a1", sessionId: "adults-am", coachId: "coach-1" }),
        ],
        rosterByProgram: new Map<string, GroupRoster>([
          ["adults-1", { leads: [member("adults-1", "coach-1", "lead")], assistants: [] }],
        ]),
        requirementByProgram: new Map([
          ["adults-1", requirement({ programId: "adults-1", programName: "Adults AM", programType: "adults" })],
        ]),
      }),
    );

    expect(result.adultsWarnings).toHaveLength(1);
    expect(result.adultsWarnings[0].coachesNeeded).toBe(3);
    expect(result.adultsWarnings[0].coachesAssigned).toBe(1);
    expect(result.adultsWarnings[0].extraNeeded).toBe(2);
    expect(result.adultsWarnings[0].message).toContain("+2");
  });

  it("does not warn when an adults session meets the ratio or has no head count", () => {
    const staffedSession = buildSession({
      id: "adults-am",
      programId: "adults-1",
      programName: "Adults AM",
      type: "adults",
      headcount: 4, // 1 coach needed, 1 assigned
    });
    const noCountSession = buildSession({
      id: "adults-pm",
      programId: "adults-1",
      programName: "Adults PM",
      type: "adults",
      startTime: "14:00",
      endTime: "15:30",
      headcount: null,
    });

    const result = buildWeekStaffing(
      baseInput({
        sessions: [staffedSession, noCountSession],
        assignments: [
          buildAssignment({ id: "adults-a1", sessionId: "adults-am", coachId: "coach-1" }),
        ],
        rosterByProgram: new Map<string, GroupRoster>([
          ["adults-1", { leads: [member("adults-1", "coach-1", "lead")], assistants: [] }],
        ]),
        requirementByProgram: new Map([
          ["adults-1", requirement({ programId: "adults-1", programName: "Adults AM", programType: "adults" })],
        ]),
      }),
    );

    expect(result.adultsWarnings).toHaveLength(0);
  });

  it("counts sessions using substitutes", () => {
    const result = buildWeekStaffing(
      baseInput({
        assignments: [
          buildAssignment({ coachId: "sub-coach", sub: true, subbingForCoachId: "coach-1" }),
        ],
        coaches: [buildCoach(), buildCoach({ id: "sub-coach", fullName: "Sue Sub" })],
      }),
    );

    expect(result.totals.sessionsUsingSubs).toBe(1);
  });
});
