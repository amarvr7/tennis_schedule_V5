---
name: generate-tournament-report
description: >-
  Generate tournament travel roster summaries and rotation fairness reports.
  Use when asked about tournament assignments, travel rosters, or coach travel
  load.
disable-model-invocation: true
---

# Generate Tournament Report

## When to use

- Post-tournament completion reporting
- `/generate-tournament-report` slash command
- Travel roster review for program directors

## Roster summary

`buildTournamentRosters()` in `src/lib/reports/travel.ts`

Includes only **published** tournaments (`published_at` set, not canceled/archived) overlapping the report period.

Per tournament:
- Coach count and names
- Student count
- Local vs. travel flag
- Date range

## Travel load per coach

`buildTravelSummary()` in `src/lib/reports/travel.ts`

Uses `travelWeeks.ts` helpers:
- `buildAllTravelWeekStartsByCoach`
- `consecutiveTravelWeeksByCoach`

Flags coaches approaching max travel (3 consecutive weeks).

## Rotation fairness

Existing helper: `buildRotationReport()` in `src/lib/tournaments/rotate.ts` — not yet on dashboard; wire when tournament UI ships.

## Export

```
/admin/reports/export?type=tournaments&start=2025-06-01&end=2025-08-21
```

Formatter: `tournamentRostersToCsv()` in `format.ts`.

## Data source

Supabase tables: `tournaments`, `tournament_assignments`, `coaches`.
Load via `loadTournamentData()` in `load.ts`.
