import Link from "next/link";
import { redirect } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
  Clock01Icon,
  Location04Icon,
  TentIcon,
} from "@hugeicons/core-free-icons";

import { signOut } from "@/app/login/actions";
import { AscenderHomeLink } from "@/components/brand/AscenderHomeLink";
import { TennisWordmark } from "@/components/brand/TennisWordmark";
import { getCurrentCoach } from "@/lib/auth/getCurrentCoach";
import { isCampDirector } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  WEEKDAYS,
  currentWeekStart,
  dateForDay,
  formatTime,
  formatWeekRange,
  normalizeWeekStart,
  shiftWeek,
} from "@/lib/schedule/grid";
import { loadScheduleWeek, loadWeekSessionRows } from "@/lib/schedule/load";
import { loadWeekChangeLog } from "@/lib/schedule/changeLog";
import { normalizeTime } from "@/lib/coaches/rules";

export const metadata = {
  title: "Camp Schedule · IMG Academy Tennis",
};

type SearchParams = { week?: string };

/**
 * Camp Director view (CURSOR_ANSWERS.md): read-only weekly schedule of ALL
 * camp sessions plus every schedule change that touches camp. Not an admin —
 * no editing of schedules, rosters, or rules. RLS enforces the same scope at
 * the data layer (camp-director policies on weekly_assignments + change log).
 */
const CampSchedulePage = async ({ searchParams }: { searchParams: SearchParams }) => {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/login");
  if (!isCampDirector(coach) && !coach.is_admin) redirect("/schedule");

  const supabase = createClient();
  const weekStartDate = normalizeWeekStart(searchParams.week);

  const scheduleWeek = await loadScheduleWeek(supabase, weekStartDate);

  const [sessionsRes, assignmentsRes, changeLog] = await Promise.all([
    loadWeekSessionRows(supabase, weekStartDate, scheduleWeek !== null),
    supabase
      .from("weekly_assignments")
      .select("id, session_id, coach_id, role, status, is_published, sub")
      .eq("week_start_date", weekStartDate)
      .eq("status", "active")
      .eq("is_published", true),
    loadWeekChangeLog(supabase, weekStartDate),
  ]);

  const campSessions = sessionsRes.rows.filter(
    (row) => row.programs?.type === "camp",
  );
  const campSessionIds = new Set(campSessions.map((row) => row.id));

  const assignments = (assignmentsRes.data ?? []).filter((row) =>
    campSessionIds.has(row.session_id as string),
  );
  const campChanges = changeLog.filter(
    (entry) => entry.sessionId !== null && campSessionIds.has(entry.sessionId),
  );

  // Coach display names: the camp director cannot read other coaches' rows
  // under RLS, so resolve names server-side after the role guard above.
  const coachIds = [
    ...new Set([
      ...assignments.map((row) => row.coach_id as string),
      ...campChanges.map((entry) => entry.coachId).filter((id): id is string => id !== null),
    ]),
  ];
  const nameById = new Map<string, string>();
  if (coachIds.length > 0) {
    const service = createServiceClient();
    const { data: names } = await service
      .from("coaches")
      .select("id, full_name")
      .in("id", coachIds);
    for (const row of names ?? []) {
      nameById.set(row.id as string, row.full_name as string);
    }
  }

  const assignmentsBySession = new Map<string, Array<{ name: string; role: string | null; sub: boolean }>>();
  for (const row of assignments) {
    const list = assignmentsBySession.get(row.session_id as string) ?? [];
    list.push({
      name: nameById.get(row.coach_id as string) ?? "Coach",
      role: (row.role as string | null) ?? null,
      sub: Boolean(row.sub),
    });
    assignmentsBySession.set(row.session_id as string, list);
  }

  const changedSessionIds = new Set(campChanges.map((entry) => entry.sessionId));

  const prevWeek = shiftWeek(weekStartDate, -1);
  const nextWeek = shiftWeek(weekStartDate, 1);
  const thisWeek = currentWeekStart();

  const days = WEEKDAYS.map((day) => ({
    ...day,
    sessions: campSessions
      .filter((row) => row.day_of_week === day.key)
      .sort((a, b) => a.start_time.localeCompare(b.start_time)),
  })).filter((day) => day.sessions.length > 0);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 p-6 sm:p-8">
      <header className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <AscenderHomeLink />
          <form action={signOut}>
            <button
              type="submit"
              aria-label="Sign out"
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              Sign out
            </button>
          </form>
        </div>

        <div className="flex flex-col gap-3">
          <TennisWordmark linked />
          <div className="flex flex-col gap-0.5">
            <h1 className="font-heading text-xl font-semibold tracking-tight">Camp Schedule</h1>
            <p className="text-sm text-muted-foreground">
              {coach.full_name} · Read-only view of all camp sessions
            </p>
          </div>
        </div>
      </header>

      <section className="flex flex-col gap-3 rounded-lg bg-card p-3 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <Link
            href={`/camp?week=${prevWeek}`}
            aria-label="Previous week"
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} aria-hidden="true" />
          </Link>
          <div className="flex items-center gap-2 px-1">
            <HugeiconsIcon icon={Calendar03Icon} size={15} className="text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-semibold text-foreground">
              {formatWeekRange(weekStartDate)}
            </span>
            {weekStartDate === thisWeek ? (
              <Badge variant="secondary" className="bg-primary/10 text-primary">
                This week
              </Badge>
            ) : (
              <Link href={`/camp?week=${thisWeek}`} className="text-xs font-medium text-primary hover:underline">
                Today
              </Link>
            )}
          </div>
          <Link
            href={`/camp?week=${nextWeek}`}
            aria-label="Next week"
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} size={16} aria-hidden="true" />
          </Link>
        </div>
        {scheduleWeek?.campHeadcount != null ? (
          <Badge variant="secondary">
            <HugeiconsIcon icon={TentIcon} aria-hidden="true" />
            {scheduleWeek.campHeadcount} campers this week
          </Badge>
        ) : null}
      </section>

      {days.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-10 text-center">
          <HugeiconsIcon icon={TentIcon} size={28} className="text-muted-foreground/60" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">No camp sessions this week</p>
          <p className="text-xs text-muted-foreground">
            The week hasn&rsquo;t been created or published yet, or camp isn&rsquo;t running.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {days.map((day) => (
            <section key={day.key} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-semibold text-foreground">{day.label}</h2>
                <span className="text-xs text-muted-foreground">
                  {dateForDay(weekStartDate, day.key).slice(5)}
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {day.sessions.map((session) => {
                  const staff = assignmentsBySession.get(session.id) ?? [];
                  const startTime = normalizeTime(session.start_time) ?? session.start_time;
                  const endTime = normalizeTime(session.end_time) ?? session.end_time;
                  return (
                    <li
                      key={session.id}
                      className="flex flex-col gap-1.5 rounded-md bg-card p-3 ring-1 ring-foreground/10"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-tight text-foreground">
                          {session.programs?.name ?? "Camp"}
                        </p>
                        {changedSessionIds.has(session.id) ? (
                          <Badge className="bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                            Changed
                          </Badge>
                        ) : null}
                      </div>
                      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <dd className="inline-flex items-center gap-1">
                          <HugeiconsIcon icon={Clock01Icon} size={13} aria-hidden="true" />
                          {formatTime(startTime)} – {formatTime(endTime)}
                        </dd>
                        <dd className="inline-flex items-center gap-1">
                          <HugeiconsIcon icon={Location04Icon} size={13} aria-hidden="true" />
                          {session.court_numbers ?? session.court_zone ?? "—"}
                        </dd>
                      </dl>
                      {staff.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {staff.map((member, index) => (
                            <span
                              key={`${session.id}-${index}`}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-medium",
                                member.sub
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                  : "bg-foreground/5 text-foreground",
                              )}
                            >
                              {member.name}
                              {member.role ? <span className="capitalize">· {member.role}</span> : null}
                              {member.sub ? "· sub" : null}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[0.6875rem] text-muted-foreground">
                          No published staff yet.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {campChanges.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Camp changes this week ({campChanges.length})
          </h2>
          <ul className="flex flex-col gap-1.5">
            {campChanges.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-0.5 rounded-md bg-card p-3 ring-1 ring-foreground/10"
              >
                <span className="text-xs font-medium text-foreground">
                  <span className="capitalize">{entry.action ?? "change"}</span>
                  {entry.coachId ? ` — ${nameById.get(entry.coachId) ?? "Coach"}` : ""}
                </span>
                <span className="text-[0.6875rem] text-muted-foreground">
                  {new Date(entry.changedAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {entry.reason ? ` · reason: ${entry.reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
};

export default CampSchedulePage;
