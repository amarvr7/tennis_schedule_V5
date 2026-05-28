"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Menu01Icon,
  Logout01Icon,
  TennisBallIcon,
} from "@hugeicons/core-free-icons";

import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NavLinks } from "./NavLinks";

type AdminTopBarProps = {
  coachName: string;
  coachTitle: string | null;
};

/** Sticky header: mobile nav trigger, logged-in coach identity, sign out. */
export const AdminTopBar = ({ coachName, coachTitle }: AdminTopBarProps) => {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const handleCloseMobileNav = () => setIsMobileNavOpen(false);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 lg:px-8">
      <div className="flex items-center gap-2">
        <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open navigation menu"
              className="lg:hidden"
            >
              <HugeiconsIcon icon={Menu01Icon} strokeWidth={2} aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SheetHeader className="h-16 flex-row items-center gap-2 border-b border-border p-5">
              <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <HugeiconsIcon icon={TennisBallIcon} size={18} strokeWidth={2} aria-hidden="true" />
              </span>
              <SheetTitle>Academy</SheetTitle>
            </SheetHeader>
            <div className="p-3">
              <NavLinks onNavigate={handleCloseMobileNav} />
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">{coachName}</span>
          <span className="text-xs text-muted-foreground">{coachTitle ?? "Admin"}</span>
        </div>
      </div>

      <form action={signOut}>
        <Button type="submit" variant="outline" size="sm" aria-label="Sign out">
          <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} aria-hidden="true" />
          Sign out
        </Button>
      </form>
    </header>
  );
};
