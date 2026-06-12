"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GroupRequirement, RosterMember, RosterRole } from "@/lib/schedule/roster";
import { addRosterMember, removeRosterMember, updateGroupStaffing } from "./actions";

export type SetupCoach = {
  id: string;
  fullName: string;
  initials: string | null;
  title: string | null;
};

type SeasonSetupProps = {
  requirements: GroupRequirement[];
  rosterMembers: RosterMember[];
  coaches: SetupCoach[];
};

type GroupCardProps = {
  requirement: GroupRequirement;
  members: RosterMember[];
  coaches: SetupCoach[];
  coachById: Map<string, SetupCoach>;
  pending: boolean;
  onError: (message: string | null) => void;
};

const inputClass =
  "h-8 w-16 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const selectClass =
  "h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const GroupCard = ({
  requirement,
  members,
  coaches,
  coachById,
  pending,
  onError,
}: GroupCardProps) => {
  const router = useRouter();
  const [isSaving, startTransition] = useTransition();
  const [leadCount, setLeadCount] = useState(String(requirement.requiredLeadCount));
  const [assistantCount, setAssistantCount] = useState(
    String(requirement.requiredAssistantCount),
  );
  const [baseCapacity, setBaseCapacity] = useState(
    requirement.baseCapacity?.toString() ?? "",
  );
  const [addCoachId, setAddCoachId] = useState("");
  const [addRole, setAddRole] = useState<RosterRole>("assistant");

  const memberCoachIds = useMemo(
    () => new Set(members.map((member) => member.coachId)),
    [members],
  );
  const addableCoaches = coaches.filter((coach) => !memberCoachIds.has(coach.id));

  const leads = members.filter((member) => member.role === "lead");
  const assistants = members.filter((member) => member.role === "assistant");

  const isCamp = requirement.programType === "camp";
  const rosterComplete =
    leads.length >= requirement.requiredLeadCount &&
    assistants.length >= requirement.requiredAssistantCount;

  const handleSaveStaffing = () => {
    onError(null);
    const leadParsed = Number(leadCount);
    const assistantParsed = Number(assistantCount);
    const capacityParsed = baseCapacity.trim() === "" ? null : Number(baseCapacity);

    startTransition(async () => {
      const result = await updateGroupStaffing({
        programId: requirement.programId,
        requiredLeadCount: leadParsed,
        requiredAssistantCount: assistantParsed,
        baseCapacity: capacityParsed,
      });
      if (!result.ok && result.error) onError(result.error);
      router.refresh();
    });
  };

  const handleAddMember = () => {
    onError(null);
    if (!addCoachId) return;

    startTransition(async () => {
      const result = await addRosterMember({
        programId: requirement.programId,
        coachId: addCoachId,
        role: addRole,
      });
      if (!result.ok && result.error) onError(result.error);
      setAddCoachId("");
      router.refresh();
    });
  };

  const handleRemoveMember = (rosterId: string) => {
    onError(null);
    startTransition(async () => {
      const result = await removeRosterMember(rosterId);
      if (!result.ok && result.error) onError(result.error);
      router.refresh();
    });
  };

  const busy = pending || isSaving;

  const renderMember = (member: RosterMember) => {
    const coach = coachById.get(member.coachId);
    return (
      <li
        key={member.id}
        className="flex items-center justify-between gap-2 rounded-md bg-foreground/5 px-2 py-1.5"
      >
        <span className="flex flex-col">
          <span className="text-xs font-medium text-foreground">
            {coach?.fullName ?? "Unknown coach"}
          </span>
          {coach?.title ? (
            <span className="text-[0.625rem] text-muted-foreground">{coach.title}</span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={() => handleRemoveMember(member.id)}
          disabled={busy}
          aria-label={`Remove ${coach?.fullName ?? "coach"} from ${requirement.programName} roster`}
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2} aria-hidden="true" />
        </button>
      </li>
    );
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10">
      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold text-foreground">{requirement.programName}</h2>
          {requirement.programType ? (
            <span className="text-[0.625rem] capitalize text-muted-foreground">
              {requirement.programType}
            </span>
          ) : null}
        </div>
        <Badge
          className={cn(
            rosterComplete
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
              : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
          )}
        >
          {leads.length}/{requirement.requiredLeadCount} lead
          {" · "}
          {assistants.length}/{requirement.requiredAssistantCount} asst
        </Badge>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[0.625rem] font-medium text-muted-foreground">
          Leads required
          <input
            type="number"
            min={0}
            max={20}
            value={leadCount}
            onChange={(event) => setLeadCount(event.target.value)}
            className={inputClass}
            aria-label={`Required lead count for ${requirement.programName}`}
          />
        </label>
        <label className="flex flex-col gap-1 text-[0.625rem] font-medium text-muted-foreground">
          Assistants required
          <input
            type="number"
            min={0}
            max={20}
            value={assistantCount}
            onChange={(event) => setAssistantCount(event.target.value)}
            className={inputClass}
            aria-label={`Required assistant count for ${requirement.programName}`}
          />
        </label>
        {isCamp ? (
          <label className="flex flex-col gap-1 text-[0.625rem] font-medium text-muted-foreground">
            Base capacity (campers)
            <input
              type="number"
              min={1}
              value={baseCapacity}
              onChange={(event) => setBaseCapacity(event.target.value)}
              placeholder="—"
              className={cn(inputClass, "w-24")}
              aria-label={`Camp base capacity for ${requirement.programName}`}
            />
          </label>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={handleSaveStaffing} disabled={busy}>
          Save
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Leads ({leads.length})
          </h3>
          {leads.length === 0 ? (
            <p className="text-xs text-muted-foreground">No lead rostered.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">{leads.map(renderMember)}</ul>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Assistants ({assistants.length})
          </h3>
          {assistants.length === 0 ? (
            <p className="text-xs text-muted-foreground">No assistants rostered.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">{assistants.map(renderMember)}</ul>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <select
          value={addCoachId}
          onChange={(event) => setAddCoachId(event.target.value)}
          className={cn(selectClass, "min-w-44 flex-1")}
          aria-label={`Add a coach to ${requirement.programName} roster`}
        >
          <option value="">Add a coach…</option>
          {addableCoaches.map((coach) => (
            <option key={coach.id} value={coach.id}>
              {coach.fullName}
              {coach.title ? ` — ${coach.title}` : ""}
            </option>
          ))}
        </select>
        <select
          value={addRole}
          onChange={(event) => setAddRole(event.target.value as RosterRole)}
          className={selectClass}
          aria-label="Roster role for the added coach"
        >
          <option value="lead">Lead</option>
          <option value="assistant">Assistant</option>
        </select>
        <Button
          type="button"
          size="sm"
          onClick={handleAddMember}
          disabled={busy || !addCoachId}
        >
          Add
        </Button>
      </div>
    </section>
  );
};

export const SeasonSetup = ({ requirements, rosterMembers, coaches }: SeasonSetupProps) => {
  const [error, setError] = useState<string | null>(null);

  const coachById = useMemo(
    () => new Map(coaches.map((coach) => [coach.id, coach])),
    [coaches],
  );

  const membersByProgram = useMemo(() => {
    const map = new Map<string, RosterMember[]>();
    for (const member of rosterMembers) {
      const list = map.get(member.programId) ?? [];
      list.push(member);
      map.set(member.programId, list);
    }
    return map;
  }, [rosterMembers]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={UserGroupIcon} className="text-primary" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-foreground">Season Setup</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Set each group&rsquo;s staffing requirement and assign its coach team for the
          season. The coach team exists before any schedule is built — weekly generation
          re-places the same rostered people every week.
        </p>
      </header>

      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {requirements.map((requirement) => (
          <GroupCard
            key={requirement.programId}
            requirement={requirement}
            members={membersByProgram.get(requirement.programId) ?? []}
            coaches={coaches}
            coachById={coachById}
            pending={false}
            onError={setError}
          />
        ))}
      </div>
    </div>
  );
};
