"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, AirplaneLanding01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { imBack, type ImBackResult } from "./actions";

type ImBackButtonProps = {
  weekStartDate: string;
};

/**
 * "I'm Back" — shown only when the coach is currently traveling. Clears their
 * travel block for the week and alerts admins via the `imBack` server action.
 */
export const ImBackButton = ({ weekStartDate }: ImBackButtonProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ImBackResult | null>(null);

  const handleClick = () => {
    if (isPending) return;
    const confirmed = window.confirm(
      "Confirm you're back from travel? This clears your travel block for this week and notifies the admin team.",
    );
    if (!confirmed) return;

    startTransition(async () => {
      const next = await imBack(weekStartDate);
      setResult(next);
      if (next.ok) router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        type="button"
        size="lg"
        onClick={handleClick}
        disabled={isPending}
        aria-label="I'm back from travel"
      >
        <HugeiconsIcon icon={AirplaneLanding01Icon} aria-hidden="true" />
        {isPending ? "Letting admin know…" : "I'm Back"}
      </Button>

      {result?.ok ? (
        <span className="inline-flex items-center gap-1 text-[0.625rem] font-medium text-emerald-600 dark:text-emerald-400">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} aria-hidden="true" />
          Travel block cleared · {result.adminsNotified} admin
          {result.adminsNotified === 1 ? "" : "s"} notified
        </span>
      ) : null}

      {result && !result.ok ? (
        <span role="alert" className="text-[0.625rem] font-medium text-destructive">
          {result.error}
        </span>
      ) : null}
    </div>
  );
};
