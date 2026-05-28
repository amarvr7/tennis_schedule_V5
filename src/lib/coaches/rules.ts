/**
 * Coach rules — pure, framework-free domain logic shared by the list page, the
 * detail page, and the update Server Action. No React, Next, or Supabase here.
 *
 * Model: the *current* state of every rule lives as denormalized columns on the
 * `coaches` row (fast to list/read). The `coach_rules` table is the historical
 * ledger. On every change we close the old rule with an end date and write the
 * new one with a start date (CURSOR_CONTEXT.md "Historical records").
 */

export type CoachRecord = {
  id: string;
  full_name: string;
  initials: string | null;
  title: string | null;
  season: string;
  season_start: string | null;
  season_end: string | null;
  earliest_start: string | null;
  latest_end: string | null;
  midday_block_start: string | null;
  midday_block_end: string | null;
  no_camp: boolean;
  no_bt: boolean;
  no_drive: boolean;
  travel_restricted: boolean;
  program_restriction: string | null;
  is_admin: boolean;
  is_active: boolean;
  onboarding_status: string | null;
  created_at: string;
};

/** Subset of `coaches` columns needed to render the roster list. */
export type CoachListItem = Pick<
  CoachRecord,
  "id" | "full_name" | "initials" | "title" | "no_camp" | "no_bt" | "no_drive" | "is_active" | "season"
>;

/** A single row from the `coach_rules` historical ledger. */
export type CoachRuleHistory = {
  id: string;
  rule_type: string;
  priority: string;
  value: string | null;
  effective_from: string | null;
  effective_to: string | null;
  notes: string | null;
  created_at: string;
};

/** The editable shape the form works with — flat and serializable. */
export type EditableRules = {
  no_camp: boolean;
  no_bt: boolean;
  no_drive: boolean;
  travel_restricted: boolean;
  adults_only: boolean;
  earliest_start: string | null;
  latest_end: string | null;
  midday_block_start: string | null;
  midday_block_end: string | null;
};

export type RulePriority = "hard" | "soft" | "system";

/** A computed difference between the current and next rule state. */
export type RuleChange = {
  ruleType: string;
  label: string;
  priority: RulePriority;
  previousValue: string | null;
  nextValue: string | null;
};

/** Boolean flags surfaced as badges on the roster list. */
export const FLAG_RULES = [
  { key: "no_camp", label: "No Camp" },
  { key: "no_bt", label: "No BT" },
  { key: "no_drive", label: "No Drive" },
] as const satisfies ReadonlyArray<{ key: keyof EditableRules; label: string }>;

/** Human-readable label for each `coach_rules.rule_type`. */
export const RULE_LABELS: Record<string, string> = {
  no_camp: "No Camp",
  no_bt: "No BT",
  no_drive: "No Driving",
  travel_restricted: "No Travel Outside Bradenton",
  program_restriction: "Adults Only",
  earliest_start: "Earliest Start",
  latest_end: "Latest End",
  midday_block: "Midday Block",
};

/** Strip a `time` value (e.g. "12:00:00" or "12:00") down to "HH:MM", or null. */
export const normalizeTime = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [hours, minutes] = trimmed.split(":");
  if (hours === undefined || minutes === undefined) return null;
  return `${hours.padStart(2, "0")}:${minutes.slice(0, 2)}`;
};

/** Format "HH:MM" as a 12-hour label for display, or an em dash when empty. */
export const formatTime = (value: string | null | undefined): string => {
  const normalized = normalizeTime(value);
  if (!normalized) return "—";
  const [hourStr, minuteStr] = normalized.split(":");
  const hour = Number(hourStr);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minuteStr} ${suffix}`;
};

export const toEditableRules = (coach: CoachRecord): EditableRules => ({
  no_camp: coach.no_camp,
  no_bt: coach.no_bt,
  no_drive: coach.no_drive,
  travel_restricted: coach.travel_restricted,
  adults_only: coach.program_restriction === "adults_only",
  earliest_start: normalizeTime(coach.earliest_start),
  latest_end: normalizeTime(coach.latest_end),
  midday_block_start: normalizeTime(coach.midday_block_start),
  midday_block_end: normalizeTime(coach.midday_block_end),
});

/** Partial `coaches` update reflecting the new current rule state. */
export const toCoachColumns = (rules: EditableRules) => ({
  no_camp: rules.no_camp,
  no_bt: rules.no_bt,
  no_drive: rules.no_drive,
  travel_restricted: rules.travel_restricted,
  program_restriction: rules.adults_only ? "adults_only" : null,
  earliest_start: rules.earliest_start,
  latest_end: rules.latest_end,
  midday_block_start: rules.midday_block_start,
  midday_block_end: rules.midday_block_end,
});

/**
 * Serialize the editable rules into the `coach_rules.value` text per rule_type.
 * This is the canonical comparable form used for diffing and history storage.
 */
export const serializeRules = (rules: EditableRules): Record<string, string | null> => ({
  no_camp: rules.no_camp ? "true" : "false",
  no_bt: rules.no_bt ? "true" : "false",
  no_drive: rules.no_drive ? "true" : "false",
  travel_restricted: rules.travel_restricted ? "true" : "false",
  program_restriction: rules.adults_only ? "adults_only" : null,
  earliest_start: rules.earliest_start,
  latest_end: rules.latest_end,
  midday_block:
    rules.midday_block_start && rules.midday_block_end
      ? `${rules.midday_block_start}-${rules.midday_block_end}`
      : null,
});

/** Compute which rules changed between two states (drives the history writes). */
export const diffRules = (current: EditableRules, next: EditableRules): RuleChange[] => {
  const before = serializeRules(current);
  const after = serializeRules(next);

  return Object.keys(after).reduce<RuleChange[]>((changes, ruleType) => {
    if (before[ruleType] === after[ruleType]) return changes;

    changes.push({
      ruleType,
      label: RULE_LABELS[ruleType] ?? ruleType,
      priority: "hard",
      previousValue: before[ruleType] ?? null,
      nextValue: after[ruleType] ?? null,
    });
    return changes;
  }, []);
};

/** Format a stored `coach_rules.value` for display, per rule_type. */
export const formatRuleValue = (ruleType: string, value: string | null): string => {
  if (value === null) return "Off";
  if (value === "true") return "On";
  if (value === "false") return "Off";

  if (ruleType === "earliest_start" || ruleType === "latest_end") return formatTime(value);

  if (ruleType === "midday_block") {
    const [start, end] = value.split("-");
    return `${formatTime(start)} – ${formatTime(end)}`;
  }

  if (ruleType === "program_restriction") {
    return value === "adults_only" ? "Adults only" : "None";
  }

  return value;
};
