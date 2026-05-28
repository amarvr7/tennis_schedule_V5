"use client";

import { useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  Calendar03Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Location01Icon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import type { AssignmentContext, AvailabilityRecord, Conflict } from "@/lib/conflicts";
import type { GridCoach, GridSession } from "@/lib/schedule/model";
import { evaluateCandidate, partitionConflicts } from "@/lib/schedule/conflicts";
import { WEEKDAYS, dateForDay, formatTime } from "@/lib/schedule/grid";
import type { AssignedCoach } from "./SessionCard";

type AssignmentPanelProps = {
  session: GridSession | null;
  coaches: GridCoach[];
  assigned: AssignedCoach[];
  activeContexts: AssignmentContext[];
  availability: AvailabilityRecord[];
  weekStartDate: string;
  sessionConflicts: Conflict[];
  pending: boolean;
  onAssign: (coachId: string) => void;
  onUnassign: (assignmentId: string) => void;
};

type Candidate = {
  coach: GridCoach;
  blocking: Conflict[];
  warnings: Conflict[];
};

const CAMPUS_LABEL: Record<GridSession["campus"], string> = {
  main: "Main campus",
  west: "West Campus",
  legacy: "Legacy",
};

const initialsFor = (coach: GridCoach): string =>
  coach.initials?.trim() ||
  coach.fullName
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 3)
    .toUpperCase();

const EmptyState = () => (
  <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
    <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <HugeiconsIcon icon={Calendar03Icon} size={18} strokeWidth={2} aria-hidden="true" />
    </span>
    <p className="text-sm font-medium text-foreground">No session selected</p>
    <p className="text-xs text-muted-foreground">
      Select a session in the grid to assign coaches and check for conflicts.
    </p>
  </div>
);

export const AssignmentPanel = ({
  session,
  coaches,
  assigned,
  activeContexts,
  availability,
  weekStartDate,
  sessionConflicts,
  pending,
  onAssign,
  onUnassign,
}: AssignmentPanelProps) => {
  const assignedCoachIds = useMemo(
    () => new Set(assigned.map(({ coach }) => coach?.id).filter(Boolean) as string[]),
    [assigned],
  );

  const { available, blocked } = useMemo(() => {
    if (!session) return { available: [] as Candidate[], blocked: [] as Candidate[] };

    const candidates: Candidate[] = coaches
      .filter((coach) => coach.isActive && !assignedCoachIds.has(coach.id))
      .map((coach) => {
        const conflicts = evaluateCandidate(
          coach,
          session,
          weekStartDate,
          activeContexts,
          availability,
        );
        return { coach, ...partitionConflicts(conflicts) };
      });

    const byName = (a: Candidate, b: Candidate) =>
      a.coach.fullName.localeCompare(b.coach.fullName);

    return {
      available: candidates.filter((candidate) => candidate.blocking.length === 0).sort(byName),
      blocked: candidates.filter((candidate) => candidate.blocking.length > 0).sort(byName),
    };
  }, [session, coaches, assignedCoachIds, weekStartDate, activeContexts, availability]);

  if (!session) {
    return (
      <aside className="flex h-full flex-col rounded-lg bg-card ring-1 ring-foreground/10">
        <EmptyState />
      </aside>
    );
  }

  const dayLabel = WEEKDAYS.find((day) => day.key === session.dayOfWeek)?.label ?? session.dayOfWeek;
  const blockingSessionConflicts = sessionConflicts.filter(
    (conflict) => conflict.severity !== "soft",
  );

  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
      <header className="flex flex-col gap-2 border-b border-border p-4">
        <h2 className="text-sm font-semibold text-foreground">{session.programName}</h2>
        <dl className="flex flex-col gap-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <HugeiconsIcon icon={Calendar03Icon} size={13} strokeWidth={2} aria-hidden="true" />
            <span>
              {dayLabel}, {dateForDay(weekStartDate, session.dayOfWeek)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <HugeiconsIcon icon={Clock01Icon} size={13} strokeWidth={2} aria-hidden="true" />
            <span>
              {formatTime(session.startTime)} – {formatTime(session.endTime)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <HugeiconsIcon icon={Location01Icon} size={13} strokeWidth={2} aria-hidden="true" />
            <span>
              {session.courtLabel} · {CAMPUS_LABEL[session.campus]}
            </span>
          </div>
        </dl>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {blockingSessionConflicts.length > 0 ? (
          <section
            className="flex flex-col gap-1.5 rounded-md bg-destructive/10 p-3"
            aria-label="Active conflicts"
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
              <HugeiconsIcon icon={Alert02Icon} size={13} strokeWidth={2.5} aria-hidden="true" />
              {blockingSessionConflicts.length} active{" "}
              {blockingSessionConflicts.length === 1 ? "conflict" : "conflicts"}
            </span>
            <ul className="flex flex-col gap-1">
              {blockingSessionConflicts.map((conflict, index) => (
                <li key={`${conflict.type}-${index}`} className="text-[0.6875rem] text-destructive/90">
                  {conflict.message}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Assigned ({assigned.length})
          </h3>
          {assigned.length === 0 ? (
            <p className="text-xs text-muted-foreground">No coaches assigned yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {assigned.map(({ assignmentId, coach }) => (
                <li
                  key={assignmentId}
                  className="flex items-center justify-between gap-2 rounded-md bg-foreground/5 px-2 py-1.5"
                >
                  <span className="flex items-center gap-2">
                    <span className="inline-flex size-6 items-center justify-center rounded-full bg-foreground text-[0.625rem] font-semibold text-background">
                      {coach ? initialsFor(coach) : "?"}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-xs font-medium text-foreground">
                        {coach?.fullName ?? "Unknown coach"}
                      </span>
                      {coach?.title ? (
                        <span className="text-[0.625rem] text-muted-foreground">{coach.title}</span>
                      ) : null}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onUnassign(assignmentId)}
                    disabled={pending}
                    aria-label={`Remove ${coach?.fullName ?? "coach"} from ${session.programName}`}
                    className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Available ({available.length})
          </h3>
          {available.length === 0 ? (
            <p className="text-xs text-muted-foreground">No coaches are free for this slot.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {available.map(({ coach, warnings }) => (
                <li key={coach.id}>
                  <button
                    type="button"
                    onClick={() => onAssign(coach.id)}
                    disabled={pending}
                    aria-label={`Assign ${coach.fullName} to ${session.programName}`}
                    className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-left outline-none transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2">
                      <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-100 text-[0.625rem] font-semibold text-emerald-700">
                        {initialsFor(coach)}
                      </span>
                      <span className="flex flex-col">
                        <span className="text-xs font-medium text-foreground">{coach.fullName}</span>
                        {warnings.length > 0 ? (
                          <span className="text-[0.625rem] text-amber-600">{warnings[0].message}</span>
                        ) : coach.title ? (
                          <span className="text-[0.625rem] text-muted-foreground">{coach.title}</span>
                        ) : null}
                      </span>
                    </span>
                    <HugeiconsIcon
                      icon={CheckmarkCircle02Icon}
                      size={15}
                      strokeWidth={2}
                      className="text-emerald-500"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {blocked.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Unavailable ({blocked.length})
            </h3>
            <ul className="flex flex-col gap-1.5">
              {blocked.map(({ coach, blocking }) => (
                <li
                  key={coach.id}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-md border border-dashed border-border px-2 py-1.5",
                    "cursor-not-allowed opacity-60",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-[0.625rem] font-semibold text-muted-foreground">
                      {initialsFor(coach)}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground line-through">
                      {coach.fullName}
                    </span>
                  </span>
                  <span className="pl-8 text-[0.625rem] leading-snug text-destructive/80">
                    {blocking.map((conflict) => conflict.message).join(" ")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </aside>
  );
};
