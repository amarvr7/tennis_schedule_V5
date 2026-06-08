import { AscenderHomeLink } from "@/components/brand/AscenderHomeLink";

import { NavLinks } from "./NavLinks";

/** Fixed left navigation rail, shown on large screens only. */
export const AdminSidebar = () => (
  <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
    <div className="flex h-16 items-center border-b border-sidebar-border px-5">
      <AscenderHomeLink />
    </div>
    <div className="flex-1 overflow-y-auto p-3">
      <NavLinks />
    </div>
    <p className="px-5 py-4 text-[0.625rem] text-sidebar-foreground/50">IMG Academy Tennis · Admin</p>
  </aside>
);
