"use server";

import { revalidatePath } from "next/cache";

import { getCurrentCoach } from "@/lib/auth/getCurrentCoach";
import { createClient } from "@/lib/supabase/server";
import { normalizeWeekStart } from "@/lib/schedule/grid";

export type ImBackResult = {
  ok: boolean;
  error: string | null;
  blocksCleared: number;
  adminsNotified: number;
};

const fail = (error: string): ImBackResult => ({
  ok: false,
  error,
  blocksCleared: 0,
  adminsNotified: 0,
});

/**
 * "I'm Back" — a traveling coach returns. Delegates to the SECURITY DEFINER
 * `coach_im_back` RPC, which (1) clears the coach's travel block for the week
 * and (2) alerts every admin. The RPC resolves the coach from the auth session,
 * so a coach can only ever act on their own travel block.
 */
export const imBack = async (weekStartDate: string): Promise<ImBackResult> => {
  const coach = await getCurrentCoach();
  if (!coach) return fail("You must be signed in.");

  const week = normalizeWeekStart(weekStartDate);
  const supabase = createClient();

  const { data, error } = await supabase
    .rpc("coach_im_back", { p_week_start: week })
    .single<{ blocks_cleared: number; admins_notified: number }>();

  if (error) return fail(`Could not clear your travel block: ${error.message}`);

  revalidatePath("/schedule");

  return {
    ok: true,
    error: null,
    blocksCleared: data?.blocks_cleared ?? 0,
    adminsNotified: data?.admins_notified ?? 0,
  };
};
