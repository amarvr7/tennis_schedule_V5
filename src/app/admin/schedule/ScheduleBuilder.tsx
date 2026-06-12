"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AiMagicIcon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
  CheckmarkBadge02Icon,
  ChartHistogramIcon,
  SentIcon,
} from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AvailabilityRecord } from "@/lib/conflicts";
import type { GridAssignment, GridCoach, GridSession } from "@/lib/schedule/model";
import type { ScheduleWeek } from "@/lib/schedule/load";
import {
  buildRosterByProgram,
  buildRequirementByProgram,
  type GroupRequirement,
  type RosterMember,
  type RosterRole,
} from "@/lib/schedule/roster";
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
import {
  assignCoach,
  createWeekFromTemplate,
  generateDraft,
  publishWeek,
  unassignCoach,
  updateCampHeadcount,
  updateSessionHeadcount,
  type GenerationSummary,
} from "./actions";
import { AssignmentPanel } from "./AssignmentPanel";
import { GenerationReport } from "./GenerationReport";
import { SessionCard, type AssignedCoach } from "./SessionCard";

type ScheduleBuilderProps = {
  weekStartDate: string;
  scheduleWeek: ScheduleWeek | null;
  templateSlotCount: number;
  sessions: GridSession[];
  coaches: GridCoach[];
  initialAssignments: GridAssignment[];
  availability: AvailabilityRecord[];
  rosterMembers: RosterMember[];
  requirements: GroupRequirement[];
  /** Configured adults staffing ratio (1 coach per N adults). */
  adultsPerCoach: number;
  changedSessionIds: string[];
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
  scheduleWeek,
  templateSlotCount,
  sessions,
  coaches,
  initialAssignments,
  availability,
  rosterMembers,
  requirements,
  adultsPerCoach,
  changedSessionIds,
  loadError,
}: ScheduleBuilderProps) => {
  const router = useRouter();
  const [assignments, setAssignments] = useState<GridAssignment[]>(initialAssignments);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);
  const [generationSummary, setGenerationSummary] = useState<GenerationSummary | null>(null);
  const [campHeadcountInput, setCampHeadcountInput] = useState<string>(
    scheduleWeek?.campHeadcount?.toString() ?? "",
  );
  const [isPending, startTransition] = useTransition();

  // Re-sync with canonical server data after each router.refresh().
  useEffect(() => {
    setAssignments(initialAssignments);
  }, [initialAssignments]);

  useEffect(() => {
    setCampHeadcountInput(scheduleWeek?.campHeadcount?.toString() ?? "");
  }, [scheduleWeek?.campHeadcount]);

  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  );
  const coachesById = useMemo(
    () => new Map(coaches.map((coach) => [coach.id, coach])),
    [coaches],
  );
  const timeSlots = useMemo(() => buildTimeSlots(sessions), [sessions]);

  const rosterByProgram = useMemo(() => buildRosterByProgram(rosterMembers), [rosterMembers]);
  const requirementByProgram = useMemo(
    () => buildRequirementByProgram(requirements),
    [requirements],
  );
  const changedSessions = useMemo(() => new Set(changedSessionIds), [changedSessionIds]);

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
  const isLiveWeek =
    scheduleWeek?.status === "published" ||
    activeAssignments.some((assignment) => assignment.isPublished);

  const selectedSession = selectedSessionId ? sessionsById.get(selectedSessionId) ?? null : null;

  const assignedForSelected: AssignedCoach[] = useMemo(() => {
    if (!selectedSession) return [];
    return (assignmentsBySession.get(selectedSession.id) ?? []).map((assignment) => ({
      assignmentId: assignment.id,
      coach: coachesById.get(assignment.coachId),
      role: assignment.role,
      sub: assignment.sub,
    }));
  }, [selectedSession, assignmentsBySession, coachesById]);

  const selectedConflicts = selectedSession
    ? conflictsBySession.get(selectedSession.id) ?? []
    : [];

  const handleAssign = (coachId: string, role: RosterRole, sub: boolean) => {
    if (!selectedSession) return;
    setActionError(null);
    setPublishNotice(null);

    const optimistic: GridAssignment = {
      id: `optimistic:${coachId}:${selectedSession.id}`,
      sessionId: selectedSession.id,
      coachId,
      role,
      status: "active",
      isPublished: isLiveWeek,
      weekStartDate,
      sub,
      subbingForCoachId: null,
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
        role,
        sub,
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

  const handleGenerate = () => {
    setActionError(null);
    setPublishNotice(null);
    setGenerationSummary(null);
    startTransition(async () => {
      const result = await generateDraft(weekStartDate);
      if (!result.ok && result.error) {
        setActionError(result.error);
      } else if (result.summary) {
        setGenerationSummary(result.summary);
      }
      router.refresh();
    });
  };

  const handlePublish = () => {
    setActionError(null);
    setPublishNotice(null);
    setGenerationSummary(null);
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

  const handleCreateWeek = () => {
    setActionError(null);
    startTransition(async () => {
      const result = await createWeekFromTemplate(weekStartDate);
      if (!result.ok && result.error) setActionError(result.error);
      router.refresh();
    });
  };

  const handleSaveCampHeadcount = () => {
    setActionError(null);
    const trimmed = campHeadcountInput.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      setActionError("Camp head count must be a non-negative number.");
      return;
    }
    startTransition(async () => {
      const result = await updateCampHeadcount(weekStartDate, parsed);
      if (!result.ok && result.error) setActionError(result.error);
      router.refresh();
    });
  };

  const handleSaveSessionHeadcount = (sessionId: string, headcount: number | null) => {
    setActionError(null);
    startTransition(async () => {
      const result = await updateSessionHeadcount(sessionId, headcount);
      if (!result.ok && result.error) setActionError(result.error);
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

          <Button asChild variant="outline" size="lg">
            <Link href={`/admin/schedule/coverage?week=${weekStartDate}`}>
              <HugeiconsIcon icon={ChartHistogramIcon} strokeWidth={2} aria-hidden="true" />
              Coverage
            </Link>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleGenerate}
            disabled={isPending || sessions.length === 0}
            aria-label="Generate a draft schedule for this week from the season rosters"
          >
            <HugeiconsIcon icon={AiMagicIcon} strokeWidth={2} aria-hidden="true" />
            {isPending ? "Generating…" : "Generate draft"}
          </Button>

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

      {scheduleWeek === null ? (
        <section className="flex flex-col items-start justify-between gap-3 rounded-lg bg-primary/5 p-4 ring-1 ring-primary/20 sm:flex-row sm:items-center">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 text-primary">
              <HugeiconsIcon icon={Calendar03Icon} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                This week hasn&rsquo;t been created yet
              </p>
              <p className="text-xs text-muted-foreground">
                {templateSlotCount > 0
                  ? `Clone the master week template (${templateSlotCount} slots) into this week. You can then edit this week's copy without touching the master.`
                  : "The master week template is empty — add slots in Week Template first."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={handleCreateWeek}
            disabled={isPending || templateSlotCount === 0}
          >
            {isPending ? "Creating…" : "Create week from template"}
          </Button>
        </section>
      ) : (
        <section className="flex flex-wrap items-center gap-2 rounded-lg bg-card p-3 ring-1 ring-foreground/10">
          <label
            htmlFor="camp-headcount"
            className="text-xs font-medium text-muted-foreground"
          >
            Camp head count this week
          </label>
          <input
            id="camp-headcount"
            type="number"
            min={0}
            inputMode="numeric"
            value={campHeadcountInput}
            onChange={(event) => setCampHeadcountInput(event.target.value)}
            placeholder="—"
            className="h-8 w-24 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSaveCampHeadcount}
            disabled={isPending}
          >
            Save
          </Button>
          <span className="text-[0.6875rem] text-muted-foreground">
            Used for the camp overflow warning on the coverage report.
          </span>
        </section>
      )}

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
        <p role="status" className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          {publishNotice}
        </p>
      ) : null}
      {generationSummary ? (
        <GenerationReport
          summary={generationSummary}
          onDismiss={() => setGenerationSummary(null)}
        />
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-card p-1 ring-1 ring-foreground/10">
          {timeSlots.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No sessions are configured for this week.
              {scheduleWeek === null
                ? " Create the week from the master template to get started."
                : " Add slots to the master template, or edit this week's sessions."}
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
                              role: assignment.role,
                              sub: assignment.sub,
                            }));
                            const requirement = session.programId
                              ? requirementByProgram.get(session.programId)
                              : undefined;
                            const requiredCount = requirement
                              ? requirement.requiredLeadCount + requirement.requiredAssistantCount
                              : 1;

                            return (
                              <SessionCard
                                key={session.id}
                                session={session}
                                assigned={assigned}
                                requiredCount={requiredCount}
                                blockingConflicts={blockingCount}
                                isChanged={changedSessions.has(session.id)}
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
              roster={
                selectedSession?.programId
                  ? rosterByProgram.get(selectedSession.programId) ?? null
                  : null
              }
              requirement={
                selectedSession?.programId
                  ? requirementByProgram.get(selectedSession.programId) ?? null
                  : null
              }
              adultsPerCoach={adultsPerCoach}
              pending={isPending}
              onAssign={handleAssign}
              onUnassign={handleUnassign}
              onSaveHeadcount={handleSaveSessionHeadcount}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
