"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";

export type ForgotPasswordState = { error: string | null; success: boolean };

export const requestPasswordReset = async (
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> => {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { error: "Email is required.", success: false };
  }

  const origin = headers().get("origin") ?? "http://localhost:3000";
  const supabase = createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
  });

  // Always return success to avoid leaking whether the email exists.
  if (error) {
    console.error("resetPasswordForEmail error:", error.message);
  }

  return { error: null, success: true };
};
