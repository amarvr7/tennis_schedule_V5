"use server";

import { revalidatePath } from "next/cache";

import type { PreferredChannel } from "@/lib/availability/types";
import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import { createClient } from "@/lib/supabase/server";

export type ContactFormState = {
  error: string | null;
  message: string | null;
};

const normalizeChannel = (value: string): PreferredChannel =>
  value === "sms" ? "sms" : "email";

/** Update coach contact fields for availability delivery. */
export const updateCoachContact = async (
  coachId: string,
  _prev: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> => {
  await requireAdminCoach();

  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const preferredChannel = normalizeChannel(
    String(formData.get("preferred_channel") ?? "email"),
  );

  if (preferredChannel === "email" && !email) {
    return { error: "Email is required when email is the preferred channel.", message: null };
  }

  if (preferredChannel === "sms" && !phone) {
    return { error: "Phone is required when SMS is the preferred channel.", message: null };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("coaches")
    .update({
      email,
      phone,
      preferred_channel: preferredChannel,
    })
    .eq("id", coachId);

  if (error) {
    return { error: error.message, message: null };
  }

  revalidatePath(`/admin/coaches/${coachId}`);
  revalidatePath("/admin/availability");

  return { error: null, message: "Contact preferences saved." };
};
