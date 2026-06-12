import { describe, expect, it } from "vitest";

import type { AvailabilityRecord } from "@/lib/conflicts";
import type { GridCoach, GridSession } from "./model";
import type { RosterMember } from "./roster";
import { rankSubSuggestions, type SubSuggestionInput } from "./suggest";

const WEEK = "2025-06-02";

const buildSession = (overrides: Partial<GridSession> = {}): GridSession => ({
  id: "target",
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
  noDrive: false,
  programRestriction: null,
  isActive: true,
  ...overrides,
});

const member = (
  programId: string,
  coachId: string,
  role: RosterMember["role"] = "lead",
): RosterMember => ({ id: `r:${programId}:${coachId}`, programId, coachId, role });

const baseInput = (overrides: Partial<SubSuggestionInput> = {}): SubSuggestionInput => ({
  session: buildSession(),
  role: "lead",
  weekStartDate: WEEK,
  coaches: [buildCoach()],
  weekSessions: [buildSession()],
  assignments: [],
  activeContexts: [],
  availability: [],
  rosterMembers: [],
  subHistory: [],
  durationBySession: new Map(),
  ...overrides,
});

describe("rankSubSuggestions (CURSOR_ANSWERS Q4 — rotation, not familiarity)", () => {
  it("excludes a coach whose own group trains in the same block", () => {
    // own-group's session overlaps the target block, so the coach stays put.
    const ownGroupSession = buildSession({
      id: "own",
      programId: "own-program",
      programName: "Comp Boys 2",
      startTime: "09:00",
      endTime: "11:00",
    });

    const suggestions = rankSubSuggestions(
      baseInput({
        weekSessions: [buildSession(), ownGroupSession],
        rosterMembers: [member("own-program", "coach-1")],
      }),
    );

    expect(suggestions).toHaveLength(0);
  });

  it("excludes coaches blocked by the rules (e.g. PTO that day)", () => {
    const availability: AvailabilityRecord[] = [
      { coachId: "coach-1", weekStartDate: WEEK, dayOfWeek: "monday", status: "pto" },
    ];

    const suggestions = rankSubSuggestions(baseInput({ availability }));

    expect(suggestions).toHaveLength(0);
  });

  it("ranks the coach who has subbed least often this season first", () => {
    const fresh = buildCoach({ id: "fresh", fullName: "Fresh Coach" });
    const frequent = buildCoach({ id: "frequent", fullName: "Frequent Sub" });

    const suggestions = rankSubSuggestions(
      baseInput({
        coaches: [frequent, fresh],
        subHistory: [
          { coachId: "frequent", date: "2025-05-19" },
          { coachId: "frequent", date: "2025-05-26" },
        ],
      }),
    );

    expect(suggestions.map((s) => s.coachId)).toEqual(["fresh", "frequent"]);
  });

  it("tiebreaks equal rotation by lowest assigned hours this week", () => {
    const light = buildCoach({ id: "light", fullName: "Zoe Light" });
    const heavy = buildCoach({ id: "heavy", fullName: "Adam Heavy" });
    const otherSession = buildSession({
      id: "other",
      programId: "p2",
      dayOfWeek: "tuesday",
    });

    const suggestions = rankSubSuggestions(
      baseInput({
        coaches: [heavy, light],
        weekSessions: [buildSession(), otherSession],
        assignments: [
          {
            id: "a1",
            sessionId: "other",
            coachId: "heavy",
            role: "lead",
            status: "active",
            isPublished: true,
            weekStartDate: WEEK,
            sub: false,
            subbingForCoachId: null,
          },
        ],
        durationBySession: new Map([["other", 120]]),
      }),
    );

    expect(suggestions.map((s) => s.coachId)).toEqual(["light", "heavy"]);
    expect(suggestions[1].weekMinutes).toBe(120);
  });

  it("excludes the absent coach being covered", () => {
    const suggestions = rankSubSuggestions(baseInput({ excludeCoachIds: ["coach-1"] }));
    expect(suggestions).toHaveLength(0);
  });
});
