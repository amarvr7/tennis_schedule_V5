import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

import { CoachAvatar } from "@/components/coaches/CoachAvatar";
import { RuleFlagBadges } from "@/components/coaches/RuleFlagBadges";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import type { CoachListItem } from "@/lib/coaches/rules";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Coaches · Admin",
};

const CoachesPage = async () => {
  await requireAdminCoach();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("coaches")
    .select("id, full_name, initials, title, no_camp, no_bt, no_drive, is_active, season")
    .order("full_name");

  const coaches = (data ?? []) as CoachListItem[];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">Coaches</h1>
        <p className="text-sm text-muted-foreground">
          {coaches.length} {coaches.length === 1 ? "coach" : "coaches"} · view the roster and edit each coach&apos;s rules.
        </p>
      </header>

      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          Could not load coaches: {error.message}
        </p>
      ) : null}

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Coach</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Restrictions</TableHead>
              <TableHead className="w-12 pr-4 text-right" aria-label="View" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {coaches.map((coach) => (
              <TableRow key={coach.id} className="group">
                <TableCell className="pl-4">
                  <Link
                    href={`/admin/coaches/${coach.id}`}
                    aria-label={`Edit rules for ${coach.full_name}`}
                    className="flex items-center gap-3 outline-none"
                  >
                    <CoachAvatar fullName={coach.full_name} initials={coach.initials} />
                    <span className="flex flex-col">
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        {coach.full_name}
                        {!coach.is_active ? (
                          <Badge variant="secondary" className="text-muted-foreground">
                            Inactive
                          </Badge>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {coach.initials ?? "—"}
                      </span>
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{coach.title ?? "—"}</TableCell>
                <TableCell>
                  <RuleFlagBadges
                    no_camp={coach.no_camp}
                    no_bt={coach.no_bt}
                    no_drive={coach.no_drive}
                  />
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <Link
                    href={`/admin/coaches/${coach.id}`}
                    aria-label={`Open ${coach.full_name}`}
                    className="inline-flex text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} aria-hidden="true" />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default CoachesPage;
