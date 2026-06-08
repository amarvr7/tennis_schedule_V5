import { describe, expect, it } from "vitest";

import type { Tournament, TournamentAssignment } from "./types";
import {
  consecutiveTravelWeeksBefore,
  datesInRange,
  mondayOfWeek,
  previousWeekMonday,
  tournamentToAvailabilitySlots,
  travelWeeksFromTournamentAssignments,
} from "./travelWeeks";

const buildTournament = (overrides: Partial<Tournament> = {}): Tournament => ({
  id: "t-1",
  name: "USTA L4",
  location: "Orlando",
  isLocal: false,
  startDate: "2025-06-04",
  endDate: "2025-06-08",
  daysCount: 5,
  tournamentType: "USTA",
  programId: "prog-1",
  isCanceled: false,
  isArchived: false,
  publishedAt: null,
  notes: null,
  ...overrides,
});

describe("travelWeeks", () => {
  it("mondayOfWeek returns the Monday of the containing week", () => {
    expect(mondayOfWeek("2025-06-04")).toBe("2025-06-02");
    expect(mondayOfWeek("2025-06-02")).toBe("2025-06-02");
  });

  it("previousWeekMonday steps back seven days", () => {
    expect(previousWeekMonday("2025-06-02")).toBe("2025-05-26");
  });

  it("datesInRange includes start and end", () => {
    expect(datesInRange("2025-06-04", "2025-06-06")).toEqual([
      "2025-06-04",
      "2025-06-05",
      "2025-06-06",
    ]);
  });

  it("counts consecutive travel weeks before the target week", () => {
    const weeks = new Set(["2025-05-26", "2025-06-02"]);
    expect(consecutiveTravelWeeksBefore("2025-06-09", weeks)).toBe(2);
    expect(consecutiveTravelWeeksBefore("2025-06-09", new Set())).toBe(0);
  });

  it("maps published tournament assignments to travel weeks", () => {
    const tournament = buildTournament();
    const tournamentsById = new Map([[tournament.id, tournament]]);
    const assignments: TournamentAssignment[] = [
      {
        id: "a-1",
        tournamentId: tournament.id,
        coachId: "coach-1",
        studentName: null,
        role: "lead",
        status: "published",
        departedAt: null,
        returnedAt: null,
        restDaysOwed: 0,
        notes: null,
        createdAt: "2025-05-01T00:00:00Z",
      },
    ];

    const weeks = travelWeeksFromTournamentAssignments(assignments, tournamentsById);
    expect(weeks.has("2025-06-02")).toBe(true);
  });

  it("expands tournament dates into availability slots per coach", () => {
    const tournament = buildTournament({
      startDate: "2025-06-04",
      endDate: "2025-06-05",
    });
    const slots = tournamentToAvailabilitySlots(tournament, ["coach-1", "coach-2"]);
    expect(slots).toHaveLength(4);
    expect(slots[0]).toMatchObject({
      coachId: "coach-1",
      weekStartDate: "2025-06-02",
      dayOfWeek: "wednesday",
    });
  });
});
