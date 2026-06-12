import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";

import { CoachAvatar } from "@/components/coaches/CoachAvatar";
import { RuleFlagBadges } from "@/components/coaches/RuleFlagBadges";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdminCoach } from "@/lib/auth/requireAdmin";
import {
  formatRuleValue,
  RULE_LABELS,
  toEditableRules,
  type CoachRecord,
  type CoachRuleHistory,
} from "@/lib/coaches/rules";
import { createClient } from "@/lib/supabase/server";
import { CoachContactForm } from "./CoachContactForm";
import { CoachRulesForm } from "./CoachRulesForm";
import { OnboardedBanner } from "./OnboardedBanner";

const SEASON_LABELS: Record<string, string> = {
  year_round: "Year-round",
  summer_only: "Summer only",
  tbd: "TBD",
};

const COACH_COLUMNS =
  "id, full_name, initials, title, season, season_start, season_end, earliest_start, latest_end, midday_block_start, midday_block_end, no_camp, no_bt, no_drive, travel_restricted, program_restriction, is_admin, is_active, onboarding_status, email, phone, preferred_channel, created_at";

const formatDate = (value: string | null): string =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

const CoachDetailPage = async ({ params }: { params: { id: string } }) => {
  const admin = await requireAdminCoach();
  const supabase = createClient();

  const [{ data: coach }, { data: history }] = await Promise.all([
    supabase.from("coaches").select(COACH_COLUMNS).eq("id", params.id).maybeSingle<CoachRecord>(),
    supabase
      .from("coach_rules")
      .select("id, rule_type, priority, value, effective_from, effective_to, notes, created_at")
      .eq("coach_id", params.id)
      .order("created_at", { ascending: false })
      .returns<CoachRuleHistory[]>(),
  ]);

  if (!coach) notFound();

  const ruleHistory = history ?? [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        href="/admin/coaches"
        className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} aria-hidden="true" />
        All coaches
      </Link>

      <Suspense fallback={null}>
        <OnboardedBanner />
      </Suspense>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <CoachAvatar fullName={coach.full_name} initials={coach.initials} size="lg" />
            <div className="flex flex-col gap-1">
              <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
                {coach.full_name}
                {!coach.is_active ? (
                  <Badge variant="secondary" className="text-muted-foreground">
                    Inactive
                  </Badge>
                ) : null}
              </h1>
              <p className="text-sm text-muted-foreground">
                {coach.title ?? "—"} · {coach.initials ?? "—"} ·{" "}
                {SEASON_LABELS[coach.season] ?? coach.season}
              </p>
            </div>
          </div>
          <RuleFlagBadges
            no_camp={coach.no_camp}
            no_bt={coach.no_bt}
            no_drive={coach.no_drive}
          />
        </CardContent>
      </Card>

      <CoachContactForm
        coachId={coach.id}
        initialEmail={coach.email ?? null}
        initialPhone={coach.phone ?? null}
        initialChannel={coach.preferred_channel === "sms" ? "sms" : "email"}
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">Edit rules</h2>
        <CoachRulesForm coachId={coach.id} initialRules={toEditableRules(coach)} />
        <p className="text-xs text-muted-foreground">
          Editing as {admin.full_name}. Saving end-dates the previous rule and records the new one.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Rule history</CardTitle>
          <CardDescription>Every rule change, with the period it was in effect.</CardDescription>
        </CardHeader>
        <CardContent>
          {ruleHistory.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              No rule changes recorded yet. The first edit will start the history.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {ruleHistory.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {RULE_LABELS[entry.rule_type] ?? entry.rule_type}
                      {entry.effective_to === null ? (
                        <Badge variant="outline" className="text-emerald-700 dark:text-emerald-400">
                          Current
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(entry.effective_from)} →{" "}
                      {entry.effective_to ? formatDate(entry.effective_to) : "now"}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-foreground">
                    {formatRuleValue(entry.rule_type, entry.value)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CoachDetailPage;
