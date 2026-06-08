---
name: post-teams-summary
description: >-
  Post a weekly management summary to a Microsoft Teams channel via Incoming
  Webhook. Use when asked to notify directors, post to Teams, or automate the
  weekly summary.
disable-model-invocation: true
---

# Post Teams Summary

## When to use

- After schedule publish / approval
- `/post-teams-summary` slash command
- Weekly cron automation

## Configuration

Set `TEAMS_REPORTS_WEBHOOK_URL` in `.env.local` (server-only):

- Microsoft Teams → Channel → Connectors → Incoming Webhook, or
- Power Automate → "When a HTTP request is received" → Post to channel

## Implementation

`postWeeklySummaryToTeams()` in `src/lib/reports/teams.ts`

Posts an Office 365 Connector **MessageCard** with:
- Schedule coverage facts (staffed / total / gaps)
- Top 5 coach hours
- Top 5 tournament rosters

## Triggers

| Method | Entry point |
|--------|-------------|
| Manual | `postTeamsSummary()` server action — **Post to Teams** button on `/admin/reports` |
| Cron | `GET /api/cron/reports?trigger=weekly` with `Authorization: Bearer $CRON_SECRET` |

## Behavior when unconfigured

If `TEAMS_REPORTS_WEBHOOK_URL` is unset, returns `{ skipped: true }` — no error.

## Vercel Cron example

```json
{
  "crons": [{
    "path": "/api/cron/reports?trigger=weekly",
    "schedule": "0 14 * * 1"
  }]
}
```

Set `CRON_SECRET` in Vercel env; Vercel sends it as `Authorization: Bearer ...` automatically.
