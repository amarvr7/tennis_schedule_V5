import { describe, expect, it } from "vitest";

import { buildCoachWorkload, buildHoursAnalysis } from "./workload";
import type { RawWorkloadAssignment } from "./workload";

const PERIOD = { startDate: "2025-06-01", endDate: "2025-08-21" };

const row = (overrides: Partial<RawWorkloadAssignment> = {}): RawWorkloadAssignment => ({
  coachId: "coach-1",
  coachName: "Aaron Coach",
  coachTitle: "Head Coach",
  durationMinutes: 120,
  programType: "competitive",
  weekStartDate: "2025-06-02",
  status: "active",
  isPublished: true,
  ...overrides,
});

describe("buildCoachWorkload", () => {
  it("sums duration_minutes for active published assignments in period", () => {
    const rows = [
      row({ durationMinutes: 120 }),
      row({ durationMinutes: 90, weekStartDate: "2025-06-09" }),
      row({ status: "archived", durationMinutes: 60 }),
      row({ isPublished: false, durationMinutes: 60 }),
      row({ weekStartDate: "2025-05-26", durationMinutes: 60 }),
    ];

    const result = buildCoachWorkload(rows, PERIOD, true);
    expect(result).toHaveLength(1);
    expect(result[0].totalMinutes).toBe(210);
    expect(result[0].sessionCount).toBe(2);
  });

  it("includes unpublished when publishedOnly is false", () => {
    const result = buildCoachWorkload(
      [row({ isPublished: false, durationMinutes: 60 })],
      PERIOD,
      false,
    );
    expect(result[0].totalMinutes).toBe(60);
  });
});

describe("buildHoursAnalysis", () => {
  it("computes summary totals", () => {
    const rows = [
      row({ coachId: "c1", coachName: "Coach A", durationMinutes: 240 }),
      row({ coachId: "c2", coachName: "Coach B", durationMinutes: 120 }),
    ];

    const report = buildHoursAnalysis(rows, PERIOD, true);
    expect(report.totals.totalMinutes).toBe(360);
    expect(report.totals.coachCount).toBe(2);
    expect(report.totals.avgMinutesPerCoach).toBe(180);
  });
});
