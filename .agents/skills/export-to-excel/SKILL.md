---
name: export-to-excel
description: >-
  Export management reports as CSV files compatible with Excel. Use when asked
  to export, download, or spreadsheet-format schedule, hours, coverage, or
  tournament data.
disable-model-invocation: true
---

# Export to Excel

## When to use

- Admin requests Excel export or CSV download
- `/export-to-excel` slash command
- End-of-month hours snapshot delivery

## Export routes

`GET /admin/reports/export` — admin auth required.

| `type` param | Output |
|--------------|--------|
| `weekly` | Full weekly report (`weeklyReportToCsv`) |
| `hours` | Season hours analysis (`hoursAnalysisToCsv`) |
| `coaches` | Coach workload table only |
| `coverage` | Weekly coverage trend |
| `tournaments` | Tournament roster summary |

### Query params

- `week=YYYY-MM-DD` — for weekly export (Monday)
- `start=YYYY-MM-DD&end=YYYY-MM-DD` — for season-range exports

## Formatters

All CSV logic lives in `src/lib/reports/format.ts`. No `xlsx` library in pilot — CSV opens directly in Excel.

## Example

```
/admin/reports/export?type=weekly&week=2025-06-02
/admin/reports/export?type=hours&start=2025-06-01&end=2025-08-21
```

## Rules

- Escape commas and quotes per RFC 4180 (`escapeCsv` helper).
- Filename pattern: `{report-type}-{date-range}.csv`.
- Set `Content-Disposition: attachment` and `Cache-Control: no-store`.
