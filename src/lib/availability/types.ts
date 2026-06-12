/**
 * Weekly availability collection — shared types (no React / Supabase imports).
 */

import type { AvailabilityStatus } from "@/lib/conflicts";
import type { DayOfWeek } from "@/lib/conflicts";

export type PreferredChannel = "email" | "sms" | "whatsapp";

export type CollectionStatus = "open" | "closed";

export type RequestStatus = "pending" | "responded" | "no_response";

export type ChannelSendResult = {
  ok: boolean;
  error: string | null;
  skipped: boolean;
};

export type DispatchResult = ChannelSendResult & {
  coachId: string;
  channel: PreferredChannel;
};

export type CoachContact = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  preferred_channel: PreferredChannel;
  season: string;
  is_active: boolean;
};

export type AvailabilityCollection = {
  id: string;
  week_start_date: string;
  status: CollectionStatus;
  opened_at: string;
  closed_at: string | null;
};

export type AvailabilityRequest = {
  id: string;
  collection_id: string;
  coach_id: string;
  channel: PreferredChannel;
  token: string;
  sent_at: string | null;
  reminder_count: number;
  last_reminded_at: string | null;
  responded_at: string | null;
  status: RequestStatus;
};

export type AvailabilityRequestRow = AvailabilityRequest & {
  coach: Pick<CoachContact, "full_name" | "email" | "phone" | "preferred_channel">;
};

export type DayAvailabilityInput = {
  dayOfWeek: DayOfWeek;
  status: AvailabilityStatus;
};

export type CollectionSummary = {
  collectionId: string;
  weekStartDate: string;
  weekLabel: string;
  status: CollectionStatus;
  total: number;
  responded: number;
  pending: number;
  noResponse: number;
  responseRatePct: number;
  nonResponders: string[];
};

export const AVAILABILITY_DAYS: ReadonlyArray<{ key: DayOfWeek; label: string; short: string }> = [
  { key: "monday", label: "Monday", short: "Mon" },
  { key: "tuesday", label: "Tuesday", short: "Tue" },
  { key: "wednesday", label: "Wednesday", short: "Wed" },
  { key: "thursday", label: "Thursday", short: "Thu" },
  { key: "friday", label: "Friday", short: "Fri" },
  { key: "saturday", label: "Saturday", short: "Sat" },
  { key: "sunday", label: "Sunday", short: "Sun" },
];

export const CHANNEL_LABELS: Record<PreferredChannel, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: "Pending",
  responded: "Responded",
  no_response: "No response",
};
