import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FLAG_RULES } from "@/lib/coaches/rules";

type RuleFlagBadgesProps = {
  no_camp: boolean;
  no_bt: boolean;
  no_drive: boolean;
};

/**
 * Renders the three hard-flag rules as badges: red when the restriction is
 * active, gray when inactive. Always shows all three so the state is explicit.
 */
export const RuleFlagBadges = (flags: RuleFlagBadgesProps) => (
  <span className="flex flex-wrap gap-1.5">
    {FLAG_RULES.map(({ key, label }) => {
      const isActive = flags[key as keyof RuleFlagBadgesProps];

      return (
        <Badge
          key={key}
          variant={isActive ? "destructive" : "secondary"}
          className={cn({ "text-muted-foreground": !isActive })}
        >
          {label}
        </Badge>
      );
    })}
  </span>
);
