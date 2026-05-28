"use server";

import { redirect } from "next/navigation";

import { getHomePathForCoach } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

/**
 * Email + password sign-in. On success, resolves the coach's role and redirects
 * to the matching view; the middleware enforces the same routing thereafter.
 */
export const login = async (
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> => {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  const { data: coach } = await supabase
    .from("coaches")
    .select("title, is_admin")
    .eq("auth_user_id", data.user.id)
    .maybeSingle<{ title: string | null; is_admin: boolean | null }>();

  redirect(getHomePathForCoach(coach ?? { title: null, is_admin: null }));
};

export const signOut = async (): Promise<void> => {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
};
