import { type NextRequest, NextResponse } from "next/server";

import {
  closeAvailabilityCollection,
  openAvailabilityCollection,
  remindAvailabilityCollection,
} from "@/lib/availability/collection";
import { createServiceClient } from "@/lib/supabase/service";

type CronAction = "open" | "remind" | "close";

const isCronAction = (value: string | null): value is CronAction =>
  value === "open" || value === "remind" || value === "close";

/**
 * Cron trigger for weekly availability collection.
 * Vercel Cron: configure in vercel.json with CRON_SECRET header check.
 *
 * Actions:
 * - open (Mon 7am): send initial requests for next week
 * - remind (Tue/Wed 7am): nudge non-responders
 * - close (Thu 5pm): close window, mark no_response, post Teams summary
 */
export const GET = async (request: NextRequest) => {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const actionParam = request.nextUrl.searchParams.get("action");
  if (!isCronAction(actionParam)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid action. Use open, remind, or close." },
      { status: 400 },
    );
  }

  try {
    const supabase = createServiceClient();

    const result =
      actionParam === "open"
        ? await openAvailabilityCollection(supabase)
        : actionParam === "remind"
          ? await remindAvailabilityCollection(supabase)
          : await closeAvailabilityCollection(supabase);

    const sent = result.dispatchResults.filter((r) => r.ok && !r.skipped).length;
    const skipped = result.dispatchResults.filter((r) => r.skipped).length;
    const failed = result.dispatchResults.filter((r) => !r.ok && !r.skipped).length;

    return NextResponse.json({
      ok: result.ok,
      action: actionParam,
      error: result.error,
      weekStartDate: result.weekStartDate,
      collectionId: result.collectionId,
      dispatch: { sent, skipped, failed },
      summary: result.summary,
      teamsSkipped: result.teamsSkipped ?? undefined,
      teamsError: result.teamsError ?? undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
};
