"use client";

import { useSearchParams } from "next/navigation";

export const OnboardedBanner = () => {
  const searchParams = useSearchParams();
  const onboarded = searchParams.get("onboarded") === "1";
  const warnings = searchParams.get("warnings");

  if (!onboarded) return null;

  return (
    <div className="flex flex-col gap-1 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
      <p className="font-medium">Coach onboarded successfully.</p>
      <p>Login invite and welcome message were sent when configured.</p>
      {warnings ? (
        <p role="status" className="text-xs text-amber-800 dark:text-amber-300">
          {warnings}
        </p>
      ) : null}
    </div>
  );
};
