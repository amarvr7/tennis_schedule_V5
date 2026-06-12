import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import { createClient } from "@/lib/supabase/server";
import { loadGroupRequirements, loadRosterMembers } from "@/lib/schedule/load";
import { SeasonSetup, type SetupCoach } from "./SeasonSetup";

export const metadata = {
  title: "Season Setup · IMG Academy Tennis",
};

/**
 * Season Setup (CURSOR_ANSWERS.md Q1): create groups' staffing requirements
 * and assign each group's coach team for the season. This happens BEFORE any
 * schedule generation — the roster is the continuity (Q5).
 */
const SeasonSetupPage = async () => {
  await requireAdminCoach();
  const supabase = createClient();

  const [requirements, rosterMembers, coachesRes] = await Promise.all([
    loadGroupRequirements(supabase),
    loadRosterMembers(supabase),
    supabase
      .from("coaches")
      .select("id, full_name, initials, title")
      .eq("is_active", true)
      .order("full_name"),
  ]);

  const coaches: SetupCoach[] = (coachesRes.data ?? []).map((row) => ({
    id: row.id as string,
    fullName: row.full_name as string,
    initials: (row.initials as string | null) ?? null,
    title: (row.title as string | null) ?? null,
  }));

  return (
    <SeasonSetup
      requirements={requirements}
      rosterMembers={rosterMembers}
      coaches={coaches}
    />
  );
};

export default SeasonSetupPage;
