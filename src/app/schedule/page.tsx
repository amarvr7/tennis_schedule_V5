import { redirect } from "next/navigation";

import { signOut } from "@/app/login/actions";
import { getCurrentCoach } from "@/lib/auth/getCurrentCoach";

const SchedulePage = async () => {
  const coach = await getCurrentCoach();

  if (!coach) redirect("/login");

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">My Schedule</h1>
          <p className="text-sm text-gray-500">
            {coach.full_name} · {coach.title ?? "Coach"}
          </p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            aria-label="Sign out"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Sign out
          </button>
        </form>
      </header>
      <p className="text-sm text-gray-600">
        Read-only access. UI to be built in a later phase.
      </p>
    </main>
  );
};

export default SchedulePage;
