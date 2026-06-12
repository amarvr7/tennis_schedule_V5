"use server";

import { revalidatePath } from "next/cache";

import {
  closeAvailabilityCollection,
  resendAvailabilityRequest,
} from "@/lib/availability/collection";
import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/service";

export type AdminActionResult = {
  ok: boolean;
  error: string | null;
  message: string | null;
};

const success = (message: string): AdminActionResult => ({
  ok: true,
  error: null,
  message,
});

const fail = (error: string): AdminActionResult => ({
  ok: false,
  error,
  message: null,
});

/** Resend the magic link to one coach. */
export const resendRequest = async (requestId: string): Promise<AdminActionResult> => {
  await requireAdminCoach();

  try {
    const supabase = createServiceClient();
    const result = await resendAvailabilityRequest(supabase, requestId, true);

    revalidatePath("/admin/availability");

    if (!result.ok && !result.skipped) {
      return fail(result.error ?? "Failed to resend");
    }

    if (result.skipped) {
      return success("Channel not configured — message was skipped (check env vars).");
    }

    return success("Reminder sent.");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to resend";
    return fail(message);
  }
};

/** Close the open collection immediately. */
export const closeCollectionNow = async (): Promise<AdminActionResult> => {
  await requireAdminCoach();

  try {
    const supabase = createServiceClient();
    const result = await closeAvailabilityCollection(supabase);

    revalidatePath("/admin/availability");

    if (!result.ok) {
      return fail(result.error ?? "Failed to close collection");
    }

    const rate = result.summary?.responseRatePct ?? 0;
    return success(`Collection closed. ${rate}% response rate.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to close collection";
    return fail(message);
  }
};
