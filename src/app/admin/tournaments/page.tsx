import { ChampionIcon } from "@hugeicons/core-free-icons";

import { ComingSoon } from "@/components/admin/ComingSoon";
import { requireAdminCoach } from "@/lib/auth/requireAdmin";

export const metadata = {
  title: "Tournaments · Admin",
};

const TournamentsPage = async () => {
  await requireAdminCoach();

  return (
    <ComingSoon
      title="Tournaments"
      description="Travel events and tournament assignments."
      icon={ChampionIcon}
    />
  );
};

export default TournamentsPage;
