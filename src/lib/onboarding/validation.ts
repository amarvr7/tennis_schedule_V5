/**
 * Staff onboarding wizard — per-step validation (manual, no zod).
 */

import { normalizeTime } from "@/lib/coaches/rules";

import type {
  AvailabilityDraft,
  CertificationDraft,
  ContactDraft,
  OnboardingDraft,
  ProfileDraft,
} from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const today = (): string => new Date().toISOString().slice(0, 10);

const parseTimeMinutes = (value: string | null): number | null => {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

const validateTimeOrder = (
  start: string | null,
  end: string | null,
  startLabel: string,
  endLabel: string,
): string | null => {
  const startMinutes = parseTimeMinutes(start);
  const endMinutes = parseTimeMinutes(end);
  if (startMinutes === null || endMinutes === null) return null;
  if (startMinutes >= endMinutes) {
    return `${startLabel} must be before ${endLabel}.`;
  }
  return null;
};

/** Step 1 — profile fields. */
export const validateProfileStep = (profile: ProfileDraft): string | null => {
  if (!profile.fullName.trim()) return "Full name is required.";
  if (!profile.title.trim()) return "Role / title is required.";
  if (!profile.onboardingStartDate) return "Onboarding start date is required.";

  if (profile.seasonStart && profile.seasonEnd && profile.seasonStart > profile.seasonEnd) {
    return "Season start must be on or before season end.";
  }

  return null;
};

/** Step 2 — certifications (optional rows, but each row must be valid). */
export const validateCertificationsStep = (certifications: CertificationDraft[]): string | null => {
  const todayStr = today();

  for (const [index, cert] of certifications.entries()) {
    if (!cert.certificationType) {
      return `Certification ${index + 1}: type is required.`;
    }

    if (cert.certificationType === "other" && !cert.label.trim()) {
      return `Certification ${index + 1}: label is required for "Other".`;
    }

    if (cert.expiresOn && cert.expiresOn < todayStr) {
      return `Certification ${index + 1}: expiry date cannot be in the past.`;
    }
  }

  return null;
};

/** Step 3 — default availability and contracted hours. */
export const validateAvailabilityStep = (availability: AvailabilityDraft): string | null => {
  const earliestLatest = validateTimeOrder(
    availability.earliest_start,
    availability.latest_end,
    "Earliest start",
    "Latest end",
  );
  if (earliestLatest) return earliestLatest;

  const midday = validateTimeOrder(
    availability.midday_block_start,
    availability.midday_block_end,
    "Midday block start",
    "Midday block end",
  );
  if (midday) return midday;

  if (availability.contractedWeeklyHours != null) {
    if (Number.isNaN(availability.contractedWeeklyHours)) {
      return "Contracted weekly hours must be a number.";
    }
    if (availability.contractedWeeklyHours < 0 || availability.contractedWeeklyHours > 60) {
      return "Contracted weekly hours must be between 0 and 60.";
    }
  }

  return null;
};

/** Step 4 — contact and notification preferences. */
export const validateContactStep = (contact: ContactDraft): string | null => {
  const email = contact.email.trim();
  if (!email) return "Email is required for the login invite.";
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address.";

  if (contact.preferredChannel === "sms" && !contact.phone.trim()) {
    return "Phone is required when SMS is the preferred channel.";
  }

  return null;
};

/** Full draft validation before database write. */
export const validateOnboardingDraft = (draft: OnboardingDraft): string | null =>
  validateProfileStep(draft.profile) ??
  validateCertificationsStep(draft.certifications) ??
  validateAvailabilityStep(draft.availability) ??
  validateContactStep(draft.contact);
