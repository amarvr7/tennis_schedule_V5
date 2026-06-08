"use client";

import type React from "react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Alert02Icon,
  ChampionIcon,
  SentIcon,
} from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { TournamentAssignmentRole } from "@/lib/tournaments/types";
import type { TournamentPlannerView } from "./planner";
import {
  assignCoachToTournament,
  createTournament,
  publishTournament,
  unassignCoachFromTournament,
} from "./actions";
import { TournamentAssignmentPanel } from "./TournamentAssignmentPanel";

type Tab = "events" | "roster" | "outliers";

type TournamentPlannerProps = {
  data: TournamentPlannerView;
  loadError: string | null;
};

const statusBadge = (publishedAt: string | null, draftCount: number) => {
  if (publishedAt) {
    return <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">Published</Badge>;
  }
  if (draftCount > 0) {
    return <Badge variant="outline">Draft ({draftCount})</Badge>;
  }
  return <Badge variant="secondary">Unassigned</Badge>;
};

export const TournamentPlanner = ({ data, loadError }: TournamentPlannerProps) => {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("events");
  const [selectedId, setSelectedId] = useState<string | null>(
    data.tournaments[0]?.id ?? null,
  );
  const [showAssign, setShowAssign] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = useMemo(
    () => data.tournaments.find((t) => t.id === selectedId) ?? null,
    [data.tournaments, selectedId],
  );

  const selectedAssignments = useMemo(
    () =>
      selected
        ? data.assignments.filter(
            (a) => a.tournamentId === selected.id && a.status !== "archived",
          )
        : [],
    [data.assignments, selected],
  );

  const draftCount = selectedAssignments.filter((a) => a.status === "draft").length;
  const programName = selected?.programId
    ? data.programsById[selected.programId]?.name
    : null;

  const handleAssign = (coachId: string, role: TournamentAssignmentRole) => {
    if (!selected) return;
    setActionError(null);
    startTransition(async () => {
      const result = await assignCoachToTournament({
        tournamentId: selected.id,
        coachId,
        role,
      });
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      setShowAssign(false);
      router.refresh();
    });
  };

  const handleUnassign = (assignmentId: string) => {
    setActionError(null);
    startTransition(async () => {
      const result = await unassignCoachFromTournament(assignmentId);
      if (!result.ok) setActionError(result.error);
      else router.refresh();
    });
  };

  const handlePublish = () => {
    if (!selected) return;
    setActionError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await publishTournament(selected.id);
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      setNotice(`Published — ${result.notified} coaches notified.`);
      router.refresh();
    });
  };

  const handleCreateSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setActionError(null);
    startTransition(async () => {
      const result = await createTournament({
        name: String(formData.get("name") ?? ""),
        location: String(formData.get("location") ?? "") || undefined,
        isLocal: formData.get("isLocal") === "on",
        startDate: String(formData.get("startDate") ?? "") || undefined,
        endDate: String(formData.get("endDate") ?? "") || undefined,
        programId: String(formData.get("programId") ?? "") || undefined,
        tournamentType: (String(formData.get("tournamentType") ?? "") || undefined) as
          | "ITF"
          | "USTA"
          | "local"
          | "clinic"
          | "special_event"
          | undefined,
      });
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      setShowCreate(false);
      if (result.id) setSelectedId(result.id);
      router.refresh();
    });
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">Tournaments</h1>
          <p className="text-sm text-muted-foreground">
            Travel events, coach assignments, rotation fairness, and advance rosters.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)} aria-expanded={showCreate}>
          <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} aria-hidden="true" />
          New tournament
        </Button>
      </header>

      {!data.phaseASchema ? (
        <p
          role="status"
          className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          Phase A migration not applied — publish workflow and program linking are limited. Run{" "}
          <code className="text-xs">supabase db push</code> to enable full features.
        </p>
      ) : null}

      {loadError ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      {actionError ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      {notice ? (
        <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          {notice}
        </p>
      ) : null}

      {showCreate ? (
        <Card className="p-4">
          <form onSubmit={handleCreateSubmit} className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-foreground">Name</span>
              <input
                name="name"
                required
                className="rounded-md border border-border bg-input/30 px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-foreground">Location</span>
              <input
                name="location"
                className="rounded-md border border-border bg-input/30 px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-foreground">Start date</span>
              <input
                name="startDate"
                type="date"
                className="rounded-md border border-border bg-input/30 px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-foreground">End date</span>
              <input
                name="endDate"
                type="date"
                className="rounded-md border border-border bg-input/30 px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-foreground">Program</span>
              <select
                name="programId"
                className="rounded-md border border-border bg-input/30 px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                disabled={!data.phaseASchema}
              >
                <option value="">—</option>
                {data.programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-foreground">Type</span>
              <select
                name="tournamentType"
                className="rounded-md border border-border bg-input/30 px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <option value="USTA">USTA</option>
                <option value="ITF">ITF</option>
                <option value="local">Local</option>
                <option value="clinic">Clinic</option>
                <option value="special_event">Special event</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs sm:col-span-2">
              <input name="isLocal" type="checkbox" className="size-3.5 rounded border-border" />
              <span className="text-foreground">Local tournament</span>
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" size="sm" disabled={isPending}>
                Create tournament
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="flex gap-1 rounded-lg bg-muted/50 p-1" role="tablist" aria-label="Tournament views">
        {(["events", "roster", "outliers"] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              tab === key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {key === "outliers" && data.outliers.length > 0
              ? `Outliers (${data.outliers.length})`
              : key}
          </button>
        ))}
      </div>

      {tab === "events" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Event</TableHead>
                  <TableHead className="pr-4">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.tournaments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="py-10 text-center text-muted-foreground">
                      No tournaments yet. Create one to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.tournaments.map((tournament) => {
                    const assignments = data.assignments.filter(
                      (a) => a.tournamentId === tournament.id && a.status !== "archived",
                    );
                    const drafts = assignments.filter((a) => a.status === "draft").length;
                    return (
                      <TableRow
                        key={tournament.id}
                        className={cn(
                          "cursor-pointer",
                          selectedId === tournament.id && "bg-muted/40",
                        )}
                        onClick={() => {
                          setSelectedId(tournament.id);
                          setShowAssign(false);
                        }}
                      >
                        <TableCell className="pl-4">
                          <span className="font-medium text-foreground">{tournament.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {tournament.startDate ?? "TBD"}
                            {tournament.location ? ` · ${tournament.location}` : ""}
                            {tournament.isLocal ? " · Local" : " · Travel"}
                          </span>
                        </TableCell>
                        <TableCell className="pr-4">
                          {statusBadge(tournament.publishedAt, drafts)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>

          <div className="flex flex-col gap-4">
            {selected ? (
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-sm font-semibold text-foreground">{selected.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {selected.startDate ?? "TBD"} – {selected.endDate ?? "TBD"}
                      {programName ? ` · ${programName}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowAssign(true)}
                      disabled={isPending}
                    >
                      Add coach
                    </Button>
                    {data.phaseASchema && draftCount > 0 ? (
                      <Button size="sm" onClick={handlePublish} disabled={isPending}>
                        <HugeiconsIcon icon={SentIcon} size={14} strokeWidth={2} aria-hidden="true" />
                        Publish roster
                      </Button>
                    ) : null}
                  </div>
                </div>

                {selectedAssignments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No coaches assigned yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {selectedAssignments.map((assignment) => {
                      const coach = data.coaches.find((c) => c.id === assignment.coachId);
                      return (
                        <li
                          key={assignment.id}
                          className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2.5 py-2"
                        >
                          <span className="text-xs">
                            <span className="font-medium text-foreground">
                              {coach?.fullName ?? "Unknown"}
                            </span>
                            <span className="text-muted-foreground">
                              {" "}
                              · {assignment.role ?? "lead"} · {assignment.status}
                              {assignment.studentName ? ` · ${assignment.studentName}` : ""}
                            </span>
                          </span>
                          {assignment.status !== "published" ? (
                            <Button
                              size="xs"
                              variant="ghost"
                              disabled={isPending}
                              onClick={() => handleUnassign(assignment.id)}
                              aria-label={`Remove ${coach?.fullName}`}
                            >
                              Remove
                            </Button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            ) : (
              <Card className="flex flex-col items-center gap-2 p-8 text-center">
                <HugeiconsIcon icon={ChampionIcon} size={22} className="text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Select a tournament to manage its roster.</p>
              </Card>
            )}

            {showAssign && selected ? (
              <TournamentAssignmentPanel
                tournament={selected}
                coaches={data.coaches}
                assignments={data.assignments}
                allAssignments={data.assignments}
                tournaments={data.tournaments}
                availability={data.availability}
                programTypesById={Object.fromEntries(
                  data.programs.map((p) => [p.id, p.type]),
                )}
                pending={isPending}
                onAssign={handleAssign}
                onClose={() => setShowAssign(false)}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "roster" ? (
        <Card className="p-0">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium text-foreground">Travel roster — next 8 weeks</p>
            <p className="text-xs text-muted-foreground">
              {data.roster.tournamentCount} events · {data.roster.coachCount} coaches
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Tournament</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead className="pr-4">Coaches</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.roster.entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                    No upcoming tournaments in the roster window.
                  </TableCell>
                </TableRow>
              ) : (
                data.roster.entries.map((entry) => (
                  <TableRow key={entry.tournamentId}>
                    <TableCell className="pl-4 font-medium">{entry.tournamentName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.startDate ?? "—"} – {entry.endDate ?? "—"}
                      {entry.publishedAt ? (
                        <Badge className="ml-2 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="ml-2">
                          Draft
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="pr-4">
                      <span className="text-xs text-foreground">
                        {entry.assignments.map((a) => a.coachName).join(", ") || "—"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      {tab === "outliers" ? (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Tournament</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead className="pr-4">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.outliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                    No outliers — all tournaments pass standard rules.
                  </TableCell>
                </TableRow>
              ) : (
                data.outliers.map((outlier, index) => (
                  <TableRow key={`${outlier.tournamentId}-${outlier.reason}-${index}`}>
                    <TableCell className="pl-4 font-medium">{outlier.tournamentName}</TableCell>
                    <TableCell>
                      <span className="flex items-start gap-1.5 text-xs text-foreground">
                        <HugeiconsIcon
                          icon={Alert02Icon}
                          size={12}
                          className="mt-0.5 shrink-0 text-amber-600"
                          aria-hidden="true"
                        />
                        {outlier.message}
                      </span>
                    </TableCell>
                    <TableCell className="pr-4">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          setTab("events");
                          setSelectedId(outlier.tournamentId);
                        }}
                      >
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
};
