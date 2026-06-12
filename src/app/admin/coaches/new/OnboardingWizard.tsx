"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PreferredChannel } from "@/lib/availability/types";
import { formatTime } from "@/lib/coaches/rules";
import {
  CERTIFICATION_TYPE_LABELS,
  DEFAULT_ONBOARDING_DRAFT,
  SEASON_OPTIONS,
  TITLE_SUGGESTIONS,
  type CertificationDraft,
  type CertificationType,
  type OnboardingDraft,
  type ProgramOption,
} from "@/lib/onboarding/types";
import {
  validateAvailabilityStep,
  validateCertificationsStep,
  validateContactStep,
  validateProfileStep,
} from "@/lib/onboarding/validation";

import { createCoachAction, type OnboardingFormState } from "./actions";

type OnboardingWizardProps = {
  programs: ProgramOption[];
};

const STEPS = [
  { id: 1, label: "Profile" },
  { id: 2, label: "Certifications" },
  { id: 3, label: "Availability" },
  { id: 4, label: "Contact" },
  { id: 5, label: "Review" },
] as const;

const CHANNEL_OPTIONS: Array<{ value: PreferredChannel; label: string }> = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

const inputClassName =
  "rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

const SubmitButton = () => {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="lg">
      {pending ? "Creating coach…" : "Create coach & send invite"}
    </Button>
  );
};

const emptyCertification = (): CertificationDraft => ({
  certificationType: "ptr",
  label: "",
  expiresOn: "",
});

export const OnboardingWizard = ({ programs }: OnboardingWizardProps) => {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<OnboardingDraft>(DEFAULT_ONBOARDING_DRAFT);
  const [stepError, setStepError] = useState<string | null>(null);
  const [state, formAction] = useFormState<OnboardingFormState, FormData>(
    createCoachAction,
    { error: null },
  );

  const handleProfileChange = <K extends keyof OnboardingDraft["profile"]>(
    key: K,
    value: OnboardingDraft["profile"][K],
  ) => {
    setDraft((prev) => ({ ...prev, profile: { ...prev.profile, [key]: value } }));
  };

  const handleAvailabilityToggle = (key: keyof OnboardingDraft["availability"], checked: boolean) => {
    setDraft((prev) => ({
      ...prev,
      availability: { ...prev.availability, [key]: checked },
    }));
  };

  const handleAvailabilityTime = (
    key: "earliest_start" | "latest_end" | "midday_block_start" | "midday_block_end",
    value: string,
  ) => {
    setDraft((prev) => ({
      ...prev,
      availability: { ...prev.availability, [key]: value === "" ? null : value },
    }));
  };

  const handleContactChange = <K extends keyof OnboardingDraft["contact"]>(
    key: K,
    value: OnboardingDraft["contact"][K],
  ) => {
    setDraft((prev) => ({ ...prev, contact: { ...prev.contact, [key]: value } }));
  };

  const handleAddCertification = () => {
    setDraft((prev) => ({
      ...prev,
      certifications: [...prev.certifications, emptyCertification()],
    }));
  };

  const handleRemoveCertification = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      certifications: prev.certifications.filter((_, i) => i !== index),
    }));
  };

  const handleCertificationChange = (
    index: number,
    key: keyof CertificationDraft,
    value: string,
  ) => {
    setDraft((prev) => ({
      ...prev,
      certifications: prev.certifications.map((cert, i) =>
        i === index ? { ...cert, [key]: value } : cert,
      ),
    }));
  };

  const validateCurrentStep = (): string | null => {
    switch (step) {
      case 1:
        return validateProfileStep(draft.profile);
      case 2:
        return validateCertificationsStep(draft.certifications);
      case 3:
        return validateAvailabilityStep(draft.availability);
      case 4:
        return validateContactStep(draft.contact);
      default:
        return null;
    }
  };

  const handleNext = () => {
    const error = validateCurrentStep();
    if (error) {
      setStepError(error);
      return;
    }
    setStepError(null);
    setStep((prev) => Math.min(prev + 1, STEPS.length));
  };

  const handleBack = () => {
    setStepError(null);
    setStep((prev) => Math.max(prev - 1, 1));
  };

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Onboarding progress" className="flex flex-wrap gap-2">
        {STEPS.map((item) => {
          const isActive = item.id === step;
          const isComplete = item.id < step;
          return (
            <Badge
              key={item.id}
              variant={isActive ? "default" : isComplete ? "secondary" : "outline"}
              className="text-xs"
            >
              {item.id}. {item.label}
            </Badge>
          );
        })}
      </nav>

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>Basic identity and program assignment.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Full name</span>
              <input
                type="text"
                value={draft.profile.fullName}
                onChange={(event) => handleProfileChange("fullName", event.target.value)}
                className={inputClassName}
                autoComplete="name"
                required
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Initials</span>
              <input
                type="text"
                value={draft.profile.initials}
                onChange={(event) => handleProfileChange("initials", event.target.value)}
                className={inputClassName}
                placeholder="Auto-generated if blank"
                maxLength={4}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Role / title</span>
              <input
                type="text"
                list="title-suggestions"
                value={draft.profile.title}
                onChange={(event) => handleProfileChange("title", event.target.value)}
                className={inputClassName}
                required
              />
              <datalist id="title-suggestions">
                {TITLE_SUGGESTIONS.map((title) => (
                  <option key={title} value={title} />
                ))}
              </datalist>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Primary program</span>
              <select
                value={draft.profile.primaryProgramId}
                onChange={(event) => handleProfileChange("primaryProgramId", event.target.value)}
                className={inputClassName}
              >
                <option value="">None</option>
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Season</span>
              <select
                value={draft.profile.season}
                onChange={(event) =>
                  handleProfileChange("season", event.target.value as OnboardingDraft["profile"]["season"])
                }
                className={inputClassName}
              >
                {SEASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Season start</span>
                <input
                  type="date"
                  value={draft.profile.seasonStart}
                  onChange={(event) => handleProfileChange("seasonStart", event.target.value)}
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Season end</span>
                <input
                  type="date"
                  value={draft.profile.seasonEnd}
                  onChange={(event) => handleProfileChange("seasonEnd", event.target.value)}
                  className={inputClassName}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Onboarding start date</span>
              <input
                type="date"
                value={draft.profile.onboardingStartDate}
                onChange={(event) => handleProfileChange("onboardingStartDate", event.target.value)}
                className={inputClassName}
                required
              />
            </label>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Certifications</CardTitle>
            <CardDescription>Optional coaching credentials and expiry dates.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {draft.certifications.length === 0 ? (
              <p className="text-sm text-muted-foreground">No certifications added yet.</p>
            ) : null}

            {draft.certifications.map((cert, index) => (
              <div
                key={`cert-${index}`}
                className="flex flex-col gap-3 rounded-md border border-border p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">Certification {index + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveCertification(index)}
                    aria-label={`Remove certification ${index + 1}`}
                  >
                    Remove
                  </Button>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-foreground">Type</span>
                  <select
                    value={cert.certificationType}
                    onChange={(event) =>
                      handleCertificationChange(
                        index,
                        "certificationType",
                        event.target.value as CertificationType,
                      )
                    }
                    className={inputClassName}
                  >
                    {Object.entries(CERTIFICATION_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                {cert.certificationType === "other" ? (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-foreground">Label</span>
                    <input
                      type="text"
                      value={cert.label}
                      onChange={(event) => handleCertificationChange(index, "label", event.target.value)}
                      className={inputClassName}
                    />
                  </label>
                ) : null}

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-foreground">Expires on</span>
                  <input
                    type="date"
                    value={cert.expiresOn}
                    onChange={(event) => handleCertificationChange(index, "expiresOn", event.target.value)}
                    className={inputClassName}
                  />
                </label>
              </div>
            ))}

            <Button type="button" variant="outline" size="sm" onClick={handleAddCertification}>
              Add certification
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Default availability &amp; hours</CardTitle>
            <CardDescription>Scheduling constraints and contracted weekly hours.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Earliest start</span>
                <input
                  type="time"
                  value={draft.availability.earliest_start ?? ""}
                  onChange={(event) => handleAvailabilityTime("earliest_start", event.target.value)}
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Latest end</span>
                <input
                  type="time"
                  value={draft.availability.latest_end ?? ""}
                  onChange={(event) => handleAvailabilityTime("latest_end", event.target.value)}
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Midday block start</span>
                <input
                  type="time"
                  value={draft.availability.midday_block_start ?? ""}
                  onChange={(event) => handleAvailabilityTime("midday_block_start", event.target.value)}
                  className={inputClassName}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Midday block end</span>
                <input
                  type="time"
                  value={draft.availability.midday_block_end ?? ""}
                  onChange={(event) => handleAvailabilityTime("midday_block_end", event.target.value)}
                  className={inputClassName}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Contracted weekly hours</span>
              <input
                type="number"
                min={0}
                max={60}
                step={0.5}
                value={draft.availability.contractedWeeklyHours ?? ""}
                onChange={(event) => {
                  const raw = event.target.value;
                  setDraft((prev) => ({
                    ...prev,
                    availability: {
                      ...prev.availability,
                      contractedWeeklyHours: raw === "" ? null : Number(raw),
                    },
                  }));
                }}
                className={inputClassName}
                placeholder="Leave blank to use title default"
              />
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">Restrictions</span>
              {(
                [
                  { key: "no_camp" as const, label: "No camp assignments" },
                  { key: "no_bt" as const, label: "No BT assignments" },
                  { key: "no_drive" as const, label: "No driving assignments" },
                  { key: "travel_restricted" as const, label: "No travel outside Bradenton" },
                  { key: "adults_only" as const, label: "Adults program only" },
                ] as const
              ).map((rule) => (
                <label
                  key={rule.key}
                  className="flex cursor-pointer items-center justify-between gap-4 rounded-md border border-border p-3"
                >
                  <span className="text-sm text-foreground">{rule.label}</span>
                  <input
                    type="checkbox"
                    checked={draft.availability[rule.key]}
                    onChange={(event) => handleAvailabilityToggle(rule.key, event.target.checked)}
                    className="size-4 rounded border-border text-primary focus:ring-ring"
                  />
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact &amp; notifications</CardTitle>
            <CardDescription>Login invite and weekly availability delivery.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Email</span>
              <input
                type="email"
                value={draft.contact.email}
                onChange={(event) => handleContactChange("email", event.target.value)}
                className={inputClassName}
                autoComplete="email"
                required
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Phone (SMS)</span>
              <input
                type="tel"
                value={draft.contact.phone}
                onChange={(event) => handleContactChange("phone", event.target.value)}
                className={inputClassName}
                autoComplete="tel"
                placeholder="+1 555 555 5555"
              />
            </label>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-foreground">Preferred channel</legend>
              <div className="flex flex-wrap gap-3">
                {CHANNEL_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
                  >
                    <input
                      type="radio"
                      name="preferred_channel"
                      value={option.value}
                      checked={draft.contact.preferredChannel === option.value}
                      onChange={() => handleContactChange("preferredChannel", option.value)}
                      className="size-4 border-border text-primary focus:ring-ring"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </CardContent>
        </Card>
      ) : null}

      {step === 5 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review &amp; submit</CardTitle>
            <CardDescription>Confirm details before creating the coach profile.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <section>
              <h3 className="font-medium text-foreground">Profile</h3>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>{draft.profile.fullName}</li>
                <li>{draft.profile.title}</li>
                <li>Season: {SEASON_OPTIONS.find((s) => s.value === draft.profile.season)?.label}</li>
                <li>Onboarding starts: {draft.profile.onboardingStartDate}</li>
              </ul>
            </section>

            <section>
              <h3 className="font-medium text-foreground">Certifications</h3>
              {draft.certifications.length === 0 ? (
                <p className="text-muted-foreground">None</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {draft.certifications.map((cert, index) => (
                    <li key={`review-cert-${index}`}>
                      {CERTIFICATION_TYPE_LABELS[cert.certificationType]}
                      {cert.expiresOn ? ` · expires ${cert.expiresOn}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="font-medium text-foreground">Availability</h3>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>
                  Hours: {formatTime(draft.availability.earliest_start)} –{" "}
                  {formatTime(draft.availability.latest_end)}
                </li>
                <li>
                  Contracted:{" "}
                  {draft.availability.contractedWeeklyHours != null
                    ? `${draft.availability.contractedWeeklyHours} hrs/week`
                    : "Title default"}
                </li>
              </ul>
            </section>

            <section>
              <h3 className="font-medium text-foreground">Contact</h3>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>{draft.contact.email}</li>
                <li>{draft.contact.phone || "No phone"}</li>
                <li>Channel: {draft.contact.preferredChannel}</li>
              </ul>
            </section>

            <form action={formAction} className="flex flex-col gap-3 pt-2">
              <input type="hidden" name="draft" value={JSON.stringify(draft)} />
              {state.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {state.error}
                </p>
              ) : null}
              <SubmitButton />
            </form>
          </CardContent>
        </Card>
      ) : null}

      {stepError ? (
        <p role="alert" className="text-sm text-destructive">
          {stepError}
        </p>
      ) : null}

      {step < 5 ? (
        <div className="flex justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            disabled={step === 1}
            aria-label="Previous step"
          >
            Back
          </Button>
          <Button type="button" onClick={handleNext} aria-label="Next step">
            Next
          </Button>
        </div>
      ) : (
        <div className="flex justify-start">
          <Button type="button" variant="outline" onClick={handleBack} aria-label="Previous step">
            Back
          </Button>
        </div>
      )}
    </div>
  );
};
