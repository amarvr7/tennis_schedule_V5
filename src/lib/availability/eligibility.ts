/**
 * Which coaches receive availability requests for a given target week.
 */

import { SUMMER_2025 } from "@/lib/reports/types";
import type { CoachContact } from "./types";

const weekLastDay = (weekStartDate: string): string => {
  const end = new Date(`${weekStartDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return end.toISOString().slice(0, 10);
};

/** True when a summer-only coach should be included for this week. */
export const isCoachEligibleForWeek = (
  coach: Pick<CoachContact, "season" | "is_active">,
  weekStartDate: string,
): boolean => {
  if (!coach.is_active) return false;
  if (coach.season !== "summer_only") return true;

  const lastDay = weekLastDay(weekStartDate);
  return weekStartDate <= SUMMER_2025.endDate && lastDay >= SUMMER_2025.startDate;
};
