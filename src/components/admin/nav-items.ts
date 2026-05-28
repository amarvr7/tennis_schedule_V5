import {
  Calendar03Icon,
  UserGroupIcon,
  Alert02Icon,
  ChampionIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

export type AdminNavItem = {
  label: string;
  href: string;
  icon: IconSvgElement;
};

/** Primary admin navigation, shared by the desktop sidebar and mobile sheet. */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { label: "Schedule", href: "/admin/schedule", icon: Calendar03Icon },
  { label: "Coaches", href: "/admin/coaches", icon: UserGroupIcon },
  { label: "Conflicts", href: "/admin/conflicts", icon: Alert02Icon },
  { label: "Tournaments", href: "/admin/tournaments", icon: ChampionIcon },
];
