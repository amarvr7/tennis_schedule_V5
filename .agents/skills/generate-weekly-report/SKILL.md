---
name: generate-weekly-report
description: >-
  Generate the weekly management report: staffing coverage, coach hours, court
  utilization, and tournament travel for a given week. Use when asked for a
  weekly schedule overview or weekly summary report.
disable-model-invocation: true
---

# Generate Weekly Report

## When to use

- Admin asks for a weekly schedule overview
- Post-approval reporting after schedule publish
- `/generate-weekly-report` slash command

## Steps

1. Read `src/lib/reports/weekly.ts` — `buildWeeklyReport()` composes all sections.
2. Load raw data via `src/lib/reports/load.ts` (admin Supabase client).
3. Default period: `SUMMER_2025` from `src/lib/reports/types.ts`.
4. Default week: `normalizeWeekStart()` from `src/lib/schedule/grid.ts`.
5. Set `publishedOnly: true` unless draft review is explicitly requested.

## Output sections

| Section | Builder |
|---------|---------|
| Coverage | `buildWeeklyCoverage` in `coverage.ts` |
| Coach hours | `buildWeeklyCoachHours` in `workload.ts` |
| Program hours | `buildProgramHours` in `workload.ts` |
| Court utilization | `buildCourtUtilization` in `courts.ts` |
| Travel summary | `buildTravelSummary` in `travel.ts` |
| Tournament rosters | `buildTournamentRosters` in `travel.ts` |

## Dashboard

Render at `/admin/reports?week=YYYY-MM-DD` via `loadReportsData()` in `actions.ts`.

## Rules

- Use `duration_minutes` from `weekly_assignments` snapshots only.
- Filter `status = 'active'` for countable hours.
- Gate all server access with `requireAdminCoach()`.
