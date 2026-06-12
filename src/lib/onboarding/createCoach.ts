/**
 * Staff onboarding — create coach profile, certifications, rules, auth invite, welcome.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getAppBaseUrl } from "@/lib/availability/messages";
import { diffRules, toCoachColumns, type EditableRules } from "@/lib/coaches/rules";
import { createServiceClient } from "@/lib/supabase/service";

import type { CreateCoachResult, OnboardingDraft } from "./types";
import { validateOnboardingDraft } from "./validation";
import { sendWelcomeMessage } from "./welcome";

const DEFAULT_RULES: EditableRules = {
  no_camp: false,
  no_bt: false,
  no_drive: false,
  travel_restricted: false,
  adults_only: false,
  earliest_start: null,
  latest_end: null,
  midday_block_start: null,
  midday_block_end: null,
};

const today = (): string => new Date().toISOString().slice(0, 10);

const deriveInitials = (fullName: string, provided: string): string => {
  const trimmed = provided.trim();
  if (trimmed) return trimmed.toUpperCase().slice(0, 4);

  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
};

const seedInitialRules = async (
  supabase: SupabaseClient,
  coachId: string,
  rules: EditableRules,
  effectiveDate: string,
): Promise<string | null> => {
  const changes = diffRules(DEFAULT_RULES, rules);
  if (changes.length === 0) return null;

  for (const change of changes) {
    const { error } = await supabase.from("coach_rules").insert({
      coach_id: coachId,
      rule_type: change.ruleType,
      priority: change.priority,
      value: change.nextValue,
      effective_from: effectiveDate,
      effective_to: null,
    });

    if (error) return `Could not seed rule "${change.label}": ${error.message}`;
  }

  return null;
};

/** Create a new coach from a validated onboarding draft. */
export const createCoachFromDraft = async (
  supabase: SupabaseClient,
  draft: OnboardingDraft,
): Promise<CreateCoachResult> => {
  const validationError = validateOnboardingDraft(draft);
  if (validationError) {
    throw new Error(validationError);
  }

  const { profile, certifications, availability, contact } = draft;
  const effectiveDate = today();
  const email = contact.email.trim();
  const phone = contact.phone.trim() || null;

  const ruleColumns = toCoachColumns(availability);

  const { data: coachRow, error: insertError } = await supabase
    .from("coaches")
    .insert({
      full_name: profile.fullName.trim(),
      initials: deriveInitials(profile.fullName, profile.initials) || null,
      title: profile.title.trim(),
      primary_program_id: profile.primaryProgramId || null,
      season: profile.season,
      season_start: profile.seasonStart || null,
      season_end: profile.seasonEnd || null,
      onboarding_status: "orientation",
      onboarding_start_date: profile.onboardingStartDate,
      is_active: true,
      is_admin: false,
      email,
      phone,
      preferred_channel: contact.preferredChannel,
      contracted_weekly_hours: availability.contractedWeeklyHours,
      ...ruleColumns,
    })
    .select("id, created_at")
    .single();

  if (insertError || !coachRow) {
    throw new Error(insertError?.message ?? "Could not create coach.");
  }

  const coachId = coachRow.id as string;

  if (certifications.length > 0) {
    const certRows = certifications.map((cert) => ({
      coach_id: coachId,
      certification_type: cert.certificationType,
      label: cert.label.trim() || null,
      expires_on: cert.expiresOn || null,
    }));

    const { error: certError } = await supabase.from("coach_certifications").insert(certRows);
    if (certError) {
      throw new Error(`Coach created but certifications failed: ${certError.message}`);
    }
  }

  const rulesError = await seedInitialRules(
    supabase,
    coachId,
    {
      no_camp: availability.no_camp,
      no_bt: availability.no_bt,
      no_drive: availability.no_drive,
      travel_restricted: availability.travel_restricted,
      adults_only: availability.adults_only,
      earliest_start: availability.earliest_start,
      latest_end: availability.latest_end,
      midday_block_start: availability.midday_block_start,
      midday_block_end: availability.midday_block_end,
    },
    effectiveDate,
  );

  if (rulesError) {
    throw new Error(rulesError);
  }

  let inviteSent = false;
  let inviteError: string | null = null;

  try {
    const service = createServiceClient();
    const { data: inviteData, error: inviteErr } = await service.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${getAppBaseUrl()}/auth/callback`,
    });

    if (inviteErr) {
      inviteError = inviteErr.message;
    } else if (inviteData.user?.id) {
      const { error: linkError } = await supabase
        .from("coaches")
        .update({ auth_user_id: inviteData.user.id })
        .eq("id", coachId);

      if (linkError) {
        inviteError = `Invite sent but could not link auth user: ${linkError.message}`;
      } else {
        inviteSent = true;
      }
    } else {
      inviteError = "Invite succeeded but no user id was returned.";
    }
  } catch (err) {
    inviteError = err instanceof Error ? err.message : "Could not send auth invite.";
  }

  const welcome = await sendWelcomeMessage({
    fullName: profile.fullName.trim(),
    email,
    phone,
  });

  const welcomeWarnings = [...welcome.warnings];
  if (inviteError) {
    welcomeWarnings.unshift(`Auth invite: ${inviteError}`);
  }

  return {
    coachId,
    inviteSent,
    inviteError,
    welcomeWarnings,
  };
};
