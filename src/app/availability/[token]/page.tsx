import Image from "next/image";

import { formatWeekRange } from "@/lib/schedule/grid";
import { createServiceClient } from "@/lib/supabase/service";
import { loadRequestByToken } from "@/lib/availability/submit";

import { AvailabilityForm } from "./AvailabilityForm";

export const metadata = {
  title: "Submit Availability · IMG Academy Tennis",
};

type PageProps = {
  params: { token: string };
};

const ClosedMessage = ({ weekLabel }: { weekLabel?: string }) => (
  <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 p-6">
    <Image
      src="/brand/img-academy-tennis-wordmark.png"
      alt="IMG Academy Tennis"
      width={240}
      height={48}
      priority
      className="h-auto w-48"
    />
    <div className="rounded-lg border border-border bg-card p-6 text-center">
      <h1 className="text-lg font-semibold text-foreground">Window closed</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {weekLabel
          ? `Availability for the week of ${weekLabel} is no longer being collected.`
          : "This availability link is invalid or has expired."}{" "}
        Contact Tennis Operations if you need to update your schedule.
      </p>
    </div>
  </div>
);

const AvailabilityPage = async ({ params }: PageProps) => {
  let lookup;
  try {
    const supabase = createServiceClient();
    lookup = await loadRequestByToken(supabase, params.token);
  } catch {
    return <ClosedMessage />;
  }

  if (!lookup) {
    return <ClosedMessage />;
  }

  const weekLabel = formatWeekRange(lookup.weekStartDate);

  if (lookup.collectionStatus === "closed") {
    return <ClosedMessage weekLabel={weekLabel} />;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col gap-8 p-4 py-8 sm:p-6">
      <header className="flex flex-col items-center gap-4 text-center">
        <Image
          src="/brand/img-academy-tennis-wordmark.png"
          alt="IMG Academy Tennis"
          width={240}
          height={48}
          priority
          className="h-auto w-48"
        />
        <p className="text-sm text-muted-foreground">Weekly availability</p>
      </header>

      <AvailabilityForm
        token={params.token}
        coachName={lookup.coachName}
        weekLabel={weekLabel}
        initialDays={lookup.existingDays}
        initialNotes={lookup.existingNotes}
      />
    </div>
  );
};

export default AvailabilityPage;
