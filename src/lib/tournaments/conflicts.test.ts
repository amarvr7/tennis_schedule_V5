import { describe, expect, it } from "vitest";

import {
  checkAllTournamentConflicts,
  checkTournamentMaxTravel,
  checkTournamentNoDrive,
  checkTournamentTravelRestricted,
} from "./conflicts";
import type { Tournament, TournamentCoach } from "./types";

const buildCoach = (overrides: Partial<TournamentCoach> = {}): TournamentCoach => ({
  id: "coach-1",
  fullName: "Wafik Bennacer",
  initials: "WB",
  title: "Senior Assistant Coach",
  primaryProgramId: "prog-1",
  noDrive: false,
  travelRestricted: false,
  isActive: true,
  ...overrides,
});

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

const baseInput = {
  tournamentAssignments: [] as [],
  coachPublishedAssignments: [] as [],
  tournamentsById: new Map(),
  availability: [] as [],
  consecutiveTravelWeeksBefore: 0,
};

describe("tournament conflicts", () => {
  it("blocks travel-restricted coaches from away tournaments", () => {
    const conflict = checkTournamentTravelRestricted({
      ...baseInput,
      coach: buildCoach({ travelRestricted: true }),
      tournament: buildTournament({ isLocal: false }),
      role: "lead",
    });
    expect(conflict?.type).toBe("travel_restricted");
  });

  it("allows travel-restricted coaches at local tournaments", () => {
    const conflict = checkTournamentTravelRestricted({
      ...baseInput,
      coach: buildCoach({ travelRestricted: true }),
      tournament: buildTournament({ isLocal: true }),
      role: "lead",
    });
    expect(conflict).toBeNull();
  });

  it("blocks no-drive coaches from driver role", () => {
    const conflict = checkTournamentNoDrive({
      ...baseInput,
      coach: buildCoach({ noDrive: true, fullName: "Peter Kovats" }),
      tournament: buildTournament(),
      role: "driver",
    });
    expect(conflict?.type).toBe("no_drive");
  });

  it("blocks assignment after three consecutive travel weeks", () => {
    const conflict = checkTournamentMaxTravel({
      ...baseInput,
      coach: buildCoach(),
      tournament: buildTournament(),
      role: "lead",
      consecutiveTravelWeeksBefore: 3,
    });
    expect(conflict?.type).toBe("max_travel");
  });

  it("checkAllTournamentConflicts collects multiple violations", () => {
    const conflicts = checkAllTournamentConflicts({
      ...baseInput,
      coach: buildCoach({ travelRestricted: true, noDrive: true }),
      tournament: buildTournament({ isLocal: false }),
      role: "driver",
      consecutiveTravelWeeksBefore: 3,
    });
    expect(conflicts.map((c) => c.type)).toEqual(
      expect.arrayContaining(["travel_restricted", "no_drive", "max_travel"]),
    );
  });
});
