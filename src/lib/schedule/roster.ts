/**
 * Group rosters + staffing requirements (CURSOR_ANSWERS.md Q1).
 *
 * Staffing is defined per GROUP (program), set once per season: a required
 * lead/assistant count on the program plus the group's assigned coach team in
 * `group_coach_roster`. The roster exists before any schedule is built; weekly
 * generation just re-places the same people (Q5 — the roster IS the
 * continuity). Pure module: no React / Next / Supabase imports.
 */

export type RosterRole = "lead" | "assistant";

/** One live roster membership: this coach is on this group's season team. */
export interface RosterMember {
  id: string;
  programId: string;
  coachId: string;
  role: RosterRole;
}

/** Per-group staffing requirement (Q1: "fully staffed" definition). */
export interface GroupRequirement {
  programId: string;
  programName: string;
  programType: string | null;
  requiredLeadCount: number;
  requiredAssistantCount: number;
  baseCapacity: number | null;
}

export interface GroupRoster {
  leads: RosterMember[];
  assistants: RosterMember[];
}

// -----------------------------------------------------------------------------
// Raw row shapes
// -----------------------------------------------------------------------------

export interface RawRosterMember {
  id: string;
  program_id: string;
  coach_id: string;
  role: string;
  is_active: boolean;
}

export interface RawGroupRequirement {
  id: string;
  name: string;
  type: string | null;
  required_lead_count: number | null;
  required_assistant_count: number | null;
  base_capacity: number | null;
}

export const toRosterMember = (row: RawRosterMember): RosterMember | null => {
  if (!row.is_active) return null;
  if (row.role !== "lead" && row.role !== "assistant") return null;
  return {
    id: row.id,
    programId: row.program_id,
    coachId: row.coach_id,
    role: row.role,
  };
};

export const toGroupRequirement = (row: RawGroupRequirement): GroupRequirement => ({
  programId: row.id,
  programName: row.name,
  programType: row.type,
  requiredLeadCount: row.required_lead_count ?? 1,
  requiredAssistantCount: row.required_assistant_count ?? 0,
  baseCapacity: row.base_capacity,
});

/** Group live roster members by program, split into leads / assistants. */
export const buildRosterByProgram = (
  members: RosterMember[],
): Map<string, GroupRoster> => {
  const byProgram = new Map<string, GroupRoster>();

  for (const member of members) {
    const roster = byProgram.get(member.programId) ?? { leads: [], assistants: [] };
    if (member.role === "lead") {
      roster.leads.push(member);
    } else {
      roster.assistants.push(member);
    }
    byProgram.set(member.programId, roster);
  }

  return byProgram;
};

/** programId → requirement, for quick lookups by the generator + coverage. */
export const buildRequirementByProgram = (
  requirements: GroupRequirement[],
): Map<string, GroupRequirement> =>
  new Map(requirements.map((requirement) => [requirement.programId, requirement]));
