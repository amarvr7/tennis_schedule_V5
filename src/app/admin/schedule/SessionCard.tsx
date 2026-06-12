"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, UserGroupIcon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import type { AssignmentRole, Conflict, SessionType } from "@/lib/conflicts";
import type { GridCoach, GridSession } from "@/lib/schedule/model";

export type AssignedCoach = {
  assignmentId: string;
  coach: GridCoach | undefined;
  role: AssignmentRole | null;
  /** Substitute fill (non-roster coach) — rendered amber (CURSOR_ANSWERS Q1). */
  sub: boolean;
};

type SessionCardProps = {
  session: GridSession;
  assigned: AssignedCoach[];
  /** Required leads + assistants for the group (Q1 staffing requirement). */
  requiredCount: number;
  blockingConflicts: number;
  /** The session was modified after publish this week (Q6 visibility). */
  isChanged: boolean;
  isSelected: boolean;
  onSelect: () => void;
};

/** Left-accent color per program type so the grid is scannable at a glance. */
const TYPE_ACCENT: Record<SessionType, string> = {
  competitive: "border-l-rose-400",
  developmental: "border-l-sky-400",
  foundational: "border-l-emerald-400",
  camp: "border-l-amber-400",
  adults: "border-l-violet-400",
  legacy: "border-l-violet-400",
  pro: "border-l-fuchsia-400",
  bt: "border-l-orange-400",
  travel: "border-l-cyan-400",
  saturday: "border-l-teal-400",
};

const initialsFor = (coach: GridCoach | undefined): string =>
  coach?.initials?.trim() ||
  coach?.fullName
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 3)
    .toUpperCase() ||
  "?";

export const SessionCard = ({
  session,
  assigned,
  requiredCount,
  blockingConflicts,
  isChanged,
  isSelected,
  onSelect,
}: SessionCardProps) => {
  const accent = session.type ? TYPE_ACCENT[session.type] : "border-l-muted-foreground/40";
  const hasConflict = blockingConflicts > 0;
  const fullyStaffed = assigned.length >= requiredCount;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Assign coaches to ${session.programName}, ${session.courtLabel}`}
      aria-pressed={isSelected}
      className={cn(
        "group/cell relative flex w-full flex-col gap-1.5 rounded-md border border-l-4 bg-card p-2 text-left outline-none transition-all",
        "hover:-translate-y-px hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring/40",
        accent,
        isSelected ? "ring-2 ring-primary/50" : "ring-1 ring-foreground/10",
        hasConflict && "bg-destructive/5",
      )}
    >
      {hasConflict ? (
        <span
          className="absolute -right-1.5 -top-1.5 inline-flex items-center gap-0.5 rounded-full bg-destructive px-1.5 py-0.5 text-[0.625rem] font-semibold text-white shadow-sm"
          aria-label={`${blockingConflicts} active ${blockingConflicts === 1 ? "conflict" : "conflicts"}`}
        >
          <HugeiconsIcon icon={Alert02Icon} size={10} strokeWidth={2.5} aria-hidden="true" />
          {blockingConflicts}
        </span>
      ) : null}

      <span className="flex items-start justify-between gap-1">
        <span className="text-xs font-semibold leading-tight text-foreground">
          {session.programName}
        </span>
        {isChanged ? (
          <span
            className="inline-flex shrink-0 items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-wide text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
            aria-label="This session was changed after publish"
          >
            Changed
          </span>
        ) : null}
      </span>

      <span className="flex items-center justify-between gap-1">
        <span className="text-[0.625rem] font-medium text-muted-foreground">
          {session.courtLabel}
          {session.type === "adults" && session.headcount !== null ? (
            <span aria-label={`${session.headcount} adults enrolled`}>
              {" "}
              · {session.headcount} adults
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "text-[0.625rem] font-semibold",
            fullyStaffed ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
          )}
          aria-label={`${assigned.length} of ${requiredCount} coaches assigned`}
        >
          {assigned.length}/{requiredCount}
        </span>
      </span>

      {assigned.length > 0 ? (
        <span className="flex flex-wrap gap-1">
          {assigned.map(({ assignmentId, coach, sub }) => (
            <span
              key={assignmentId}
              className={cn(
                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold",
                sub
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                  : "bg-foreground/5 text-foreground",
              )}
              title={sub ? `${coach?.fullName ?? "Coach"} (substitute)` : coach?.fullName}
            >
              {initialsFor(coach)}
              {sub ? <span aria-hidden="true">*</span> : null}
            </span>
          ))}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[0.625rem] text-muted-foreground/70">
          <HugeiconsIcon icon={UserGroupIcon} size={11} strokeWidth={2} aria-hidden="true" />
          Unassigned
        </span>
      )}
    </button>
  );
};

/** Re-exported so callers can pull the conflict shape alongside the card. */
export type { Conflict };
