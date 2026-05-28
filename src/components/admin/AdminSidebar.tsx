import { HugeiconsIcon } from "@hugeicons/react";
import { TennisBallIcon } from "@hugeicons/core-free-icons";

import { NavLinks } from "./NavLinks";

/** Fixed left navigation rail, shown on large screens only. */
export const AdminSidebar = () => (
  <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
    <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
      <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
        <HugeiconsIcon icon={TennisBallIcon} size={18} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold text-sidebar-foreground">Academy</span>
    </div>
    <div className="flex-1 overflow-y-auto p-3">
      <NavLinks />
    </div>
    <p className="px-5 py-4 text-[0.625rem] text-sidebar-foreground/50">Admin · Phase 1</p>
  </aside>
);
