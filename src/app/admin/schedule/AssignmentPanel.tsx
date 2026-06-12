"use client";

import { useEffect, useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  Calendar03Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Location01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import type { AssignmentContext, AvailabilityRecord, Conflict } from "@/lib/conflicts";
import type { GridCoach, GridSession } from "@/lib/schedule/model";
import type { GroupRequirement, GroupRoster, RosterRole } from "@/lib/schedule/roster";
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
  /** The group's season coach team (CURSOR_ANSWERS Q1) — placed first. */
  roster: GroupRoster | null;
  requirement: GroupRequirement | null;
  /** Configured adults staffing ratio (1 coach per N adults). */
  adultsPerCoach: number;
  pending: boolean;
  onAssign: (coachId: string, role: RosterRole, sub: boolean) => void;
  onUnassign: (assignmentId: string) => void;
  /** Adults enrollment differs per day + AM/PM, so it is saved per session. */
  onSaveHeadcount: (sessionId: string, headcount: number | null) => void;
};

type Candidate = {
  coach: GridCoach;
  blocking: Conflict[];
  warnings: Conflict[];
};

type RosterCandidate = Candidate & { role: RosterRole };

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
  roster,
  requirement,
  adultsPerCoach,
  pending,
  onAssign,
  onUnassign,
  onSaveHeadcount,
}: AssignmentPanelProps) => {
  const [subRole, setSubRole] = useState<RosterRole>("assistant");
  const [headcountInput, setHeadcountInput] = useState<string>("");
  const [headcountError, setHeadcountError] = useState<string | null>(null);

  useEffect(() => {
    setHeadcountInput(session?.headcount?.toString() ?? "");
    setHeadcountError(null);
  }, [session?.id, session?.headcount]);

  const handleSaveHeadcount = () => {
    if (!session) return;
    setHeadcountError(null);
    const trimmed = headcountInput.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 0)) {
      setHeadcountError("Enter a whole number of adults (or leave blank).");
      return;
    }
    onSaveHeadcount(session.id, parsed);
  };

  const assignedCoachIds = useMemo(
    () => new Set(assigned.map(({ coach }) => coach?.id).filter(Boolean) as string[]),
    [assigned],
  );

  const coachesById = useMemo(
    () => new Map(coaches.map((coach) => [coach.id, coach])),
    [coaches],
  );

  const rosterCoachIds = useMemo(
    () =>
      new Set(
        [...(roster?.leads ?? []), ...(roster?.assistants ?? [])].map(
          (member) => member.coachId,
        ),
      ),
    [roster],
  );

  const evaluate = (coach: GridCoach, role: RosterRole): Candidate => {
    const conflicts = evaluateCandidate(
      coach,
      session!,
      weekStartDate,
      activeContexts,
      availability,
      role,
    );
    return { coach, ...partitionConflicts(conflicts) };
  };

  // The group's roster, evaluated against the rules — these come first (Q1).
  const rosterCandidates: RosterCandidate[] = useMemo(() => {
    if (!session || !roster) return [];

    const members: Array<{ coachId: string; role: RosterRole }> = [
      ...roster.leads.map((member) => ({ coachId: member.coachId, role: "lead" as const })),
      ...roster.assistants.map((member) => ({
        coachId: member.coachId,
        role: "assistant" as const,
      })),
    ];

    return members
      .filter((member) => !assignedCoachIds.has(member.coachId))
      .map((member) => {
        const coach = coachesById.get(member.coachId);
        if (!coach || !coach.isActive) return null;
        return { ...evaluate(coach, member.role), role: member.role };
      })
      .filter((candidate): candidate is RosterCandidate => candidate !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, roster, assignedCoachIds, coachesById, weekStartDate, activeContexts, availability]);

  // Everyone else is a SUBSTITUTE (recorded as sub = true, Q1/Q4).
  const { available, blocked } = useMemo(() => {
    if (!session) return { available: [] as Candidate[], blocked: [] as Candidate[] };

    const candidates: Candidate[] = coaches
      .filter(
        (coach) =>
          coach.isActive && !assignedCoachIds.has(coach.id) && !rosterCoachIds.has(coach.id),
      )
      .map((coach) => evaluate(coach, subRole));

    const byName = (a: Candidate, b: Candidate) =>
      a.coach.fullName.localeCompare(b.coach.fullName);

    return {
      available: candidates.filter((candidate) => candidate.blocking.length === 0).sort(byName),
      blocked: candidates.filter((candidate) => candidate.blocking.length > 0).sort(byName),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    session,
    coaches,
    assignedCoachIds,
    rosterCoachIds,
    subRole,
    weekStartDate,
    activeContexts,
    availability,
  ]);

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
        {requirement ? (
          <p className="text-[0.6875rem] text-muted-foreground">
            Needs {requirement.requiredLeadCount}{" "}
            {requirement.requiredLeadCount === 1 ? "lead" : "leads"}
            {requirement.requiredAssistantCount > 0
              ? ` · ${requirement.requiredAssistantCount} ${
                  requirement.requiredAssistantCount === 1 ? "assistant" : "assistants"
                }`
              : ""}
          </p>
        ) : null}
        {session.type === "adults" ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <label
                htmlFor="session-headcount"
                className="flex items-center gap-1 text-[0.6875rem] font-medium text-muted-foreground"
              >
                <HugeiconsIcon icon={UserGroupIcon} size={12} strokeWidth={2} aria-hidden="true" />
                Adults this session
              </label>
              <input
                id="session-headcount"
                type="number"
                min={0}
                inputMode="numeric"
                value={headcountInput}
                onChange={(event) => setHeadcountInput(event.target.value)}
                placeholder="—"
                className="h-7 w-16 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
              <button
                type="button"
                onClick={handleSaveHeadcount}
                disabled={pending}
                aria-label={`Save adults head count for ${session.programName}`}
                className="rounded-md border border-border px-2 py-1 text-[0.6875rem] font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
              >
                Save
              </button>
            </div>
            {headcountError ? (
              <p role="alert" className="text-[0.625rem] text-destructive">
                {headcountError}
              </p>
            ) : (
              <p className="text-[0.625rem] text-muted-foreground">
                Numbers differ per day and AM/PM — coverage warns at 1 coach per{" "}
                {adultsPerCoach} adults.
              </p>
            )}
          </div>
        ) : null}
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
              {assigned.map(({ assignmentId, coach, role, sub }) => (
                <li
                  key={assignmentId}
                  className="flex items-center justify-between gap-2 rounded-md bg-foreground/5 px-2 py-1.5"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-full text-[0.625rem] font-semibold",
                        sub
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                          : "bg-foreground text-background",
                      )}
                    >
                      {coach ? initialsFor(coach) : "?"}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-xs font-medium text-foreground">
                        {coach?.fullName ?? "Unknown coach"}
                      </span>
                      <span className="text-[0.625rem] capitalize text-muted-foreground">
                        {role ?? "—"}
                        {sub ? " · substitute" : ""}
                      </span>
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
            Group roster ({rosterCandidates.length})
          </h3>
          {rosterCandidates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {roster ? "Every rostered coach is already assigned." : "No season roster for this group yet — set one in Season Setup."}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {rosterCandidates.map(({ coach, role, blocking, warnings }) =>
                blocking.length === 0 ? (
                  <li key={coach.id}>
                    <button
                      type="button"
                      onClick={() => onAssign(coach.id, role, false)}
                      disabled={pending}
                      aria-label={`Assign ${coach.fullName} as ${role} to ${session.programName}`}
                      className="flex w-full items-center justify-between gap-2 rounded-md border border-primary/30 px-2 py-1.5 text-left outline-none transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2">
                        <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary/10 text-[0.625rem] font-semibold text-primary">
                          {initialsFor(coach)}
                        </span>
                        <span className="flex flex-col">
                          <span className="text-xs font-medium text-foreground">{coach.fullName}</span>
                          <span className="text-[0.625rem] capitalize text-muted-foreground">
                            {role}
                            {warnings.length > 0 ? (
                              <span className="text-amber-600 dark:text-amber-400">
                                {" "}
                                · {warnings[0].message}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </span>
                      <HugeiconsIcon
                        icon={CheckmarkCircle02Icon}
                        size={15}
                        strokeWidth={2}
                        className="text-primary"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                ) : (
                  <li
                    key={coach.id}
                    className="flex flex-col gap-0.5 rounded-md border border-dashed border-border px-2 py-1.5 opacity-70"
                  >
                    <span className="flex items-center gap-2">
                      <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-[0.625rem] font-semibold text-muted-foreground">
                        {initialsFor(coach)}
                      </span>
                      <span className="flex flex-col">
                        <span className="text-xs font-medium text-muted-foreground">
                          {coach.fullName}
                        </span>
                        <span className="text-[0.625rem] capitalize text-muted-foreground">{role}</span>
                      </span>
                    </span>
                    <span className="pl-8 text-[0.625rem] leading-snug text-destructive/80">
                      {blocking.map((conflict) => conflict.message).join(" ")}
                    </span>
                  </li>
                ),
              )}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Substitutes ({available.length})
            </h3>
            <div
              className="inline-flex rounded-md ring-1 ring-foreground/10"
              role="radiogroup"
              aria-label="Role for substitute assignment"
            >
              {(["lead", "assistant"] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  role="radio"
                  aria-checked={subRole === role}
                  onClick={() => setSubRole(role)}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[0.625rem] font-medium capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40",
                    subRole === role
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[0.625rem] text-muted-foreground">
            Non-roster coaches are recorded as substitutes. Prefer the ranked list on the
            coverage report (Find coach) to rotate sub duty fairly.
          </p>
          {available.length === 0 ? (
            <p className="text-xs text-muted-foreground">No coaches are free for this slot.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {available.map(({ coach, warnings }) => (
                <li key={coach.id}>
                  <button
                    type="button"
                    onClick={() => onAssign(coach.id, subRole, true)}
                    disabled={pending}
                    aria-label={`Assign ${coach.fullName} as substitute ${subRole} to ${session.programName}`}
                    className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-left outline-none transition-colors hover:border-amber-400/60 hover:bg-amber-500/5 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2">
                      <span className="inline-flex size-6 items-center justify-center rounded-full bg-amber-100 text-[0.625rem] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        {initialsFor(coach)}
                      </span>
                      <span className="flex flex-col">
                        <span className="text-xs font-medium text-foreground">{coach.fullName}</span>
                        {warnings.length > 0 ? (
                          <span className="text-[0.625rem] text-amber-600 dark:text-amber-400">{warnings[0].message}</span>
                        ) : coach.title ? (
                          <span className="text-[0.625rem] text-muted-foreground">{coach.title}</span>
                        ) : null}
                      </span>
                    </span>
                    <HugeiconsIcon
                      icon={CheckmarkCircle02Icon}
                      size={15}
                      strokeWidth={2}
                      className="text-amber-500 dark:text-amber-400"
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
