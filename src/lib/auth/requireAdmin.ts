import { redirect } from "next/navigation";

import { getCurrentCoach, type CurrentCoach } from "./getCurrentCoach";
import { getCoachView } from "./roles";

/**
 * Guard for admin-only Server Components. Redirects unauthenticated users to
 * /login and read-only coaches to /schedule, otherwise returns the coach.
 * Middleware already gates /admin; this is defense in depth at the page level.
 */
export const requireAdminCoach = async (): Promise<CurrentCoach> => {
  const coach = await getCurrentCoach();

  if (!coach) redirect("/login");
  if (getCoachView(coach) !== "admin") redirect("/schedule");

  return coach;
};
