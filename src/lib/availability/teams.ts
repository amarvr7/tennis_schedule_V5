/**
 * Microsoft Teams completion report when an availability collection closes.
 */

import type { CollectionSummary } from "./types";

export type TeamsPostResult = {
  ok: boolean;
  error: string | null;
  skipped: boolean;
};

const buildCollectionCard = (summary: CollectionSummary) => ({
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions",
  summary: `Availability Collection — ${summary.weekLabel}`,
  themeColor: "0057B8",
  title: `IMG Academy Tennis — Availability Closed`,
  sections: [
    {
      activityTitle: `Week of ${summary.weekLabel}`,
      facts: [
        { name: "Responded", value: `${summary.responded} of ${summary.total}` },
        { name: "Response rate", value: `${summary.responseRatePct}%` },
        { name: "No response", value: String(summary.noResponse) },
        { name: "Still pending at close", value: String(summary.pending) },
      ],
    },
    {
      activityTitle: "Non-responders",
      text:
        summary.nonResponders.length > 0
          ? summary.nonResponders.map((name) => `**${name}**`).join("\n\n")
          : "_Everyone responded_",
    },
  ],
});

/** Post collection close summary to Teams. No-ops when webhook URL is unset. */
export const postCollectionSummaryToTeams = async (
  summary: CollectionSummary,
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
      body: JSON.stringify(buildCollectionCard(summary)),
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
