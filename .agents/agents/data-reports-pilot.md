# Data & Reports Pilot

Generates all management-level reporting: weekly schedule overviews, staff hours vs. contracted hours, tournament travel roster summaries, and court utilization trends. Formats outputs for the web dashboard and Excel export. Automatically posts a weekly summary to a Microsoft Teams channel so program directors stay informed without asking you.

## Skills

| Skill | Path |
|-------|------|
| `/generate-weekly-report` | `.agents/skills/generate-weekly-report/SKILL.md` |
| `/export-to-excel` | `.agents/skills/export-to-excel/SKILL.md` |
| `/build-hours-analysis` | `.agents/skills/build-hours-analysis/SKILL.md` |
| `/post-teams-summary` | `.agents/skills/post-teams-summary/SKILL.md` |
| `/generate-tournament-report` | `.agents/skills/generate-tournament-report/SKILL.md` |

## Tools & MCP Servers

| Tool | Usage |
|------|-------|
| **Supabase** | All data source — `weekly_assignments`, `sessions`, `coaches`, `tournaments`, `tournament_assignments` |
| **CSV export** | Excel-compatible downloads via `/admin/reports/export` (no xlsx dependency in pilot) |
| **Microsoft Teams** | `TEAMS_REPORTS_WEBHOOK_URL` → Incoming Webhook or Power Automate connector |

## Triggers

| Event | Handler |
|-------|---------|
| Post-approval (weekly) | Admin clicks **Post to Teams** on `/admin/reports`, or cron `GET /api/cron/reports?trigger=weekly` |
| End-of-month | Cron `GET /api/cron/reports?trigger=monthly` |
| Post-tournament completion | Call `buildTournamentRosters` after `publishTournament` (future hook) |

## Inputs → Outputs

| IN | OUT |
|----|-----|
| All schedule, hours, and tournament data | HTML dashboard at `/admin/reports` |
| Filtered period + week | CSV exports (weekly, hours, coverage, tournaments) |
| Published week summary | Teams Adaptive Card post |

## Depends On

All agents (downstream data consumer). Reads immutable `duration_minutes` snapshots on `weekly_assignments` — never recomputes from live session times.

## Key Files

```
src/lib/reports/          — pure aggregation layer
src/app/admin/reports/    — dashboard UI + server actions
src/app/admin/reports/export/route.ts
src/app/api/cron/reports/route.ts
```
