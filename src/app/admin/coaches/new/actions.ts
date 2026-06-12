"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createCoachFromDraft } from "@/lib/onboarding/createCoach";
import type { OnboardingDraft } from "@/lib/onboarding/types";
import { validateOnboardingDraft } from "@/lib/onboarding/validation";
import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import { createClient } from "@/lib/supabase/server";

export type OnboardingFormState = {
  error: string | null;
};

const parseDraft = (raw: string): OnboardingDraft | null => {
  try {
    return JSON.parse(raw) as OnboardingDraft;
  } catch {
    return null;
  }
};

/** Create a new coach from the onboarding wizard draft. */
export const createCoachAction = async (
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> => {
  await requireAdminCoach();

  const raw = String(formData.get("draft") ?? "");
  const draft = parseDraft(raw);

  if (!draft) {
    return { error: "Invalid form data. Please try again." };
  }

  const validationError = validateOnboardingDraft(draft);
  if (validationError) {
    return { error: validationError };
  }

  const supabase = createClient();

  let result;
  try {
    result = await createCoachFromDraft(supabase, draft);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create coach.";
    return { error: message };
  }

  revalidatePath("/admin/coaches");
  revalidatePath(`/admin/coaches/${result.coachId}`);

  const warnings =
    result.welcomeWarnings.length > 0
      ? `&warnings=${encodeURIComponent(result.welcomeWarnings.join(" "))}`
      : "";

  redirect(`/admin/coaches/${result.coachId}?onboarded=1${warnings}`);
};
