import { createClient } from "@/lib/supabase/server";
import type { CoachRole } from "./roles";

export type CurrentCoach = CoachRole & {
  id: string;
  full_name: string;
  initials: string | null;
};

/**
 * Loads the coach row linked to the authenticated user, or null if there is no
 * session / no linked coach. Use in Server Components to render the right view.
 */
export const getCurrentCoach = async (): Promise<CurrentCoach | null> => {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("coaches")
    .select("id, full_name, initials, title, is_admin")
    .eq("auth_user_id", user.id)
    .maybeSingle<CurrentCoach>();

  return data;
};
