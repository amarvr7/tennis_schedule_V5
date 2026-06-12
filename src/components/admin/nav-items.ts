import {
  Calendar03Icon,
  CalendarSetting01Icon,
  UserGroupIcon,
  UserSettings01Icon,
  Alert02Icon,
  ChampionIcon,
  ChartHistogramIcon,
  Mail01Icon,
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
  { label: "Season Setup", href: "/admin/setup", icon: UserSettings01Icon },
  { label: "Week Template", href: "/admin/template", icon: CalendarSetting01Icon },
  { label: "Coaches", href: "/admin/coaches", icon: UserGroupIcon },
  { label: "Availability", href: "/admin/availability", icon: Mail01Icon },
  { label: "Conflicts", href: "/admin/conflicts", icon: Alert02Icon },
  { label: "Tournaments", href: "/admin/tournaments", icon: ChampionIcon },
  { label: "Reports", href: "/admin/reports", icon: ChartHistogramIcon },
];
