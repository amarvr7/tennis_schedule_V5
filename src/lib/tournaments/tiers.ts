/**
 * Coach title tier mapping — mirrors CURSOR_CONTEXT.md hierarchy.
 * Used for level-based tournament assignment (coach tier ↔ player group tier).
 */

const TIER_BY_TITLE: ReadonlyArray<{ pattern: RegExp; tier: number }> = [
  { pattern: /director of tennis/i, tier: 0 },
  { pattern: /assistant director/i, tier: 0 },
  { pattern: /operations coordinator/i, tier: 0 },
  { pattern: /senior head coach/i, tier: 1 },
  { pattern: /^head coach/i, tier: 2 },
  { pattern: /senior asst coach|senior assistant coach/i, tier: 3 },
  { pattern: /asst coach|assistant coach/i, tier: 5 },
  { pattern: /performance analyst/i, tier: 6 },
];

/** Lower tier number = more senior. Unknown titles default to tier 6. */
export const getCoachTier = (title: string | null): number => {
  if (!title) return 6;
  for (const entry of TIER_BY_TITLE) {
    if (entry.pattern.test(title)) return entry.tier;
  }
  return 6;
};

/** Program type → competitive level tier (lower = more advanced). */
const PROGRAM_TYPE_TIER: Record<string, number> = {
  pro: 0,
  competitive: 1,
  developmental: 2,
  foundational: 3,
  travel: 2,
  saturday: 3,
  camp: 4,
  adults: 4,
  bt: 4,
};

/** Tier for a program type — used in level-based tournament assignment. */
export const getProgramTierFromType = (programType: string | null | undefined): number => {
  if (!programType) return 3;
  return PROGRAM_TYPE_TIER[programType] ?? 3;
};
