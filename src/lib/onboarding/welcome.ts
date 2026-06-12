/**
 * Welcome message for newly onboarded coaches — SMS + email.
 */

import { getAppBaseUrl } from "@/lib/availability/messages";
import { sendAvailabilityEmail } from "@/lib/availability/sendEmail";
import { sendAvailabilitySms } from "@/lib/availability/sendSms";

export type WelcomeMessageInput = {
  fullName: string;
  email: string;
  phone: string | null;
};

export type WelcomeSendResult = {
  warnings: string[];
};

const firstName = (fullName: string): string => fullName.trim().split(/\s+/)[0] ?? fullName;

const buildWelcomeCopy = (input: WelcomeMessageInput) => {
  const name = firstName(input.fullName);
  const appUrl = getAppBaseUrl();
  const subject = "Welcome to IMG Academy Tennis Scheduling";

  const plainText = [
    `Hi ${name}, welcome to the IMG Academy Tennis scheduling team.`,
    "",
    "Your profile has been set up. Check your inbox for a separate login invite, then sign in here:",
    appUrl,
    "",
    "You'll receive weekly availability requests through your preferred channel.",
    "Contact Tennis Operations if you need help getting started.",
    "",
    "IMG Academy Tennis",
  ].join("\n");

  const html = `
    <p>Hi ${name}, welcome to the <strong>IMG Academy Tennis</strong> scheduling team.</p>
    <p>Your profile has been set up. Check your inbox for a separate login invite, then sign in:</p>
    <p><a href="${appUrl}" style="color:#0057B8;font-weight:600;">Open the scheduling app</a></p>
    <p style="color:#666;font-size:14px;">You'll receive weekly availability requests through your preferred channel. Contact Tennis Operations if you need help getting started.</p>
    <p style="color:#666;font-size:12px;">IMG Academy Tennis</p>
  `.trim();

  return { subject, plainText, html };
};

/** Send welcome SMS and email. Failures are collected as warnings, not thrown. */
export const sendWelcomeMessage = async (input: WelcomeMessageInput): Promise<WelcomeSendResult> => {
  const warnings: string[] = [];
  const copy = buildWelcomeCopy(input);

  const emailResult = await sendAvailabilityEmail(input.email, {
    subject: copy.subject,
    plainText: copy.plainText,
    html: copy.html,
  });

  if (emailResult.skipped) {
    warnings.push("Welcome email skipped (Microsoft Graph not configured).");
  } else if (!emailResult.ok) {
    warnings.push(`Welcome email failed: ${emailResult.error ?? "Unknown error"}`);
  }

  if (input.phone) {
    const smsResult = await sendAvailabilitySms(input.phone, copy.plainText);
    if (smsResult.skipped) {
      warnings.push("Welcome SMS skipped (Twilio not configured).");
    } else if (!smsResult.ok) {
      warnings.push(`Welcome SMS failed: ${smsResult.error ?? "Unknown error"}`);
    }
  }

  return { warnings };
};
