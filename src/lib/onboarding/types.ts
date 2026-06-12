/**
 * Staff onboarding wizard — shared types (no React / Supabase imports).
 */

import type { PreferredChannel } from "@/lib/availability/types";
import type { EditableRules } from "@/lib/coaches/rules";

export type CoachSeason = "year_round" | "summer_only" | "tbd";

export type CertificationType =
  | "ptr"
  | "uspta"
  | "itf"
  | "cpr_first_aid"
  | "safesport"
  | "other";

export type CertificationDraft = {
  certificationType: CertificationType;
  label: string;
  expiresOn: string;
};

export type ProfileDraft = {
  fullName: string;
  initials: string;
  title: string;
  primaryProgramId: string;
  season: CoachSeason;
  seasonStart: string;
  seasonEnd: string;
  onboardingStartDate: string;
};

export type AvailabilityDraft = EditableRules & {
  contractedWeeklyHours: number | null;
};

export type ContactDraft = {
  email: string;
  phone: string;
  preferredChannel: PreferredChannel;
};

export type OnboardingDraft = {
  profile: ProfileDraft;
  certifications: CertificationDraft[];
  availability: AvailabilityDraft;
  contact: ContactDraft;
};

export type ProgramOption = {
  id: string;
  name: string;
};

export type CreateCoachResult = {
  coachId: string;
  inviteSent: boolean;
  inviteError: string | null;
  welcomeWarnings: string[];
};

export const CERTIFICATION_TYPE_LABELS: Record<CertificationType, string> = {
  ptr: "PTR",
  uspta: "USPTA",
  itf: "ITF",
  cpr_first_aid: "CPR / First Aid",
  safesport: "SafeSport",
  other: "Other",
};

export const SEASON_OPTIONS: ReadonlyArray<{ value: CoachSeason; label: string }> = [
  { value: "year_round", label: "Year-round" },
  { value: "summer_only", label: "Summer only" },
  { value: "tbd", label: "TBD" },
];

export const TITLE_SUGGESTIONS: ReadonlyArray<string> = [
  "Director",
  "Operations Coordinator",
  "Senior Head Coach",
  "Head Coach",
  "Senior Assistant Coach",
  "Assistant Coach",
  "Camp Lead",
  "Camp Director",
  "Performance Analyst",
];

export const DEFAULT_PROFILE_DRAFT = (): ProfileDraft => ({
  fullName: "",
  initials: "",
  title: "",
  primaryProgramId: "",
  season: "year_round",
  seasonStart: "",
  seasonEnd: "",
  onboardingStartDate: new Date().toISOString().slice(0, 10),
});

export const DEFAULT_AVAILABILITY_DRAFT = (): AvailabilityDraft => ({
  no_camp: false,
  no_bt: false,
  no_drive: false,
  travel_restricted: false,
  adults_only: false,
  earliest_start: null,
  latest_end: null,
  midday_block_start: null,
  midday_block_end: null,
  contractedWeeklyHours: null,
});

export const DEFAULT_CONTACT_DRAFT = (): ContactDraft => ({
  email: "",
  phone: "",
  preferredChannel: "email",
});

export const DEFAULT_ONBOARDING_DRAFT = (): OnboardingDraft => ({
  profile: DEFAULT_PROFILE_DRAFT(),
  certifications: [],
  availability: DEFAULT_AVAILABILITY_DRAFT(),
  contact: DEFAULT_CONTACT_DRAFT(),
});
