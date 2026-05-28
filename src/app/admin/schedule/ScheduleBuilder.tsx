"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  CheckmarkBadge02Icon,
  SentIcon,
} from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AvailabilityRecord } from "@/lib/conflicts";
import type { GridAssignment, GridCoach, GridSession } from "@/lib/schedule/model";
import {
  WEEKDAYS,
  buildTimeSlots,
  currentWeekStart,
  dateForDay,
  formatWeekRange,
  sessionsForCell,
  shiftWeek,
} from "@/lib/schedule/grid";
import {
  buildActiveContexts,
  computeSessionConflicts,
  isBlocking,
} from "@/lib/schedule/conflicts";
import { assignCoach, publishWeek, unassignCoach } from "./actions";
import { AssignmentPanel } from "./AssignmentPanel";
import { SessionCard, type AssignedCoach } from "./SessionCard";

type ScheduleBuilderProps = {
  weekStartDate: string;
  sessions: GridSession[];
  coaches: GridCoach[];
  initialAssignments: GridAssignment[];
  availability: AvailabilityRecord[];
  loadError: string | null;
};

type PublishState = "empty" | "draft" | "edited" | "published";

const PUBLISH_BADGE: Record<PublishState, { label: string; variant: "secondary" | "outline" | "default" }> = {
  empty: { label: "Empty", variant: "secondary" },
  draft: { label: "Draft", variant: "outline" },
  edited: { label: "Unpublished changes", variant: "outline" },
  published: { label: "Published", variant: "default" },
};

export const ScheduleBuilder = ({
  weekStartDate,
  sessions,
  coaches,
  initialAssignments,
  availability,
  loadError,
}: ScheduleBuilderProps) => {
  const router = useRouter();
  const [assignments, setAssignments] = useState<GridAssignment[]>(initialAssignments);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Re-sync with canonical server data after each router.refresh().
  useEffect(() => {
    setAssignments(initialAssignments);
  }, [initialAssignments]);

  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  );
  const coachesById = useMemo(
    () => new Map(coaches.map((coach) => [coach.id, coach])),
    [coaches],
  );
  const timeSlots = useMemo(() => buildTimeSlots(sessions), [sessions]);

  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.status === "active"),
    [assignments],
  );

  const assignmentsBySession = useMemo(() => {
    const map = new Map<string, GridAssignment[]>();
    for (const assignment of activeAssignments) {
      const list = map.get(assignment.sessionId) ?? [];
      list.push(assignment);
      map.set(assignment.sessionId, list);
    }
    return map;
  }, [activeAssignments]);

  // The core requirement: every change recomputes checkAllConflicts immediately.
  const conflictsBySession = useMemo(
    () => computeSessionConflicts(assignments, { sessionsById, coachesById, availability }),
    [assignments, sessionsById, coachesById, availability],
  );

  const activeContexts = useMemo(
    () => buildActiveContexts(assignments, sessionsById),
    [assignments, sessionsById],
  );

  const totalBlockingConflicts = useMemo(() => {
    let total = 0;
    for (const conflicts of conflictsBySession.values()) {
      total += conflicts.filter(isBlocking).length;
    }
    return total;
  }, [conflictsBySession]);

  const publishState: PublishState = useMemo(() => {
    if (activeAssignments.length === 0) return "empty";
    const publishedCount = activeAssignments.filter((a) => a.isPublished).length;
    if (publishedCount === 0) return "draft";
    if (publishedCount === activeAssignments.length) return "published";
    return "edited";
  }, [activeAssignments]);

  const hasUnpublished = activeAssignments.some((assignment) => !assignment.isPublished);

  const selectedSession = selectedSessionId ? sessionsById.get(selectedSessionId) ?? null : null;

  const assignedForSelected: AssignedCoach[] = useMemo(() => {
    if (!selectedSession) return [];
    return (assignmentsBySession.get(selectedSession.id) ?? []).map((assignment) => ({
      assignmentId: assignment.id,
      coach: coachesById.get(assignment.coachId),
    }));
  }, [selectedSession, assignmentsBySession, coachesById]);

  const selectedConflicts = selectedSession
    ? conflictsBySession.get(selectedSession.id) ?? []
    : [];

  const handleAssign = (coachId: string) => {
    if (!selectedSession) return;
    setActionError(null);
    setPublishNotice(null);

    const optimistic: GridAssignment = {
      id: `optimistic:${coachId}:${selectedSession.id}`,
      sessionId: selectedSession.id,
      coachId,
      role: "lead",
      status: "active",
      isPublished: false,
      weekStartDate,
    };
    setAssignments((previous) => [
      ...previous.filter(
        (a) => !(a.coachId === coachId && a.sessionId === optimistic.sessionId),
      ),
      optimistic,
    ]);

    startTransition(async () => {
      const result = await assignCoach({
        sessionId: optimistic.sessionId,
        coachId,
        weekStartDate,
        role: "lead",
      });
      if (!result.ok && result.error) setActionError(result.error);
      router.refresh();
    });
  };

  const handleUnassign = (assignmentId: string) => {
    setActionError(null);
    setPublishNotice(null);
    setAssignments((previous) =>
      previous.map((assignment) =>
        assignment.id === assignmentId ? { ...assignment, status: "archived" } : assignment,
      ),
    );

    startTransition(async () => {
      const result = await unassignCoach(assignmentId);
      if (!result.ok && result.error) setActionError(result.error);
      router.refresh();
    });
  };

  const handlePublish = () => {
    setActionError(null);
    setPublishNotice(null);
    startTransition(async () => {
      const result = await publishWeek(weekStartDate);
      if (!result.ok && result.error) {
        setActionError(result.error);
      } else {
        setPublishNotice(
          result.notified === 0
            ? "Nothing to publish for this week."
            : `Published and notified ${result.notified} ${result.notified === 1 ? "coach" : "coaches"}.`,
        );
      }
      router.refresh();
    });
  };

  const badge = PUBLISH_BADGE[publishState];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">Schedule Builder</h1>
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {totalBlockingConflicts > 0 ? (
              <Badge variant="destructive">
                {totalBlockingConflicts} {totalBlockingConflicts === 1 ? "conflict" : "conflicts"}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">{formatWeekRange(weekStartDate)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md ring-1 ring-foreground/10">
            <Button asChild variant="ghost" size="icon-sm" aria-label="Previous week">
              <Link href={`/admin/schedule?week=${shiftWeek(weekStartDate, -1)}`} scroll={false}>
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/admin/schedule?week=${currentWeekStart()}`} scroll={false}>
                This week
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon-sm" aria-label="Next week">
              <Link href={`/admin/schedule?week=${shiftWeek(weekStartDate, 1)}`} scroll={false}>
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <Button
            type="button"
            size="lg"
            onClick={handlePublish}
            disabled={isPending || !hasUnpublished}
            aria-label="Publish week and notify assigned coaches"
          >
            <HugeiconsIcon
              icon={publishState === "published" ? CheckmarkBadge02Icon : SentIcon}
              strokeWidth={2}
              aria-hidden="true"
            />
            {publishState === "published" ? "Published" : "Publish week"}
          </Button>
        </div>
      </header>

      {loadError ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          Could not load the schedule: {loadError}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}
      {publishNotice ? (
        <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          {publishNotice}
        </p>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-card p-1 ring-1 ring-foreground/10">
          {timeSlots.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No sessions are configured. Add sessions to build the weekly schedule.
            </p>
          ) : (
            <div className="min-w-[860px]">
              <div className="grid grid-cols-[88px_repeat(6,minmax(0,1fr))] gap-1">
                <div className="sticky left-0 z-10 bg-card" aria-hidden="true" />
                {WEEKDAYS.map((day) => (
                  <div
                    key={day.key}
                    className="flex flex-col items-center gap-0.5 rounded-md bg-muted/40 px-2 py-1.5 text-center"
                  >
                    <span className="text-xs font-semibold text-foreground">{day.short}</span>
                    <span className="text-[0.625rem] text-muted-foreground">
                      {dateForDay(weekStartDate, day.key).slice(5)}
                    </span>
                  </div>
                ))}

                {timeSlots.map((slot) => (
                  <div key={slot.key} className="contents">
                    <div className="sticky left-0 z-10 flex items-start justify-end bg-card pr-1 pt-1">
                      <span className="text-right text-[0.625rem] font-medium leading-tight text-muted-foreground">
                        {slot.label}
                      </span>
                    </div>
                    {WEEKDAYS.map((day) => {
                      const cellSessions = sessionsForCell(sessions, day.key, slot);
                      return (
                        <div
                          key={`${slot.key}-${day.key}`}
                          className={cn(
                            "flex min-h-16 flex-col gap-1 rounded-md p-1",
                            cellSessions.length === 0 && "bg-muted/20",
                          )}
                        >
                          {cellSessions.map((session) => {
                            const conflicts = conflictsBySession.get(session.id) ?? [];
                            const blockingCount = conflicts.filter(isBlocking).length;
                            const assigned: AssignedCoach[] = (
                              assignmentsBySession.get(session.id) ?? []
                            ).map((assignment) => ({
                              assignmentId: assignment.id,
                              coach: coachesById.get(assignment.coachId),
                            }));

                            return (
                              <SessionCard
                                key={session.id}
                                session={session}
                                assigned={assigned}
                                blockingConflicts={blockingCount}
                                isSelected={session.id === selectedSessionId}
                                onSelect={() => setSelectedSessionId(session.id)}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="w-full lg:sticky lg:top-4 lg:w-80 lg:shrink-0 lg:self-start">
          <div className="h-[32rem] lg:h-[calc(100vh-8rem)]">
            <AssignmentPanel
              session={selectedSession}
              coaches={coaches}
              assigned={assignedForSelected}
              activeContexts={activeContexts}
              availability={availability}
              weekStartDate={weekStartDate}
              sessionConflicts={selectedConflicts}
              pending={isPending}
              onAssign={handleAssign}
              onUnassign={handleUnassign}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
