import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";

import { Card, CardContent } from "@/components/ui/card";

type ComingSoonProps = {
  title: string;
  description: string;
  icon: IconSvgElement;
};

/** Phase-1 placeholder for admin sections that are not built yet. */
export const ComingSoon = ({ title, description, icon }: ComingSoonProps) => (
  <div className="mx-auto flex max-w-5xl flex-col gap-6">
    <header className="flex flex-col gap-1">
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </header>

    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <HugeiconsIcon icon={icon} size={22} strokeWidth={2} aria-hidden="true" />
        </span>
        <p className="text-sm font-medium text-foreground">Coming soon</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          This section is part of a later phase. The navigation and layout are ready for it.
        </p>
      </CardContent>
    </Card>
  </div>
);
