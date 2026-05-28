import { Alert02Icon } from "@hugeicons/core-free-icons";

import { ComingSoon } from "@/components/admin/ComingSoon";
import { requireAdminCoach } from "@/lib/auth/requireAdmin";

export const metadata = {
  title: "Conflicts · Admin",
};

const ConflictsPage = async () => {
  await requireAdminCoach();

  return (
    <ComingSoon
      title="Conflicts"
      description="All active conflicts for the current week, filterable by type."
      icon={Alert02Icon}
    />
  );
};

export default ConflictsPage;
