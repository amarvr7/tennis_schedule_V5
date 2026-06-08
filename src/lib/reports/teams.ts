/**
 * Microsoft Teams channel posting via Incoming Webhook or Power Automate URL.
 * Set TEAMS_REPORTS_WEBHOOK_URL in environment to enable automated posts.
 */

import { weeklyReportToHtml } from "./format";
import type { WeeklyReportSummary } from "./types";

export type TeamsPostResult = {
  ok: boolean;
  error: string | null;
  skipped: boolean;
};

const buildAdaptiveCard = (report: WeeklyReportSummary) => ({
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions",
  summary: `Weekly Report — ${report.weekLabel}`,
  themeColor: "0057B8",
  title: `IMG Academy Tennis — ${report.weekLabel}`,
  sections: [
    {
      activityTitle: "Schedule Coverage",
      facts: [
        { name: "Staffed", value: `${report.coverage.staffedSessions} sessions` },
        { name: "Total", value: `${report.coverage.totalSessions} sessions` },
        { name: "Coverage", value: `${report.coverage.coveragePct}%` },
        { name: "Gaps", value: String(report.coverage.gapCount) },
      ],
    },
    {
      activityTitle: "Top Coach Hours",
      text: report.coachHours
        .slice(0, 5)
        .map(
          (c) =>
            `**${c.fullName}** — ${Math.round(c.totalMinutes / 60)}h (${c.sessionCount} sessions)`,
        )
        .join("\n\n") || "_No published assignments_",
    },
    {
      activityTitle: "Tournament Travel",
      text: report.tournamentRosters
        .slice(0, 5)
        .map((t) => `**${t.tournamentName}** — ${t.coachCount} coaches`)
        .join("\n\n") || "_No tournaments this period_",
    },
  ],
});

/** Post weekly summary to Teams. No-ops when webhook URL is unset. */
export const postWeeklySummaryToTeams = async (
  report: WeeklyReportSummary,
  webhookUrl?: string,
): Promise<TeamsPostResult> => {
  const url = webhookUrl ?? process.env.TEAMS_REPORTS_WEBHOOK_URL;
  if (!url) {
    return { ok: true, error: null, skipped: true };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildAdaptiveCard(report)),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        error: `Teams webhook returned ${response.status}: ${text}`,
        skipped: false,
      };
    }

    return { ok: true, error: null, skipped: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message, skipped: false };
  }
};

/** Plain HTML variant for email-style connectors. */
export const buildTeamsHtmlPayload = (report: WeeklyReportSummary): string =>
  weeklyReportToHtml(report);
