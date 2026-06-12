/**
 * Route availability messages to each coach's preferred channel.
 */

import { buildAvailabilityMessage, buildMagicLink } from "./messages";
import { sendAvailabilityEmail } from "./sendEmail";
import { sendAvailabilitySms } from "./sendSms";
import type { CoachContact, DispatchResult, PreferredChannel } from "./types";

export type RequestDispatchInput = {
  coach: CoachContact;
  token: string;
  weekStartDate: string;
  isReminder?: boolean;
};

const resolveChannel = (coach: CoachContact): PreferredChannel => {
  if (coach.preferred_channel === "sms" && coach.phone) return "sms";
  if (coach.preferred_channel === "whatsapp") return "whatsapp";
  if (coach.email) return "email";
  if (coach.phone) return "sms";
  return "email";
};

const resolveRecipient = (coach: CoachContact, channel: PreferredChannel): string | null => {
  if (channel === "email") return coach.email;
  if (channel === "sms" || channel === "whatsapp") return coach.phone;
  return null;
};

/** Send one availability request to the coach via their resolved channel. */
export const dispatchAvailabilityRequest = async (
  input: RequestDispatchInput,
): Promise<DispatchResult> => {
  const channel = resolveChannel(input.coach);
  const recipient = resolveRecipient(input.coach, channel);

  if (!recipient) {
    return {
      coachId: input.coach.id,
      channel,
      ok: false,
      error: `No ${channel} contact on file for ${input.coach.full_name}`,
      skipped: false,
    };
  }

  if (channel === "whatsapp") {
    return {
      coachId: input.coach.id,
      channel,
      ok: false,
      error: "WhatsApp is not enabled yet — set preferred channel to email or SMS",
      skipped: true,
    };
  }

  const magicLink = buildMagicLink(input.token);
  const message = buildAvailabilityMessage({
    fullName: input.coach.full_name,
    weekStartDate: input.weekStartDate,
    magicLink,
    isReminder: input.isReminder,
  });

  const result =
    channel === "email"
      ? await sendAvailabilityEmail(recipient, message)
      : await sendAvailabilitySms(recipient, message.plainText);

  return {
    coachId: input.coach.id,
    channel,
    ...result,
  };
};
