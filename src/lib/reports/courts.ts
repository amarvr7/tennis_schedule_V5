/**
 * Court utilization trends — session occupancy by zone and court label.
 */

import type { CourtUtilizationRow } from "./types";

export type RawCourtSession = {
  courtZone: string | null;
  courtLabel: string | null;
  durationMinutes: number;
  weekStartDate: string;
  hasActiveAssignment: boolean;
};

const MAX_MINUTES_PER_WEEK_PER_COURT = 12 * 60; // 12 hours/day × 6 days heuristic

/** Aggregate court usage from staffed sessions. */
export const buildCourtUtilization = (
  sessions: RawCourtSession[],
  weekStartDate: string,
): CourtUtilizationRow[] => {
  const byCourt = new Map<string, { zone: string; minutes: number; count: number }>();

  for (const session of sessions) {
    if (session.weekStartDate !== weekStartDate) continue;
    if (!session.hasActiveAssignment) continue;

    const zone = session.courtZone ?? "Unassigned";
    const label = session.courtLabel ?? zone;
    const key = `${zone}::${label}`;

    const existing = byCourt.get(key) ?? { zone, minutes: 0, count: 0 };
    existing.minutes += session.durationMinutes;
    existing.count += 1;
    byCourt.set(key, existing);
  }

  return [...byCourt.entries()]
    .map(([key, data]) => {
      const label = key.split("::")[1] ?? data.zone;
      const utilizationPct = Math.min(
        100,
        Math.round((data.minutes / MAX_MINUTES_PER_WEEK_PER_COURT) * 100),
      );
      return {
        courtZone: data.zone,
        courtLabel: label,
        sessionCount: data.count,
        totalMinutes: data.minutes,
        utilizationPct,
      };
    })
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
};
