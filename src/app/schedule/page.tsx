import Link from "next/link";
import { redirect } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AirplaneTakeOff01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
  Clock01Icon,
  Download04Icon,
  Location04Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";

import { signOut } from "@/app/login/actions";
import { getCurrentCoach } from "@/lib/auth/getCurrentCoach";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SessionType } from "@/lib/conflicts";
import {
  currentWeekStart,
  dateForDay,
  formatWeekRange,
  normalizeWeekStart,
  shiftWeek,
} from "@/lib/schedule/grid";
import {
  buildMyWeek,
  countSessions,
  formatGroup,
  isTravelingThisWeek,
  type MySession,
} from "@/lib/schedule/myWeek";
import { loadMyAssignments, loadMyAvailability } from "./queries";
import { ImBackButton } from "./ImBackButton";

export const metadata = {
  title: "My Schedule",
};

type SearchParams = { week?: string };

/** Badge tint per program type so the week is scannable at a glance. */
const GROUP_TINT: Record<SessionType, string> = {
  competitive: "bg-rose-50 text-rose-700",
  developmental: "bg-sky-50 text-sky-700",
  foundational: "bg-emerald-50 text-emerald-700",
  camp: "bg-amber-50 text-amber-700",
  adults: "bg-violet-50 text-violet-700",
  legacy: "bg-violet-50 text-violet-700",
  pro: "bg-fuchsia-50 text-fuchsia-700",
  bt: "bg-orange-50 text-orange-700",
  travel: "bg-cyan-50 text-cyan-700",
  saturday: "bg-teal-50 text-teal-700",
};

const dayDateLabel = (weekStartDate: string, dayKey: MySession["dayOfWeek"]): string =>
  new Date(`${dateForDay(weekStartDate, dayKey)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const SessionRow = ({ session }: { session: MySession }) => {
  const tint = session.group ? GROUP_TINT[session.group as SessionType] : null;

  return (
    <li className="flex flex-col gap-1.5 rounded-md bg-card p-3 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight text-foreground">
          {session.sessionName}
        </p>
        <Badge className={cn("shrink-0", tint ?? "bg-muted text-muted-foreground")}>
          <HugeiconsIcon icon={UserGroupIcon} aria-hidden="true" />
          {formatGroup(session.group)}
        </Badge>
      </div>

      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <dd className="inline-flex items-center gap-1">
          <HugeiconsIcon icon={Clock01Icon} size={13} aria-hidden="true" />
          {session.timeLabel}
        </dd>
        <dd className="inline-flex items-center gap-1">
          <HugeiconsIcon icon={Location04Icon} size={13} aria-hidden="true" />
          {session.courts}
        </dd>
        {session.role ? (
          <dd className="inline-flex items-center gap-1 capitalize">{session.role}</dd>
        ) : null}
      </dl>
    </li>
  );
};

const SchedulePage = async ({ searchParams }: { searchParams: SearchParams }) => {
  const coach = await getCurrentCoach();
  if (!coach) redirect("/login");

  const supabase = createClient();
  const weekStartDate = normalizeWeekStart(searchParams.week);

  const [{ rows, error }, availability] = await Promise.all([
    loadMyAssignments(supabase, weekStartDate),
    loadMyAvailability(supabase, weekStartDate),
  ]);

  const week = buildMyWeek(rows);
  const total = countSessions(week);
  const traveling = isTravelingThisWeek(availability, coach.id, weekStartDate);

  const prevWeek = shiftWeek(weekStartDate, -1);
  const nextWeek = shiftWeek(weekStartDate, 1);
  const thisWeek = currentWeekStart();
  const isThisWeek = weekStartDate === thisWeek;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 p-6 sm:p-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-heading text-xl font-semibold tracking-tight">My Schedule</h1>
          <p className="text-sm text-muted-foreground">
            {coach.full_name} · {coach.title ?? "Coach"}
          </p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            aria-label="Sign out"
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Sign out
          </button>
        </form>
      </header>

      {traveling ? (
        <section className="flex flex-col items-start justify-between gap-3 rounded-lg bg-cyan-50 p-4 ring-1 ring-cyan-200 sm:flex-row sm:items-center">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 text-cyan-600">
              <HugeiconsIcon icon={AirplaneTakeOff01Icon} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-cyan-900">You&rsquo;re marked as traveling</p>
              <p className="text-xs text-cyan-800">
                Local assignments are blocked this week. Press &ldquo;I&rsquo;m Back&rdquo; when you
                return to clear your travel block and notify admin.
              </p>
            </div>
          </div>
          <ImBackButton weekStartDate={weekStartDate} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3 rounded-lg bg-card p-3 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <Link
            href={`/schedule?week=${prevWeek}`}
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
            {isThisWeek ? (
              <Badge variant="secondary" className="bg-primary/10 text-primary">
                This week
              </Badge>
            ) : (
              <Link href={`/schedule?week=${thisWeek}`} className="text-xs font-medium text-primary hover:underline">
                Today
              </Link>
            )}
          </div>
          <Link
            href={`/schedule?week=${nextWeek}`}
            aria-label="Next week"
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} size={16} aria-hidden="true" />
          </Link>
        </div>

        <a
          href={`/schedule/ical?week=${weekStartDate}`}
          download
          aria-label="Download this week as a calendar file"
          className={cn(
            "inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/80",
            total === 0 && "pointer-events-none opacity-50",
          )}
          aria-disabled={total === 0}
        >
          <HugeiconsIcon icon={Download04Icon} size={15} aria-hidden="true" />
          Add to calendar
        </a>
      </section>

      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          Could not load your schedule: {error}
        </p>
      ) : null}

      {!error && total === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-10 text-center">
          <HugeiconsIcon icon={Calendar03Icon} size={28} className="text-muted-foreground/60" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">No published sessions this week</p>
          <p className="text-xs text-muted-foreground">
            Your week hasn&rsquo;t been published yet, or you have no assignments.
          </p>
        </div>
      ) : null}

      {!error && total > 0 ? (
        <div className="flex flex-col gap-4">
          {week
            .filter((day) => day.sessions.length > 0)
            .map((day) => (
              <section key={day.key} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold text-foreground">{day.label}</h2>
                  <span className="text-xs text-muted-foreground">
                    {dayDateLabel(weekStartDate, day.key)}
                  </span>
                </div>
                <ul className="flex flex-col gap-2">
                  {day.sessions.map((session) => (
                    <SessionRow key={session.assignmentId} session={session} />
                  ))}
                </ul>
              </section>
            ))}
        </div>
      ) : null}
    </main>
  );
};

export default SchedulePage;
