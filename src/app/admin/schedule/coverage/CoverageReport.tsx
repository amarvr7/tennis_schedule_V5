"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  ArrowLeft01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  ChartHistogramIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AvailabilityRecord } from "@/lib/conflicts";
import type { GridAssignment, GridCoach, GridSession } from "@/lib/schedule/model";
import type { GroupRequirement, RosterMember } from "@/lib/schedule/roster";
import { buildRosterByProgram, buildRequirementByProgram } from "@/lib/schedule/roster";
import type { SeasonSettings } from "@/lib/schedule/season";
import {
  buildWeekStaffing,
  type StaffingDeficit,
} from "@/lib/schedule/staffing";
import { rankSubSuggestions, type SubHistoryEntry } from "@/lib/schedule/suggest";
import { buildActiveContexts } from "@/lib/schedule/conflicts";
import { WEEKDAYS, formatTime, formatWeekRange } from "@/lib/schedule/grid";
import type { ChangeLogRow } from "@/lib/schedule/changeLog";
import { assignCoach } from "../actions";

type CoverageReportProps = {
  weekStartDate: string;
  campHeadcount: number | null;
  sessions: GridSession[];
  durations: Array<[string, number]>;
  coaches: GridCoach[];
  assignments: GridAssignment[];
  availability: AvailabilityRecord[];
  rosterMembers: RosterMember[];
  requirements: GroupRequirement[];
  settings: SeasonSettings;
  subHistory: SubHistoryEntry[];
  changeLog: ChangeLogRow[];
  loadError: string | null;
};

const dayShort = (day: StaffingDeficit["dayOfWeek"]): string =>
  WEEKDAYS.find((weekday) => weekday.key === day)?.short ?? day;

const minutesToHours = (minutes: number): string =>
  `${Math.round((minutes / 60) * 10) / 10}h`;

const SEVERITY_LABEL: Record<StaffingDeficit["severity"], string> = {
  needs_fill: "Needs fill",
  fyi: "FYI",
  setup_gap: "Setup gap",
};

export const CoverageReport = ({
  weekStartDate,
  campHeadcount,
  sessions,
  durations,
  coaches,
  assignments,
  availability,
  rosterMembers,
  requirements,
  settings,
  subHistory,
  changeLog,
  loadError,
}: CoverageReportProps) => {
  const router = useRouter();
  const [findFor, setFindFor] = useState<StaffingDeficit | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  );
  const coachNameById = useMemo(
    () => new Map(coaches.map((coach) => [coach.id, coach.fullName])),
    [coaches],
  );
  const durationBySession = useMemo(() => new Map(durations), [durations]);

  const rosterByProgram = useMemo(() => buildRosterByProgram(rosterMembers), [rosterMembers]);
  const requirementByProgram = useMemo(
    () => buildRequirementByProgram(requirements),
    [requirements],
  );

  const staffing = useMemo(
    () =>
      buildWeekStaffing({
        weekStartDate,
        sessions,
        coaches,
        assignments,
        availability,
        rosterByProgram,
        requirementByProgram,
        campHeadcount,
        settings,
      }),
    [
      weekStartDate,
      sessions,
      coaches,
      assignments,
      availability,
      rosterByProgram,
      requirementByProgram,
      campHeadcount,
      settings,
    ],
  );

  const activeContexts = useMemo(
    () => buildActiveContexts(assignments, sessionsById),
    [assignments, sessionsById],
  );

  const suggestions = useMemo(() => {
    if (!findFor) return [];
    const session = sessionsById.get(findFor.sessionId);
    if (!session) return [];

    return rankSubSuggestions({
      session,
      role: findFor.role,
      weekStartDate,
      coaches,
      weekSessions: sessions,
      assignments,
      activeContexts,
      availability,
      rosterMembers,
      subHistory,
      durationBySession,
      excludeCoachIds: findFor.coachId ? [findFor.coachId] : [],
    });
  }, [
    findFor,
    sessionsById,
    weekStartDate,
    coaches,
    sessions,
    assignments,
    activeContexts,
    availability,
    rosterMembers,
    subHistory,
    durationBySession,
  ]);

  const handlePickSub = (coachId: string) => {
    if (!findFor) return;
    setActionError(null);
    setNotice(null);

    const deficit = findFor;
    startTransition(async () => {
      const result = await assignCoach({
        sessionId: deficit.sessionId,
        coachId,
        weekStartDate,
        role: deficit.role,
        sub: true,
        subbingForCoachId: deficit.coachId,
      });
      if (!result.ok && result.error) {
        setActionError(result.error);
      } else {
        setNotice(
          `${coachNameById.get(coachId) ?? "Coach"} assigned as substitute ${deficit.role} for ${deficit.programName}.`,
        );
        setFindFor(null);
      }
      router.refresh();
    });
  };

  const needsFill = staffing.deficits.filter((deficit) => deficit.severity === "needs_fill");
  const fyi = staffing.deficits.filter((deficit) => deficit.severity === "fyi");
  const setupGaps = staffing.deficits.filter((deficit) => deficit.severity === "setup_gap");

  const renderDeficit = (deficit: StaffingDeficit, index: number) => (
    <li
      key={`${deficit.sessionId}-${deficit.role}-${deficit.coachId ?? index}`}
      className={cn(
        "flex flex-col gap-2 rounded-md p-3 ring-1 sm:flex-row sm:items-center sm:justify-between",
        deficit.severity === "needs_fill"
          ? "bg-destructive/5 ring-destructive/20"
          : "bg-card ring-foreground/10",
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-foreground">
          {deficit.programName}
          <span className="font-normal capitalize text-muted-foreground">· {deficit.role}</span>
          <span className="font-normal text-muted-foreground">
            · {dayShort(deficit.dayOfWeek)} {formatTime(deficit.startTime)}–
            {formatTime(deficit.endTime)} · {deficit.courtLabel}
          </span>
        </span>
        <span className="text-[0.6875rem] leading-snug text-muted-foreground">
          {deficit.reason}
        </span>
      </div>
      <Button
        type="button"
        variant={deficit.severity === "needs_fill" ? "default" : "outline"}
        size="sm"
        onClick={() => {
          setActionError(null);
          setNotice(null);
          setFindFor(deficit);
        }}
        disabled={isPending}
        aria-label={`Find a substitute ${deficit.role} for ${deficit.programName}`}
      >
        Find coach
      </Button>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={ChartHistogramIcon} className="text-primary" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-foreground">Coverage</h1>
          </div>
          <p className="text-sm text-muted-foreground">{formatWeekRange(weekStartDate)}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/admin/schedule?week=${weekStartDate}`}>
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} aria-hidden="true" />
            Back to builder
          </Link>
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={needsFill.length > 0 ? "destructive" : "secondary"}>
          {needsFill.length} needs fill
        </Badge>
        <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
          {fyi.length} FYI
        </Badge>
        <Badge variant="secondary">
          {staffing.totals.sessionsUsingSubs} {staffing.totals.sessionsUsingSubs === 1 ? "session" : "sessions"} using subs
        </Badge>
        {setupGaps.length > 0 ? (
          <Badge variant="outline">{setupGaps.length} setup gaps</Badge>
        ) : null}
      </div>

      {staffing.campWarning ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300"
        >
          <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} aria-hidden="true" />
          {staffing.campWarning}
        </p>
      ) : null}

      {staffing.adultsWarnings.length > 0 ? (
        <section
          className="flex flex-col gap-1.5 rounded-md bg-amber-500/10 p-3"
          aria-label="Adults staffing warnings"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
            <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} aria-hidden="true" />
            Adults sessions may need more coaches ({staffing.adultsWarnings.length})
          </span>
          <ul className="flex flex-col gap-1 pl-6">
            {staffing.adultsWarnings.map((warning) => (
              <li
                key={warning.sessionId}
                className="text-xs text-amber-700 dark:text-amber-300"
              >
                {dayShort(warning.dayOfWeek)} {formatTime(warning.startTime)}–
                {formatTime(warning.endTime)}: {warning.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {loadError ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          Could not load coverage data: {loadError}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </p>
      ) : null}

      {findFor ? (
        <section
          className="flex flex-col gap-3 rounded-lg bg-card p-4 ring-2 ring-primary/40"
          aria-label="Substitute suggestions"
        >
          <header className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-sm font-semibold text-foreground">
                Find coach — {findFor.programName}{" "}
                <span className="font-normal capitalize text-muted-foreground">
                  ({findFor.role}, {dayShort(findFor.dayOfWeek)}{" "}
                  {formatTime(findFor.startTime)}–{formatTime(findFor.endTime)})
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Ranked by rotation: the coach who has subbed least often / least recently
                this season comes first. Tiebreak: lowest assigned hours this week.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFindFor(null)}
              aria-label="Close suggestions"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={2} aria-hidden="true" />
            </button>
          </header>

          {suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No coach qualifies for this slot — every candidate is blocked by a rule,
              already booked, or with their own group in this block.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {suggestions.map((suggestion, index) => (
                <li
                  key={suggestion.coachId}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="text-xs font-semibold text-muted-foreground">
                      #{index + 1}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-xs font-medium text-foreground">
                        {suggestion.coachName}
                      </span>
                      <span className="text-[0.625rem] text-muted-foreground">
                        {suggestion.subCountSeason}{" "}
                        {suggestion.subCountSeason === 1 ? "sub" : "subs"} this season
                        {suggestion.lastSubDate ? ` · last ${suggestion.lastSubDate}` : " · never subbed"}
                        {" · "}
                        {minutesToHours(suggestion.weekMinutes)} this week
                      </span>
                      {suggestion.warnings.length > 0 ? (
                        <span className="text-[0.625rem] text-amber-600 dark:text-amber-400">
                          {suggestion.warnings[0].message}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handlePickSub(suggestion.coachId)}
                    disabled={isPending}
                    aria-label={`Assign ${suggestion.coachName} as substitute`}
                  >
                    Assign
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {needsFill.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">Needs fill ({needsFill.length})</h2>
          <ul className="flex flex-col gap-1.5">{needsFill.map(renderDeficit)}</ul>
        </section>
      ) : null}

      {fyi.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            FYI — running short by design ({fyi.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Single-day absences default to no substitute: the group runs one coach short.
            You can still open Find coach if you want one.
          </p>
          <ul className="flex flex-col gap-1.5">{fyi.map(renderDeficit)}</ul>
        </section>
      ) : null}

      {setupGaps.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Season Setup gaps ({setupGaps.length})
          </h2>
          <ul className="flex flex-col gap-1.5">{setupGaps.map(renderDeficit)}</ul>
        </section>
      ) : null}

      {staffing.deficits.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-10 text-center">
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            size={28}
            className="text-emerald-500"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-foreground">Fully staffed</p>
          <p className="text-xs text-muted-foreground">
            Every group has its lead and required assistants for the week.
          </p>
        </div>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <HugeiconsIcon icon={UserGroupIcon} size={15} aria-hidden="true" />
          Sessions ({staffing.sessions.length})
        </h2>
        <div className="overflow-x-auto rounded-lg bg-card ring-1 ring-foreground/10">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[0.625rem] uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-semibold">Session</th>
                <th scope="col" className="px-3 py-2 font-semibold">When</th>
                <th scope="col" className="px-3 py-2 font-semibold">Leads</th>
                <th scope="col" className="px-3 py-2 font-semibold">Assistants</th>
                <th scope="col" className="px-3 py-2 font-semibold">Subs</th>
              </tr>
            </thead>
            <tbody>
              {staffing.sessions.map((row) => {
                const leadsOk = row.assignedLeads >= row.requiredLeads;
                const assistantsOk = row.assignedAssistants >= row.requiredAssistants;
                return (
                  <tr key={row.sessionId} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 font-medium text-foreground">{row.programName}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {dayShort(row.dayOfWeek)} {formatTime(row.startTime)}–{formatTime(row.endTime)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 font-semibold",
                        leadsOk ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
                      )}
                    >
                      {row.assignedLeads}/{row.requiredLeads}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 font-semibold",
                        assistantsOk
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {row.assignedAssistants}/{row.requiredAssistants}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.subCount || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {changeLog.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Changes this week ({changeLog.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Every change to the published schedule is recorded — the original plan is never
            overwritten, so this week can always be compared as published vs as it actually ran.
          </p>
          <ul className="flex flex-col gap-1.5">
            {changeLog.map((entry) => {
              const session = entry.sessionId ? sessionsById.get(entry.sessionId) : undefined;
              return (
                <li
                  key={entry.id}
                  className="flex flex-col gap-0.5 rounded-md bg-card p-3 ring-1 ring-foreground/10"
                >
                  <span className="text-xs font-medium text-foreground">
                    <span className="capitalize">{entry.action ?? "change"}</span>
                    {entry.coachId ? ` — ${coachNameById.get(entry.coachId) ?? "Coach"}` : ""}
                    {session ? ` · ${session.programName}` : ""}
                  </span>
                  <span className="text-[0.6875rem] text-muted-foreground">
                    {new Date(entry.changedAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {entry.changedBy ? ` · by ${coachNameById.get(entry.changedBy) ?? "admin"}` : ""}
                    {entry.reason ? ` · reason: ${entry.reason}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
};
