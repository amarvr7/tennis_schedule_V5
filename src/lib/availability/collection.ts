/**
 * Open, remind, and close availability collection windows.
 * Uses the Supabase service client (bypasses RLS).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { currentWeekStart, formatWeekRange, shiftWeek } from "@/lib/schedule/grid";

import { dispatchAvailabilityRequest } from "./dispatch";
import { isCoachEligibleForWeek } from "./eligibility";
import { postCollectionSummaryToTeams } from "./teams";
import type {
  AvailabilityCollection,
  AvailabilityRequest,
  CoachContact,
  CollectionSummary,
  DispatchResult,
} from "./types";

const COACH_COLUMNS =
  "id, full_name, email, phone, preferred_channel, season, is_active";

export type CollectionActionResult = {
  ok: boolean;
  error: string | null;
  weekStartDate: string;
  collectionId: string | null;
  dispatchResults: DispatchResult[];
  summary: CollectionSummary | null;
  teamsSkipped?: boolean;
  teamsError?: string | null;
};

const loadActiveCoaches = async (
  supabase: SupabaseClient,
): Promise<CoachContact[]> => {
  const { data, error } = await supabase
    .from("coaches")
    .select(COACH_COLUMNS)
    .eq("is_active", true)
    .order("full_name");

  if (error) throw new Error(error.message);
  return (data ?? []) as CoachContact[];
};

const loadOpenCollection = async (
  supabase: SupabaseClient,
  weekStartDate?: string,
): Promise<AvailabilityCollection | null> => {
  if (weekStartDate) {
    const { data } = await supabase
      .from("availability_collections")
      .select("id, week_start_date, status, opened_at, closed_at")
      .eq("week_start_date", weekStartDate)
      .maybeSingle<AvailabilityCollection>();
    return data;
  }

  const { data } = await supabase
    .from("availability_collections")
    .select("id, week_start_date, status, opened_at, closed_at")
    .eq("status", "open")
    .order("week_start_date", { ascending: false })
    .limit(1)
    .maybeSingle<AvailabilityCollection>();

  return data;
};

const loadRequestsWithCoaches = async (
  supabase: SupabaseClient,
  collectionId: string,
  statusFilter?: AvailabilityRequest["status"],
): Promise<Array<AvailabilityRequest & { coach: CoachContact }>> => {
  let query = supabase
    .from("availability_requests")
    .select(
      `id, collection_id, coach_id, channel, token, sent_at, reminder_count, last_reminded_at, responded_at, status,
       coach:coaches ( id, full_name, email, phone, preferred_channel, season, is_active )`,
    )
    .eq("collection_id", collectionId);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const coach = Array.isArray(row.coach) ? row.coach[0] : row.coach;
    return {
      id: row.id,
      collection_id: row.collection_id,
      coach_id: row.coach_id,
      channel: row.channel,
      token: row.token,
      sent_at: row.sent_at,
      reminder_count: row.reminder_count,
      last_reminded_at: row.last_reminded_at,
      responded_at: row.responded_at,
      status: row.status,
      coach: coach as CoachContact,
    };
  });
};

export const buildCollectionSummary = (
  collection: AvailabilityCollection,
  requests: Array<AvailabilityRequest & { coach?: { full_name: string } }>,
): CollectionSummary => {
  const responded = requests.filter((r) => r.status === "responded").length;
  const pending = requests.filter((r) => r.status === "pending").length;
  const noResponse = requests.filter((r) => r.status === "no_response").length;
  const total = requests.length;
  const responseRatePct = total === 0 ? 0 : Math.round((responded / total) * 100);

  const nonResponders = requests
    .filter((r) => r.status !== "responded")
    .map((r) => r.coach?.full_name ?? r.coach_id);

  return {
    collectionId: collection.id,
    weekStartDate: collection.week_start_date,
    weekLabel: formatWeekRange(collection.week_start_date),
    status: collection.status,
    total,
    responded,
    pending,
    noResponse,
    responseRatePct,
    nonResponders,
  };
};

const sendToRequests = async (
  supabase: SupabaseClient,
  requests: Array<AvailabilityRequest & { coach: CoachContact }>,
  weekStartDate: string,
  isReminder: boolean,
): Promise<DispatchResult[]> => {
  const results: DispatchResult[] = [];
  const now = new Date().toISOString();

  for (const request of requests) {
    const dispatch = await dispatchAvailabilityRequest({
      coach: request.coach,
      token: request.token,
      weekStartDate,
      isReminder,
    });
    results.push(dispatch);

    if (!dispatch.ok && !dispatch.skipped) continue;

    const update: Record<string, unknown> = isReminder
      ? {
          reminder_count: request.reminder_count + 1,
          last_reminded_at: now,
          channel: dispatch.channel,
        }
      : {
          sent_at: now,
          channel: dispatch.channel,
        };

    await supabase.from("availability_requests").update(update).eq("id", request.id);
  }

  return results;
};

/** Monday 7am — open collection for next week and send initial requests. */
export const openAvailabilityCollection = async (
  supabase: SupabaseClient,
): Promise<CollectionActionResult> => {
  const targetWeek = shiftWeek(currentWeekStart(), 1);

  const existing = await loadOpenCollection(supabase, targetWeek);

  if (existing?.status === "open") {
    return {
      ok: true,
      error: null,
      weekStartDate: targetWeek,
      collectionId: existing.id,
      dispatchResults: [],
      summary: null,
    };
  }

  if (existing?.status === "closed") {
    return {
      ok: false,
      error: `Collection for ${targetWeek} is already closed`,
      weekStartDate: targetWeek,
      collectionId: existing.id,
      dispatchResults: [],
      summary: null,
    };
  }

  const { data: collection, error: collectionError } = await supabase
    .from("availability_collections")
    .insert({ week_start_date: targetWeek, status: "open" })
    .select("id, week_start_date, status, opened_at, closed_at")
    .single<AvailabilityCollection>();

  if (collectionError || !collection) {
    return {
      ok: false,
      error: collectionError?.message ?? "Failed to create collection",
      weekStartDate: targetWeek,
      collectionId: null,
      dispatchResults: [],
      summary: null,
    };
  }

  const coaches = (await loadActiveCoaches(supabase)).filter((coach) =>
    isCoachEligibleForWeek(coach, targetWeek),
  );

  const requestRows = coaches.map((coach) => ({
    collection_id: collection.id,
    coach_id: coach.id,
    channel: coach.preferred_channel === "sms" && coach.phone ? "sms" : "email",
    status: "pending" as const,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from("availability_requests")
    .insert(requestRows)
    .select(
      "id, collection_id, coach_id, channel, token, sent_at, reminder_count, last_reminded_at, responded_at, status",
    );

  if (insertError || !inserted) {
    return {
      ok: false,
      error: insertError?.message ?? "Failed to create requests",
      weekStartDate: targetWeek,
      collectionId: collection.id,
      dispatchResults: [],
      summary: null,
    };
  }

  const coachById = new Map(coaches.map((c) => [c.id, c]));
  const withCoaches = inserted.map((row) => ({
    ...(row as AvailabilityRequest),
    coach: coachById.get(row.coach_id)!,
  }));

  const dispatchResults = await sendToRequests(supabase, withCoaches, targetWeek, false);

  return {
    ok: true,
    error: null,
    weekStartDate: targetWeek,
    collectionId: collection.id,
    dispatchResults,
    summary: null,
  };
};

/** Tue/Wed 7am — remind coaches who have not responded. */
export const remindAvailabilityCollection = async (
  supabase: SupabaseClient,
): Promise<CollectionActionResult> => {
  const collection = await loadOpenCollection(supabase);

  if (!collection) {
    return {
      ok: false,
      error: "No open availability collection",
      weekStartDate: "",
      collectionId: null,
      dispatchResults: [],
      summary: null,
    };
  }

  const pending = await loadRequestsWithCoaches(supabase, collection.id, "pending");
  const dispatchResults = await sendToRequests(
    supabase,
    pending,
    collection.week_start_date,
    true,
  );

  return {
    ok: true,
    error: null,
    weekStartDate: collection.week_start_date,
    collectionId: collection.id,
    dispatchResults,
    summary: null,
  };
};

/** Thu 5pm — close window, mark non-responders, post Teams summary. */
export const closeAvailabilityCollection = async (
  supabase: SupabaseClient,
): Promise<CollectionActionResult> => {
  const collection = await loadOpenCollection(supabase);

  if (!collection) {
    return {
      ok: false,
      error: "No open availability collection",
      weekStartDate: "",
      collectionId: null,
      dispatchResults: [],
      summary: null,
    };
  }

  const now = new Date().toISOString();

  await supabase
    .from("availability_requests")
    .update({ status: "no_response" })
    .eq("collection_id", collection.id)
    .eq("status", "pending");

  const { data: closed, error: closeError } = await supabase
    .from("availability_collections")
    .update({ status: "closed", closed_at: now })
    .eq("id", collection.id)
    .select("id, week_start_date, status, opened_at, closed_at")
    .single<AvailabilityCollection>();

  if (closeError || !closed) {
    return {
      ok: false,
      error: closeError?.message ?? "Failed to close collection",
      weekStartDate: collection.week_start_date,
      collectionId: collection.id,
      dispatchResults: [],
      summary: null,
    };
  }

  const allRequests = await loadRequestsWithCoaches(supabase, closed.id);
  const summary = buildCollectionSummary(closed, allRequests);
  const teamsResult = await postCollectionSummaryToTeams(summary);

  return {
    ok: true,
    error: null,
    weekStartDate: closed.week_start_date,
    collectionId: closed.id,
    dispatchResults: [],
    summary,
    teamsSkipped: teamsResult.skipped,
    teamsError: teamsResult.error,
  };
};

/** Resend a single request (admin action). */
export const resendAvailabilityRequest = async (
  supabase: SupabaseClient,
  requestId: string,
  isReminder = true,
): Promise<DispatchResult> => {
  const { data, error } = await supabase
    .from("availability_requests")
    .select(
      `id, collection_id, coach_id, channel, token, sent_at, reminder_count, last_reminded_at, responded_at, status,
       collection:availability_collections ( week_start_date, status ),
       coach:coaches ( id, full_name, email, phone, preferred_channel, season, is_active )`,
    )
    .eq("id", requestId)
    .maybeSingle();

  if (error || !data) {
    return {
      coachId: "",
      channel: "email",
      ok: false,
      error: error?.message ?? "Request not found",
      skipped: false,
    };
  }

  const collection = Array.isArray(data.collection) ? data.collection[0] : data.collection;
  const coach = Array.isArray(data.coach) ? data.coach[0] : data.coach;

  if (!collection || collection.status !== "open") {
    return {
      coachId: data.coach_id,
      channel: data.channel,
      ok: false,
      error: "Collection is closed",
      skipped: false,
    };
  }

  const request: AvailabilityRequest & { coach: CoachContact } = {
    id: data.id,
    collection_id: data.collection_id,
    coach_id: data.coach_id,
    channel: data.channel,
    token: data.token,
    sent_at: data.sent_at,
    reminder_count: data.reminder_count,
    last_reminded_at: data.last_reminded_at,
    responded_at: data.responded_at,
    status: data.status,
    coach: coach as CoachContact,
  };

  const [result] = await sendToRequests(
    supabase,
    [request],
    collection.week_start_date,
    isReminder,
  );

  return (
    result ?? {
      coachId: data.coach_id,
      channel: data.channel,
      ok: false,
      error: "Send failed",
      skipped: false,
    }
  );
};
