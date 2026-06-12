import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";

import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import type { ProgramOption } from "@/lib/onboarding/types";
import { createClient } from "@/lib/supabase/server";

import { OnboardingWizard } from "./OnboardingWizard";

export const metadata = {
  title: "Add coach · IMG Academy Tennis",
};

const NewCoachPage = async () => {
  await requireAdminCoach();
  const supabase = createClient();

  const { data: programs, error } = await supabase
    .from("programs")
    .select("id, name")
    .order("name");

  const programOptions = (programs ?? []) as ProgramOption[];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          href="/admin/coaches"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} aria-hidden="true" />
          Back to coaches
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">Add coach</h1>
          <p className="text-sm text-muted-foreground">
            Onboard a new staff member with profile, certifications, availability defaults, and
            notification preferences.
          </p>
        </div>
      </header>

      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          Could not load programs: {error.message}
        </p>
      ) : null}

      <OnboardingWizard programs={programOptions} />
    </div>
  );
};

export default NewCoachPage;
