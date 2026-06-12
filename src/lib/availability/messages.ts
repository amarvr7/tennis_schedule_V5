/**
 * Personalized availability request copy for email and SMS.
 */

import { formatWeekRange } from "@/lib/schedule/grid";

export type AvailabilityMessage = {
  subject: string;
  plainText: string;
  html: string;
};

const firstName = (fullName: string): string => fullName.trim().split(/\s+/)[0] ?? fullName;

/** Build subject + body for an availability request or reminder. */
export const buildAvailabilityMessage = (input: {
  fullName: string;
  weekStartDate: string;
  magicLink: string;
  isReminder?: boolean;
}): AvailabilityMessage => {
  const name = firstName(input.fullName);
  const weekLabel = formatWeekRange(input.weekStartDate);
  const subject = input.isReminder
    ? `Reminder: submit availability — week of ${weekLabel}`
    : `Submit your availability — week of ${weekLabel}`;

  const intro = input.isReminder
    ? `Hi ${name}, this is a reminder to submit your availability for the week of ${weekLabel}.`
    : `Hi ${name}, please submit your availability for the week of ${weekLabel}.`;

  const plainText = [
    intro,
    "",
    "Tap the link below to mark each day as available, PTO, or traveling:",
    input.magicLink,
    "",
    "The collection window closes Thursday. Contact Tennis Operations if you need help.",
    "",
    "IMG Academy Tennis",
  ].join("\n");

  const html = `
    <p>${intro}</p>
    <p>Mark each day as <strong>available</strong>, <strong>PTO</strong>, or <strong>traveling</strong>:</p>
    <p><a href="${input.magicLink}" style="color:#0057B8;font-weight:600;">Submit availability</a></p>
    <p style="color:#666;font-size:14px;">The collection window closes Thursday. Contact Tennis Operations if you need help.</p>
    <p style="color:#666;font-size:12px;">IMG Academy Tennis</p>
  `.trim();

  return { subject, plainText, html };
};

/** Resolve the public app base URL for magic links. */
export const getAppBaseUrl = (): string => {
  const explicit = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
};

export const buildMagicLink = (token: string): string =>
  `${getAppBaseUrl()}/availability/${token}`;
