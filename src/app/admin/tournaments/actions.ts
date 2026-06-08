"use server";

import { revalidatePath } from "next/cache";

import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import { createClient } from "@/lib/supabase/server";
import {
  toTournament,
  toTournamentAssignment,
  type RawTournament,
  type RawTournamentAssignment,
} from "@/lib/tournaments/model";
import { loadTournamentPlannerRaw } from "@/lib/tournaments/load";
import { hasPhaseASchema } from "@/lib/tournaments/schema";
import { tournamentToAvailabilitySlots } from "@/lib/tournaments/travelWeeks";
import type { TournamentAssignmentRole, TournamentType } from "@/lib/tournaments/types";
import { buildTournamentPlannerView } from "./planner";

export type ActionResult = { ok: boolean; error: string | null };

export type PublishTournamentResult = ActionResult & { notified: number };

const fail = (error: string): ActionResult => ({ ok: false, error });

const TOURNAMENT_SELECT =
  "id, name, location, is_local, start_date, end_date, days_count, tournament_type, program_id, is_canceled, is_archived, published_at, notes";
const ASSIGNMENT_SELECT =
  "id, tournament_id, coach_id, student_name, role, status, departed_at, returned_at, rest_days_owed, notes, created_at";
type CreateTournamentInput = {
  name: string;
  location?: string;
  isLocal?: boolean;
  startDate?: string;
  endDate?: string;
  daysCount?: number;
  tournamentType?: TournamentType;
  programId?: string;
  notes?: string;
};

type AssignCoachInput = {
  tournamentId: string;
  coachId: string;
  role?: TournamentAssignmentRole;
  studentName?: string;
  notes?: string;
};

/** Create a tournament event (draft until assignments are published). */
export const createTournament = async (
  input: CreateTournamentInput,
): Promise<ActionResult & { id?: string }> => {
  await requireAdminCoach();

  if (!input.name?.trim()) return { ...fail("Tournament name is required."), id: undefined };

  const supabase = createClient();
  const phaseA = await hasPhaseASchema(supabase);

  const baseRow = {
    name: input.name.trim(),
    location: input.location?.trim() || null,
    is_local: input.isLocal ?? false,
    start_date: input.startDate || null,
    end_date: input.endDate || null,
    days_count: input.daysCount ?? null,
    tournament_type: input.tournamentType || null,
    notes: input.notes?.trim() || null,
  };

  const insertRow = phaseA
    ? { ...baseRow, program_id: input.programId || null }
    : baseRow;

  const { data, error } = await supabase
    .from("tournaments")
    .insert(insertRow as typeof baseRow & { program_id?: string | null })
    .select("id")
    .single<{ id: string }>();

  if (error) return { ...fail(`Could not create tournament: ${error.message}`), id: undefined };

  revalidatePath("/admin/tournaments");
  return { ok: true, error: null, id: data.id };
};

/** Archive a tournament (never delete). */
export const archiveTournament = async (tournamentId: string): Promise<ActionResult> => {
  await requireAdminCoach();
  if (!tournamentId) return fail("Missing tournament.");

  const supabase = createClient();
  const phaseA = await hasPhaseASchema(supabase);
  const { error } = await supabase
    .from("tournaments")
    .update(phaseA ? { is_archived: true } : { is_canceled: true })
    .eq("id", tournamentId);

  if (error) return fail(`Could not archive tournament: ${error.message}`);

  revalidatePath("/admin/tournaments");
  return { ok: true, error: null };
};

/**
 * Assign a coach to a tournament as draft. Reactivates archived rows for the
 * same coach+tournament pair (never delete records).
 */
export const assignCoachToTournament = async (
  input: AssignCoachInput,
): Promise<ActionResult> => {
  await requireAdminCoach();

  const { tournamentId, coachId, role = "lead", studentName, notes } = input;
  if (!tournamentId || !coachId) return fail("Missing tournament or coach.");

  const supabase = createClient();
  const phaseA = await hasPhaseASchema(supabase);

  const { data: existing, error: existingError } = await supabase
    .from("tournament_assignments")
    .select(phaseA ? "id, status" : "id")
    .eq("tournament_id", tournamentId)
    .eq("coach_id", coachId)
    .maybeSingle<{ id: string; status?: string }>();

  if (existingError) {
    return fail(`Could not check existing assignment: ${existingError.message}`);
  }

  if (existing) {
    if (!phaseA || existing.status !== "archived") {
      return { ok: true, error: null };
    }
    const { error: reactivateError } = await supabase
      .from("tournament_assignments")
      .update({
        status: "draft",
        role,
        student_name: studentName?.trim() || null,
        notes: notes?.trim() || null,
      })
      .eq("id", existing.id);

    if (reactivateError) {
      return fail(`Could not reactivate assignment: ${reactivateError.message}`);
    }
    revalidatePath("/admin/tournaments");
    return { ok: true, error: null };
  }

  const baseInsert = {
    tournament_id: tournamentId,
    coach_id: coachId,
    student_name: studentName?.trim() || null,
    notes: notes?.trim() || null,
  };

  const assignmentRow = phaseA
    ? { ...baseInsert, role, status: "draft" as const }
    : baseInsert;

  const { error: insertError } = await supabase
    .from("tournament_assignments")
    .insert(
      assignmentRow as typeof baseInsert & {
        role?: TournamentAssignmentRole;
        status?: string;
      },
    );

  if (insertError) return fail(`Could not assign coach: ${insertError.message}`);

  revalidatePath("/admin/tournaments");
  return { ok: true, error: null };
};

/** Archive a tournament assignment (never delete). */
export const unassignCoachFromTournament = async (
  assignmentId: string,
): Promise<ActionResult> => {
  await requireAdminCoach();
  if (!assignmentId) return fail("Missing assignment.");

  const supabase = createClient();
  const phaseA = await hasPhaseASchema(supabase);

  if (!phaseA) {
    return fail(
      "Removing assignments requires Phase A migration (status column). Run supabase db push.",
    );
  }

  const { error } = await supabase
    .from("tournament_assignments")
    .update({ status: "archived" })
    .eq("id", assignmentId);

  if (error) return fail(`Could not remove assignment: ${error.message}`);

  revalidatePath("/admin/tournaments");
  return { ok: true, error: null };
};

/**
 * Publish a tournament roster: flip draft assignments to published, set
 * `published_at`, sync `coach_availability` traveling rows, and notify coaches.
 */
export const publishTournament = async (
  tournamentId: string,
): Promise<PublishTournamentResult> => {
  await requireAdminCoach();
  if (!tournamentId) return { ok: false, error: "Missing tournament.", notified: 0 };

  const supabase = createClient();
  const phaseA = await hasPhaseASchema(supabase);

  if (!phaseA) {
    return {
      ok: false,
      error: "Publish requires Phase A migration (program_id, status, published_at columns).",
      notified: 0,
    };
  }

  const { data: rawTournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select(TOURNAMENT_SELECT)
    .eq("id", tournamentId)
    .maybeSingle<RawTournament>();

  if (tournamentError) {
    return { ok: false, error: `Could not load tournament: ${tournamentError.message}`, notified: 0 };
  }
  if (!rawTournament || rawTournament.is_archived) {
    return { ok: false, error: "Tournament not found.", notified: 0 };
  }

  const tournament = toTournament(rawTournament);

  const { data: draftAssignments, error: assignmentsError } = await supabase
    .from("tournament_assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("tournament_id", tournamentId)
    .eq("status", "draft");

  if (assignmentsError) {
    return {
      ok: false,
      error: `Could not load assignments: ${assignmentsError.message}`,
      notified: 0,
    };
  }

  const assignments = (draftAssignments ?? []).map((row) =>
    toTournamentAssignment(row as RawTournamentAssignment),
  );

  if (assignments.length === 0) {
    return { ok: false, error: "No draft assignments to publish.", notified: 0 };
  }

  const now = new Date().toISOString();
  const coachIds = [...new Set(assignments.map((a) => a.coachId))];

  const { error: publishAssignmentsError } = await supabase
    .from("tournament_assignments")
    .update({ status: "published" })
    .eq("tournament_id", tournamentId)
    .eq("status", "draft");

  if (publishAssignmentsError) {
    return {
      ok: false,
      error: `Could not publish assignments: ${publishAssignmentsError.message}`,
      notified: 0,
    };
  }

  const { error: publishTournamentError } = await supabase
    .from("tournaments")
    .update({ published_at: now })
    .eq("id", tournamentId);

  if (publishTournamentError) {
    return {
      ok: false,
      error: `Assignments published but tournament timestamp failed: ${publishTournamentError.message}`,
      notified: 0,
    };
  }

  const slots = tournamentToAvailabilitySlots(tournament, coachIds);
  for (const slot of slots) {
    const { data: existing } = await supabase
      .from("coach_availability")
      .select("id")
      .eq("coach_id", slot.coachId)
      .eq("week_start_date", slot.weekStartDate)
      .eq("day_of_week", slot.dayOfWeek)
      .maybeSingle<{ id: string }>();

    if (existing) {
      await supabase
        .from("coach_availability")
        .update({ status: "traveling", notes: `Tournament: ${tournament.name}` })
        .eq("id", existing.id);
    } else {
      await supabase.from("coach_availability").insert({
        coach_id: slot.coachId,
        week_start_date: slot.weekStartDate,
        day_of_week: slot.dayOfWeek,
        status: "traveling",
        notes: `Tournament: ${tournament.name}`,
      });
    }
  }

  const message = `Your travel assignment for ${tournament.name} (${tournament.startDate ?? "TBD"} – ${tournament.endDate ?? "TBD"}) has been published.`;
  const { error: notifyError } = await supabase.from("notifications").insert(
    coachIds.map((coachId) => ({
      recipient_coach_id: coachId,
      type: "tournament_published",
      message,
    })),
  );

  if (notifyError) {
    return {
      ok: false,
      error: `Published but notifications failed: ${notifyError.message}`,
      notified: 0,
    };
  }

  revalidatePath("/admin/tournaments");
  revalidatePath("/admin/schedule");
  revalidatePath("/schedule");

  return { ok: true, error: null, notified: coachIds.length };
};

/** Load tournament planner data for admin UI / API consumers. */
export const loadTournamentPlannerData = async () => {
  await requireAdminCoach();

  const supabase = createClient();

  try {
    const raw = await loadTournamentPlannerRaw(supabase);
    return {
      ok: true as const,
      error: null,
      data: buildTournamentPlannerView(raw),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load tournament data.";
    return { ok: false as const, error: message, data: null };
  }
};
