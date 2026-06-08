/**
 * Consecutive travel week tracking — powers the Max Travel rule.
 *
 * A week counts as a "travel week" when the coach has a published tournament
 * assignment overlapping it, a `traveling` availability row, or an active weekly
 * assignment to a travel session.
 */

import type { AvailabilityRecord, DayOfWeek } from "@/lib/conflicts";
import type { Tournament, TournamentAssignment } from "./types";

const DAY_INDEX: Record<DayOfWeek, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

const INDEX_TO_DAY: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** Monday (UTC) of the week containing `dateStr` (YYYY-MM-DD). */
export const mondayOfWeek = (dateStr: string): string => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dow = date.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

/** Previous Monday from a week-start Monday string. */
export const previousWeekMonday = (weekStartDate: string): string => {
  const [year, month, day] = weekStartDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
};

/** Enumerate every calendar date in [start, end] inclusive. */
export const datesInRange = (startDate: string, endDate: string): string[] => {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  const dates: string[] = [];
  for (let ms = start; ms <= end; ms += 86_400_000) {
    dates.push(new Date(ms).toISOString().slice(0, 10));
  }
  return dates;
};

const dayOfWeekFromDate = (dateStr: string): DayOfWeek => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return INDEX_TO_DAY[dow === 0 ? 6 : dow - 1];
};

/** Week starts where a published tournament assignment overlaps the event dates. */
export const travelWeeksFromTournamentAssignments = (
  assignments: TournamentAssignment[],
  tournamentsById: Map<string, Tournament>,
): Set<string> => {
  const weeks = new Set<string>();
  for (const assignment of assignments) {
    if (assignment.status !== "published") continue;
    const tournament = tournamentsById.get(assignment.tournamentId);
    if (!tournament?.startDate || !tournament.endDate) continue;
    for (const date of datesInRange(tournament.startDate, tournament.endDate)) {
      weeks.add(mondayOfWeek(date));
    }
  }
  return weeks;
};

/** Week starts where availability marks the coach as traveling. */
export const travelWeeksFromAvailability = (
  availability: AvailabilityRecord[],
  coachId: string,
): Set<string> => {
  const weeks = new Set<string>();
  for (const record of availability) {
    if (record.coachId !== coachId) continue;
    if (record.status !== "traveling") continue;
    weeks.add(record.weekStartDate);
  }
  return weeks;
};

/** Week starts where coach has an active weekly assignment to a travel session. */
export const travelWeeksFromWeeklyTravelSessions = (
  entries: ReadonlyArray<{ coachId: string; weekStartDate: string; sessionType: string | null }>,
  coachId: string,
): Set<string> => {
  const weeks = new Set<string>();
  for (const entry of entries) {
    if (entry.coachId !== coachId) continue;
    if (entry.sessionType !== "travel") continue;
    weeks.add(entry.weekStartDate);
  }
  return weeks;
};

/**
 * Merge all travel-week signals for one coach into a single set of week-start
 * Mondays (YYYY-MM-DD).
 */
export const buildTravelWeekStarts = (
  coachId: string,
  options: {
    tournamentAssignments?: TournamentAssignment[];
    tournamentsById?: Map<string, Tournament>;
    availability?: AvailabilityRecord[];
    weeklyTravelSessions?: ReadonlyArray<{
      coachId: string;
      weekStartDate: string;
      sessionType: string | null;
    }>;
  },
): Set<string> => {
  const merged = new Set<string>();

  if (options.tournamentAssignments && options.tournamentsById) {
    const coachAssignments = options.tournamentAssignments.filter(
      (a) => a.coachId === coachId,
    );
    for (const week of travelWeeksFromTournamentAssignments(
      coachAssignments,
      options.tournamentsById,
    )) {
      merged.add(week);
    }
  }

  if (options.availability) {
    for (const week of travelWeeksFromAvailability(options.availability, coachId)) {
      merged.add(week);
    }
  }

  if (options.weeklyTravelSessions) {
    for (const week of travelWeeksFromWeeklyTravelSessions(
      options.weeklyTravelSessions,
      coachId,
    )) {
      merged.add(week);
    }
  }

  return merged;
};

/**
 * Count consecutive travel weeks immediately before `weekStartDate`.
 * Used by Max Travel: when this returns 3, the next travel assignment is blocked.
 */
export const consecutiveTravelWeeksBefore = (
  weekStartDate: string,
  travelWeekStarts: ReadonlySet<string>,
): number => {
  let count = 0;
  let cursor = previousWeekMonday(weekStartDate);
  while (travelWeekStarts.has(cursor)) {
    count += 1;
    cursor = previousWeekMonday(cursor);
  }
  return count;
};

/** Build per-coach travel week sets from all available signals. */
export const buildAllTravelWeekStartsByCoach = (
  coachIds: string[],
  options: {
    tournamentAssignments?: TournamentAssignment[];
    tournamentsById?: Map<string, Tournament>;
    availability?: AvailabilityRecord[];
    weeklyTravelSessions?: ReadonlyArray<{
      coachId: string;
      weekStartDate: string;
      sessionType: string | null;
    }>;
  },
): Map<string, Set<string>> => {
  const result = new Map<string, Set<string>>();
  for (const coachId of coachIds) {
    result.set(
      coachId,
      buildTravelWeekStarts(coachId, options),
    );
  }
  return result;
};

/** Map coachId → consecutive travel weeks before a target week. */
export const consecutiveTravelWeeksByCoach = (
  coachIds: string[],
  weekStartDate: string,
  travelWeekStartsByCoach: Map<string, Set<string>>,
): Map<string, number> => {
  const result = new Map<string, number>();
  for (const coachId of coachIds) {
    const weeks = travelWeekStartsByCoach.get(coachId) ?? new Set();
    result.set(coachId, consecutiveTravelWeeksBefore(weekStartDate, weeks));
  }
  return result;
};

/** Expand tournament dates into per-day availability slots for sync. */
export const tournamentToAvailabilitySlots = (
  tournament: Tournament,
  coachIds: string[],
): Array<{ coachId: string; weekStartDate: string; dayOfWeek: DayOfWeek }> => {
  if (!tournament.startDate || !tournament.endDate) return [];

  const slots: Array<{ coachId: string; weekStartDate: string; dayOfWeek: DayOfWeek }> = [];
  for (const date of datesInRange(tournament.startDate, tournament.endDate)) {
    const weekStartDate = mondayOfWeek(date);
    const dayOfWeek = dayOfWeekFromDate(date);
    for (const coachId of coachIds) {
      slots.push({ coachId, weekStartDate, dayOfWeek });
    }
  }
  return slots;
};
