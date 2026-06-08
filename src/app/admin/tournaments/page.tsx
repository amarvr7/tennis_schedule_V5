import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import { createClient } from "@/lib/supabase/server";
import { loadTournamentPlannerRaw } from "@/lib/tournaments/load";
import { TournamentPlanner } from "./TournamentPlanner";
import { buildTournamentPlannerView } from "./planner";

export const metadata = {
  title: "Tournaments · IMG Academy Tennis",
};

const TournamentsPage = async () => {
  await requireAdminCoach();

  let loadError: string | null = null;
  let view = buildTournamentPlannerView({
    tournaments: [],
    assignments: [],
    coaches: [],
    programs: [],
    availability: [],
    phaseASchema: false,
  });

  try {
    const supabase = createClient();
    const raw = await loadTournamentPlannerRaw(supabase);
    view = buildTournamentPlannerView(raw);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load tournament data.";
  }

  return <TournamentPlanner data={view} loadError={loadError} />;
};

export default TournamentsPage;
