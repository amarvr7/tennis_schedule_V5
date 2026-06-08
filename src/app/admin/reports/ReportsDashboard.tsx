"use client";

import Link from "next/link";
import { useTransition } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Download01Icon,
  Share01Icon,
} from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatWeekRange, shiftWeek } from "@/lib/schedule/grid";
import { formatMinutesAsHours } from "@/lib/reports/format";
import type { ReportsDashboardData } from "./actions";
import { postTeamsSummary } from "./actions";

type ReportsDashboardProps = {
  data: ReportsDashboardData;
};

const utilizationBadge = (pct: number) => {
  if (pct > 110) return <Badge variant="destructive">{pct}%</Badge>;
  if (pct < 80) return <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">{pct}%</Badge>;
  return <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">{pct}%</Badge>;
};

export const ReportsDashboard = ({ data }: ReportsDashboardProps) => {
  const [isPosting, startPost] = useTransition();
  const { weeklyReport, hoursAnalysis, coverageTrend } = data;
  const prevWeek = shiftWeek(data.weekStartDate, -1);
  const nextWeek = shiftWeek(data.weekStartDate, 1);

  const handlePostTeams = () => {
    startPost(async () => {
      await postTeamsSummary(data.weekStartDate);
    });
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Management reporting — weekly coverage, coach hours, tournament travel, and court utilization.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/admin/reports/export?week=${data.weekStartDate}&type=weekly`}
              download
              aria-label="Export weekly report as CSV"
            >
              <HugeiconsIcon icon={Download01Icon} size={14} strokeWidth={2} aria-hidden="true" />
              Export CSV
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePostTeams}
            disabled={isPosting}
            aria-label="Post weekly summary to Microsoft Teams"
          >
            <HugeiconsIcon icon={Share01Icon} size={14} strokeWidth={2} aria-hidden="true" />
            {isPosting ? "Posting…" : "Post to Teams"}
          </Button>
        </div>
      </header>

      <div className="flex items-center justify-between gap-3 rounded-lg bg-card p-3 ring-1 ring-foreground/10">
        <Button variant="ghost" size="sm" asChild aria-label="Previous week">
          <Link href={`/admin/reports?week=${prevWeek}`}>
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} aria-hidden="true" />
          </Link>
        </Button>
        <span className="text-sm font-medium text-foreground">
          {formatWeekRange(data.weekStartDate)}
        </span>
        <Button variant="ghost" size="sm" asChild aria-label="Next week">
          <Link href={`/admin/reports?week=${nextWeek}`}>
            <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Weekly coverage"
          value={`${weeklyReport.coverage.coveragePct}%`}
          detail={`${weeklyReport.coverage.staffedSessions}/${weeklyReport.coverage.totalSessions} sessions`}
        />
        <SummaryCard
          label="Season coach-hours"
          value={formatMinutesAsHours(hoursAnalysis.totals.totalMinutes)}
          detail={`${hoursAnalysis.totals.coachCount} coaches`}
        />
        <SummaryCard
          label="Staffing gaps"
          value={String(weeklyReport.coverage.gapCount)}
          detail={weeklyReport.coverage.gapCount > 0 ? "Needs review" : "Fully staffed"}
          alert={weeklyReport.coverage.gapCount > 0}
        />
        <SummaryCard
          label="Tournaments"
          value={String(weeklyReport.tournamentRosters.length)}
          detail="Published in season"
        />
      </div>

      <section aria-labelledby="hours-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="hours-heading" className="text-sm font-semibold text-foreground">
            Coach hours — {weeklyReport.weekLabel}
          </h2>
          <Button variant="ghost" size="sm" asChild>
            <a href={`/admin/reports/export?type=hours&start=${data.period.startDate}&end=${data.period.endDate}`}>
              Export season hours
            </a>
          </Button>
        </div>
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Coach</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Sessions</TableHead>
                <TableHead>Contracted/wk</TableHead>
                <TableHead className="pr-4">Utilization</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weeklyReport.coachHours.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No published assignments for this week.
                  </TableCell>
                </TableRow>
              ) : (
                weeklyReport.coachHours.map((coach) => (
                  <TableRow key={coach.coachId}>
                    <TableCell className="pl-4 font-medium">{coach.fullName}</TableCell>
                    <TableCell>{formatMinutesAsHours(coach.totalMinutes)}</TableCell>
                    <TableCell className="text-muted-foreground">{coach.sessionCount}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatMinutesAsHours(coach.contractedMinutesWeekly)}
                    </TableCell>
                    <TableCell className="pr-4">{utilizationBadge(coach.utilizationPct)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </section>

      <section aria-labelledby="coverage-heading" className="flex flex-col gap-3">
        <h2 id="coverage-heading" className="text-sm font-semibold text-foreground">
          Weekly coverage trend
        </h2>
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Week</TableHead>
                <TableHead>Staffed</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Coverage</TableHead>
                <TableHead className="pr-4">Gaps</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coverageTrend.map((week) => (
                <TableRow key={week.weekStartDate}>
                  <TableCell className="pl-4">
                    <Link
                      href={`/admin/reports?week=${week.weekStartDate}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {week.weekLabel}
                    </Link>
                  </TableCell>
                  <TableCell>{week.staffedSessions}</TableCell>
                  <TableCell className="text-muted-foreground">{week.totalSessions}</TableCell>
                  <TableCell>{week.coveragePct}%</TableCell>
                  <TableCell className="pr-4">
                    {week.gapCount > 0 ? (
                      <Badge variant="destructive">{week.gapCount}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="courts-heading" className="flex flex-col gap-3">
          <h2 id="courts-heading" className="text-sm font-semibold text-foreground">
            Court utilization — {weeklyReport.weekLabel}
          </h2>
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Zone</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead className="pr-4">Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weeklyReport.courtUtilization.slice(0, 8).map((court) => (
                  <TableRow key={`${court.courtZone}-${court.courtLabel}`}>
                    <TableCell className="pl-4">
                      <span className="font-medium">{court.courtZone}</span>
                      <span className="block text-xs text-muted-foreground">{court.courtLabel}</span>
                    </TableCell>
                    <TableCell>{court.sessionCount}</TableCell>
                    <TableCell className="pr-4">{formatMinutesAsHours(court.totalMinutes)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </section>

        <section aria-labelledby="travel-heading" className="flex flex-col gap-3">
          <h2 id="travel-heading" className="text-sm font-semibold text-foreground">
            Tournament travel
          </h2>
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Tournament</TableHead>
                  <TableHead>Coaches</TableHead>
                  <TableHead className="pr-4">Students</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weeklyReport.tournamentRosters.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      No published tournaments in season window.
                    </TableCell>
                  </TableRow>
                ) : (
                  weeklyReport.tournamentRosters.slice(0, 8).map((t) => (
                    <TableRow key={t.tournamentId}>
                      <TableCell className="pl-4">
                        <span className="font-medium">{t.tournamentName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {t.startDate ?? "—"} · {t.isLocal ? "Local" : "Travel"}
                        </span>
                      </TableCell>
                      <TableCell>{t.coachCount}</TableCell>
                      <TableCell className="pr-4">{t.studentCount}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </section>
      </div>
    </div>
  );
};

const SummaryCard = ({
  label,
  value,
  detail,
  alert = false,
}: {
  label: string;
  value: string;
  detail: string;
  alert?: boolean;
}) => (
  <Card className="flex flex-col gap-1 p-4">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={`text-2xl font-semibold ${alert ? "text-destructive" : "text-foreground"}`}>
      {value}
    </span>
    <span className="text-xs text-muted-foreground">{detail}</span>
  </Card>
);
