---
name: build-hours-analysis
description: >-
  Build staff hours vs contracted hours analysis for merit review and workload
  reporting. Use when asked about coach hours, utilization, contracted hours, or
  YTD workload.
disable-model-invocation: true
---

# Build Hours Analysis

## When to use

- Merit review or year-end workload questions
- `/build-hours-analysis` slash command
- Comparing actual hours to contracted expectations

## Core function

`buildHoursAnalysis()` in `src/lib/reports/workload.ts`

### Input

`RawWorkloadAssignment[]` from `loadWorkloadRows()` — joins `weekly_assignments` → `coaches` → `sessions` → `programs`.

### Output

`HoursAnalysisReport` with:
- Per-coach `CoachWorkloadRow` (total minutes, session count, utilization %)
- Per-program `ProgramHoursRow`
- Summary totals (avg hours/coach, over/under contracted counts)

## Contracted hours

Interim defaults in `src/lib/reports/contracted.ts` by title tier until per-coach DB config exists:

| Title pattern | Weekly hours |
|---------------|--------------|
| Director / Operations Coordinator | 40 |
| Senior Head / Head Coach | 40 |
| Senior Assistant | 40 |
| Assistant Coach | 35 |
| Performance Analyst | 0 |

Utilization = `(avg weekly actual minutes / contracted weekly minutes) × 100`.

## Critical rule

**Never recompute hours from `sessions.duration_minutes`.** Always use the `weekly_assignments.duration_minutes` snapshot — it is immutable for historical reporting.

## Tests

`src/lib/reports/workload.test.ts` — vitest coverage for aggregation filters.
