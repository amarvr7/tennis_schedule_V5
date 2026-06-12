/**
 * Season scoping + per-season settings (CURSOR_ANSWERS.md Q3/Q4: ranking and
 * threshold values are configuration, never hardcoded). Pure module — the
 * defaults here are only fallbacks for when a season_settings row is absent.
 */

export const CURRENT_SEASON = "summer_2025";

export type SeasonSettingKey = "camp_overflow_per_coach" | "adults_per_coach";

export interface SeasonSettings {
  /** Campers over base capacity that warrant one extra coach (Q3 overflow). */
  campOverflowPerCoach: number;
  /** Adults one coach can cover (owner: 1 coach per 4 adults). */
  adultsPerCoach: number;
}

export const DEFAULT_SEASON_SETTINGS: SeasonSettings = {
  campOverflowPerCoach: 8,
  adultsPerCoach: 4,
};

export interface RawSeasonSetting {
  key: string;
  value: unknown;
}

const asPositiveNumber = (value: unknown): number | null => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0
    ? parsed
    : null;
};

/** Resolve settings rows against the defaults. Unknown keys are ignored. */
export const resolveSeasonSettings = (rows: RawSeasonSetting[]): SeasonSettings => {
  const settings = { ...DEFAULT_SEASON_SETTINGS };

  for (const row of rows) {
    if (row.key === "camp_overflow_per_coach") {
      const parsed = asPositiveNumber(row.value);
      if (parsed !== null) settings.campOverflowPerCoach = parsed;
    }
    if (row.key === "adults_per_coach") {
      const parsed = asPositiveNumber(row.value);
      if (parsed !== null) settings.adultsPerCoach = parsed;
    }
  }

  return settings;
};

/**
 * Coaches an adults session needs for its enrollment (1 coach per
 * `adultsPerCoach` adults). Null/zero head count needs no one.
 */
export const adultsCoachesNeeded = (
  headcount: number | null,
  settings: SeasonSettings,
): number => {
  if (headcount === null || headcount <= 0) return 0;
  return Math.ceil(headcount / settings.adultsPerCoach);
};

/** Extra coaches camp may need when head count exceeds base capacity (Q3). */
export const campOverflowCoaches = (
  campHeadcount: number | null,
  baseCapacity: number | null,
  settings: SeasonSettings,
): number => {
  if (campHeadcount === null || baseCapacity === null) return 0;
  const overflow = campHeadcount - baseCapacity;
  if (overflow <= 0) return 0;
  return Math.ceil(overflow / settings.campOverflowPerCoach);
};
