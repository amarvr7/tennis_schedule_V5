"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";
import { ADMIN_NAV_ITEMS } from "./nav-items";

type NavLinksProps = {
  onNavigate?: () => void;
};

/** Renders the admin nav items with an active state derived from the path. */
export const NavLinks = ({ onNavigate }: NavLinksProps) => {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="flex flex-col gap-1">
      {ADMIN_NAV_ITEMS.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              { "bg-sidebar-accent text-sidebar-accent-foreground": isActive },
            )}
          >
            <HugeiconsIcon
              icon={item.icon}
              size={18}
              strokeWidth={2}
              aria-hidden="true"
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};
