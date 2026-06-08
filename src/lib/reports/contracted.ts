/**
 * Contracted hours by title tier — interim defaults until per-coach DB config exists.
 * Values represent expected weekly on-court hours during the summer season.
 */

const TITLE_CONTRACTED_HOURS: ReadonlyArray<{ match: RegExp; weeklyHours: number }> = [
  { match: /director/i, weeklyHours: 40 },
  { match: /operations coordinator/i, weeklyHours: 40 },
  { match: /senior head coach/i, weeklyHours: 40 },
  { match: /head coach/i, weeklyHours: 40 },
  { match: /senior asst coach|senior assistant coach/i, weeklyHours: 40 },
  { match: /asst coach|assistant coach/i, weeklyHours: 35 },
  { match: /camp lead/i, weeklyHours: 40 },
  { match: /performance analyst/i, weeklyHours: 0 },
];

const DEFAULT_WEEKLY_HOURS = 40;

/** Expected weekly contracted minutes for a coach title. */
export const contractedMinutesWeekly = (title: string | null | undefined): number => {
  if (!title) return DEFAULT_WEEKLY_HOURS * 60;
  for (const entry of TITLE_CONTRACTED_HOURS) {
    if (entry.match.test(title)) return entry.weeklyHours * 60;
  }
  return DEFAULT_WEEKLY_HOURS * 60;
};
