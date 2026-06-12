/**
 * Role logic — admin access is derived solely from the `is_admin` flag.
 *
 * `title` is display- and booking-window-only data; it is NEVER consulted for
 * admin access. Full edit (admin view) is granted exactly when
 * coaches.is_admin = true; everyone else gets the read-only view.
 *
 * Kept as a framework-free pure module so it can be reused by middleware,
 * server components, and tests without pulling in Supabase or Next.
 */

export type CoachView = "admin" | "readonly";

export type CoachRole = {
  title: string | null;
  is_admin: boolean | null;
};

export const getCoachView = ({ is_admin }: CoachRole): CoachView =>
  is_admin ? "admin" : "readonly";

/**
 * Camp Director (CURSOR_ANSWERS.md): read-only visibility of ALL camp
 * sessions, the camp weekly schedule, and camp-touching changes. Title-driven
 * visibility only — NEVER admin access (admin remains is_admin-only).
 */
export const CAMP_DIRECTOR_TITLE = "Camp Director";

export const isCampDirector = ({ title }: CoachRole): boolean =>
  title === CAMP_DIRECTOR_TITLE;

/** Landing route for each view, used for post-login redirects. */
export const VIEW_HOME: Record<CoachView, string> = {
  admin: "/admin/schedule",
  readonly: "/schedule",
};

export const getHomePathForCoach = (coach: CoachRole): string =>
  VIEW_HOME[getCoachView(coach)];
