"use client";

import { useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  evaluateTournamentCandidates,
  type TournamentCandidateResult,
} from "@/lib/tournaments/assign";
import type { AvailabilityRecord } from "@/lib/conflicts";
import type {
  Tournament,
  TournamentAssignment,
  TournamentAssignmentRole,
  TournamentCoach,
} from "@/lib/tournaments/types";

type TournamentAssignmentPanelProps = {
  tournament: Tournament | null;
  coaches: TournamentCoach[];
  assignments: TournamentAssignment[];
  allAssignments: TournamentAssignment[];
  tournaments: Tournament[];
  availability: AvailabilityRecord[];
  programTypesById: Record<string, string | null>;
  pending: boolean;
  onAssign: (coachId: string, role: TournamentAssignmentRole) => void;
  onClose: () => void;
};

export const TournamentAssignmentPanel = ({
  tournament,
  coaches,
  assignments,
  allAssignments,
  tournaments,
  availability,
  programTypesById,
  pending,
  onAssign,
  onClose,
}: TournamentAssignmentPanelProps) => {
  const tournamentsById = useMemo(
    () => new Map(tournaments.map((t) => [t.id, t])),
    [tournaments],
  );

  const programTypesMap = useMemo(
    () => new Map(Object.entries(programTypesById)),
    [programTypesById],
  );

  const tournamentAssignments = useMemo(
    () =>
      tournament
        ? assignments.filter(
            (a) => a.tournamentId === tournament.id && a.status !== "archived",
          )
        : [],
    [assignments, tournament],
  );

  const assignedCoachIds = useMemo(
    () => new Set(tournamentAssignments.map((a) => a.coachId)),
    [tournamentAssignments],
  );

  const { available, blocked } = useMemo(() => {
    if (!tournament) return { available: [] as TournamentCandidateResult[], blocked: [] as TournamentCandidateResult[] };

    const ranked = evaluateTournamentCandidates({
      tournament,
      coaches,
      role: "lead",
      tournamentAssignments,
      allAssignments,
      tournamentsById,
      availability,
      rotationHistory: allAssignments,
      programTypesById: programTypesMap,
    }).filter((c) => !assignedCoachIds.has(c.coach.id));

    return {
      available: ranked.filter((c) => c.blocking.length === 0),
      blocked: ranked.filter((c) => c.blocking.length > 0),
    };
  }, [
    tournament,
    coaches,
    tournamentAssignments,
    allAssignments,
    tournamentsById,
    availability,
    programTypesMap,
    assignedCoachIds,
  ]);

  if (!tournament) return null;

  return (
    <section
      aria-label="Assign coach to tournament"
      className="flex flex-col gap-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold text-foreground">Assign coach</p>
          <p className="text-xs text-muted-foreground">{tournament.name}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close assignment panel"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </header>

      {available.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          <li className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
            Available
          </li>
          {available.slice(0, 8).map((candidate) => (
            <CandidateRow
              key={candidate.coach.id}
              candidate={candidate}
              pending={pending}
              onAssign={() => onAssign(candidate.coach.id, "lead")}
            />
          ))}
        </ul>
      ) : null}

      {blocked.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          <li className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
            Blocked
          </li>
          {blocked.slice(0, 6).map((candidate) => (
            <CandidateRow
              key={candidate.coach.id}
              candidate={candidate}
              pending={pending}
              blocked
              onAssign={() => onAssign(candidate.coach.id, "lead")}
            />
          ))}
        </ul>
      ) : null}

      {available.length === 0 && blocked.length === 0 ? (
        <p className="text-xs text-muted-foreground">All active coaches are already assigned.</p>
      ) : null}
    </section>
  );
};

const CandidateRow = ({
  candidate,
  pending,
  blocked = false,
  onAssign,
}: {
  candidate: TournamentCandidateResult;
  pending: boolean;
  blocked?: boolean;
  onAssign: () => void;
}) => (
  <li
    className={cn(
      "flex items-start justify-between gap-2 rounded-md p-2.5",
      blocked ? "bg-muted/50" : "bg-emerald-50/50 dark:bg-emerald-950/20",
    )}
  >
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        {blocked ? (
          <HugeiconsIcon icon={Alert02Icon} size={12} className="text-destructive" aria-hidden="true" />
        ) : (
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} className="text-emerald-600" aria-hidden="true" />
        )}
        {candidate.coach.fullName}
        <Badge variant="secondary" className="text-[0.625rem]">
          {candidate.rotationScore} rot
        </Badge>
      </span>
      {candidate.blocking[0] ? (
        <span className="text-[0.6875rem] text-destructive/90">{candidate.blocking[0].message}</span>
      ) : candidate.warnings[0] ? (
        <span className="text-[0.6875rem] text-amber-700 dark:text-amber-300">
          {candidate.warnings[0].message}
        </span>
      ) : null}
    </div>
    <Button
      size="xs"
      variant={blocked ? "outline" : "default"}
      disabled={pending}
      onClick={onAssign}
      aria-label={`Assign ${candidate.coach.fullName}`}
    >
      Assign
    </Button>
  </li>
);
