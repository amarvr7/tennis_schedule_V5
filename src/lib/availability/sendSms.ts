/**
 * Twilio SMS for availability requests (plain fetch, no SDK).
 * No-ops with skipped: true when Twilio credentials are unset.
 */

import type { ChannelSendResult } from "./types";

const getTwilioConfig = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return null;
  }

  return { accountSid, authToken, fromNumber };
};

/** Send an availability SMS via Twilio REST API. */
export const sendAvailabilitySms = async (
  to: string,
  body: string,
): Promise<ChannelSendResult> => {
  const config = getTwilioConfig();
  if (!config) {
    return { ok: true, error: null, skipped: true };
  }

  const normalizedTo = to.replace(/\s/g, "");
  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: normalizedTo,
          From: config.fromNumber,
          Body: body,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        error: `Twilio returned ${response.status}: ${text}`,
        skipped: false,
      };
    }

    return { ok: true, error: null, skipped: false };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: errorMessage, skipped: false };
  }
};
