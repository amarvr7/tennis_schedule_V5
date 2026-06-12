"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { submitAvailability } from "@/lib/availability/submit";
import type { DayAvailabilityInput } from "@/lib/availability/types";

export type AvailabilityFormState = {
  ok: boolean;
  error: string | null;
  message: string | null;
};

export const saveAvailability = async (
  _prev: AvailabilityFormState,
  formData: FormData,
): Promise<AvailabilityFormState> => {
  const token = String(formData.get("token") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const days: DayAvailabilityInput[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("day_")) continue;
    const dayOfWeek = key.replace("day_", "");
    days.push({
      dayOfWeek: dayOfWeek as DayAvailabilityInput["dayOfWeek"],
      status: String(value) as DayAvailabilityInput["status"],
    });
  }

  if (!token || days.length === 0) {
    return { ok: false, error: "Missing availability data.", message: null };
  }

  try {
    const supabase = createServiceClient();
    const result = await submitAvailability(supabase, { token, days, notes });

    if (!result.ok) {
      return { ok: false, error: result.error, message: null };
    }

    return {
      ok: true,
      error: null,
      message: "Your availability has been saved. Thank you!",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return { ok: false, error: message, message: null };
  }
};
