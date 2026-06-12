/**
 * Microsoft Graph sendMail for availability requests.
 * No-ops with skipped: true when Graph credentials are unset.
 */

import type { AvailabilityMessage } from "./messages";
import type { ChannelSendResult } from "./types";

type GraphTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

const getGraphConfig = () => {
  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  const sender = process.env.MS_GRAPH_SENDER;

  if (!tenantId || !clientId || !clientSecret || !sender) {
    return null;
  }

  return { tenantId, clientId, clientSecret, sender };
};

const fetchAccessToken = async (config: NonNullable<ReturnType<typeof getGraphConfig>>): Promise<string> => {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.value;
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  const data = (await response.json()) as GraphTokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? "Failed to obtain Graph token");
  }

  cachedToken = { value: data.access_token, expiresAt: now + 3_500_000 };
  return data.access_token;
};

/** Send an availability email via Microsoft Graph. */
export const sendAvailabilityEmail = async (
  to: string,
  message: AvailabilityMessage,
): Promise<ChannelSendResult> => {
  const config = getGraphConfig();
  if (!config) {
    return { ok: true, error: null, skipped: true };
  }

  try {
    const token = await fetchAccessToken(config);
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.sender)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject: message.subject,
            body: { contentType: "HTML", content: message.html },
            toRecipients: [{ emailAddress: { address: to } }],
          },
          saveToSentItems: false,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        error: `Graph sendMail returned ${response.status}: ${text}`,
        skipped: false,
      };
    }

    return { ok: true, error: null, skipped: false };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: errorMessage, skipped: false };
  }
};
