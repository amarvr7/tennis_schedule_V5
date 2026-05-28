import { redirect } from "next/navigation";

import { getCurrentCoach } from "@/lib/auth/getCurrentCoach";
import { getHomePathForCoach } from "@/lib/auth/roles";

const HomePage = async () => {
  const coach = await getCurrentCoach();
  redirect(coach ? getHomePathForCoach(coach) : "/login");
};

export default HomePage;
