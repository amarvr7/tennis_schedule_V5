"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiMagicIcon,
  Alert02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { WEEKDAYS, formatTime } from "@/lib/schedule/grid";
import type { GenerationSummary } from "./actions";

type GenerationReportProps = {
  summary: GenerationSummary;
  onDismiss: () => void;
};

const dayLabel = (day: GenerationSummary["gaps"][number]["dayOfWeek"]): string =>
  WEEKDAYS.find((weekday) => weekday.key === day)?.short ?? day;

/**
 * The roster-first draft report — surfaced after generation for the admin's
 * review before publishing. Shows how many roster slots were placed and lists
 * every slot that could not be filled (and the rostered coach it traces to).
 */
export const GenerationReport = ({ summary, onDismiss }: GenerationReportProps) => {
  const fullyStaffed = summary.gapCount === 0;

  return (
    <section
      aria-label="Generated draft report"
      className="flex flex-col gap-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 text-primary">
            <HugeiconsIcon icon={AiMagicIcon} strokeWidth={2} aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold text-foreground">Draft generated</p>
            <p className="text-xs text-muted-foreground">
              Placed {summary.staffedCount} of {summary.openSlotCount} roster{" "}
              {summary.openSlotCount === 1 ? "slot" : "slots"}. Review below, then publish
              to approve. Unfilled slots can be covered via Find coach on the coverage
              report.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss draft report"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {fullyStaffed ? (
          <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={13} aria-hidden="true" />
            Every roster slot placed
          </Badge>
        ) : (
          <Badge variant="destructive">
            {summary.gapCount} {summary.gapCount === 1 ? "gap" : "gaps"}
          </Badge>
        )}
        {summary.warningCount > 0 ? (
          <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            {summary.warningCount} {summary.warningCount === 1 ? "warning" : "warnings"}
          </Badge>
        ) : null}
      </div>

      {summary.gaps.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {summary.gaps.map((gap, index) => (
            <li
              key={`${gap.sessionId}-${gap.role}-${gap.coachId ?? index}`}
              className="flex flex-col gap-0.5 rounded-md bg-destructive/5 p-2.5"
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <HugeiconsIcon
                  icon={Alert02Icon}
                  size={12}
                  strokeWidth={2.5}
                  className="text-destructive"
                  aria-hidden="true"
                />
                {gap.programName}
                <span className="font-normal capitalize text-muted-foreground">· {gap.role}</span>
                <span className="font-normal text-muted-foreground">
                  · {dayLabel(gap.dayOfWeek)} {formatTime(gap.startTime)}–{formatTime(gap.endTime)}{" "}
                  · {gap.courtLabel}
                </span>
              </span>
              <span className="pl-[1.125rem] text-[0.6875rem] leading-snug text-destructive/90">
                {gap.coachName ? `${gap.coachName}: ` : ""}
                {gap.reason}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};
