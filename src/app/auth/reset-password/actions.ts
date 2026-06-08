"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type ResetPasswordState = { error: string | null };

export const updatePassword = async (
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> => {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  await supabase.auth.signOut();
  redirect("/login?message=password_updated");
};
