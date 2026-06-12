# Academy Scheduling App — Domain Answers

Companion to CURSOR_CONTEXT.md. These are the owner's answers to the six open
domain questions. Read this file before touching the generator, the session
template, the coverage report, or change tracking. Where this file conflicts
with older assumptions in code, this file wins.

---

## Q1 — Staffing requirements

Staffing is defined per GROUP, not per session, and it is set once per season
when groups are formed. The coach team exists BEFORE any schedule is built.

Schema:
- Add to the groups/programs table:
  - `required_lead_count` (default 1)
  - `required_assistant_count` (int, set by admin per group)
- New table `group_coach_roster`:
  - `group_id`, `coach_id`, `role` ('lead' | 'assistant'), `season`
  - This is the group's assigned team for the whole season.

Generator:
- "Fully staffed" = the group's lead is present AND
  `required_assistant_count` assistants are present.
- FIRST place coaches from the group's roster into the group's sessions.
  Only pull from the general pool when a roster coach is unavailable
  (PTO, travel, rule conflict). Any non-roster fill is recorded as a
  substitute (`sub = true` on the assignment).
- Coverage report measures: sessions missing lead, sessions short on
  assistants, sessions using substitutes.

Edge cases:
- A coach CAN be rostered as lead on more than one group (rare). Allowed in
  data, but the conflict checker must still block the same coach being in two
  sessions in the same time block. If both groups train at the same time, the
  generator flags it; never silently double-book.
- Camp has a fixed roster like any other group, plus an enrollment overflow
  rule (see Q3).

Admin UI:
- Season setup screen: create groups, set assistant counts, assign each
  group's coach team. This happens before any schedule generation.

---

## Q2 — Session template ownership

The weekly grid is mostly identical all summer, with occasional exceptions
(court maintenance, holidays, tournament weeks).

Design:
- One MASTER WEEK TEMPLATE per season. It holds every recurring slot:
  - A schedule 8:00–10:00 AM
  - B schedule 10:00 AM–12:00 PM
  - PM 1:15–3:15 PM
  - Pro/Elite 3:15–5:15 PM
  - Camp AM 10:00 AM–12:00 PM
  - Camp PM 2:30–4:30 PM
  - Adults/Legacy AM and PM tracks
  - Evening Pro Practice, Thursday 6:00–8:00 PM
  Each slot links to a group, a time block, and court assignments.
- Creating a new week CLONES the master template into that week's sessions.
  Admin edits exceptions on the week copy only (delete a slot, move a time,
  change courts).
- Edits to a week never change the master. Edits to the master affect only
  weeks created afterward.
- Anyone with `is_admin = true` can edit the master and weekly copies
  (Amar, Juan, Phillip).
- The seeded ~9 slot types are placeholders. Build an admin template editor
  screen; do not hardcode slots. The owner will enter the true master grid
  through that editor.

---

## Q3 — Programs vs players

Slots are driven by PROGRAMS, not enrollment. Group structure and coach teams
are set at season start and the grid is static. No enrollment data or student
rosters are needed anywhere in the system.

There are TWO exceptions: camp and adults.

Camp:
- Add a manual field `camp_headcount` to the week record, entered by admin
  during week setup.
- Camp group record has an optional `base_capacity` field (configurable in
  the UI, leave blank until the owner sets it).
- If `camp_headcount > base_capacity`, show a WARNING on the coverage report
  ("camp may need +N coaches"). Do not block, do not auto-assign. Admin
  decides manually.
- Overflow ratio is configurable; default 1 extra coach per 8 campers over
  capacity.

Adults (owner decision, June 2026):
- Unlike juniors, adults enrollment differs EACH DAY and between the AM and
  PM tracks, so the number is entered per SESSION (`sessions.headcount`),
  not per week. Admin enters it on the Schedule Builder's session panel.
- Staffing ratio is 1 coach per 4 adults (same ratio as juniors), stored as
  the configurable `adults_per_coach` season setting.
- When an adults session's head count needs more coaches than are assigned,
  the coverage report shows a WARNING ("may need +N"). Warn only — never
  block, never auto-assign. Admin decides manually, same as camp.

Seasonal note: summer staffing is sized for ~250 students with dedicated
summer staff, so summer shortages are rare. The school year (competitive
2-a-days, boys AM, girls PM, smaller bench) is where shortage handling
matters most.

---

## Q4 — Shortage handling

There is NO automatic priority hierarchy. No group loses a coach by generator
decision, and nothing is degraded or cancelled automatically.

Single-day absence, coach has ONE assignment that day:
- Default is NO substitute. The group runs one coach short for the day.
- Coverage report shows it as an FYI row, not an action item.
- Admin can still manually open "Find coach" if they want a sub.

Single-day absence, coach was DOUBLE DELIVERING (two or more assignments that
day, e.g. full program block plus camp after):
- The primary group absorbs the absence (no sub).
- The SECONDARY assignment (camp or other extra duty) is flagged NEEDS FILL
  and automatically triggers the suggestion list.

Multi-day absence (2+ days):
- All of that coach's assignments flag for suggested fills.

Suggestion list rules. A coach qualifies only if ALL pass:
- Not assigned to another session in that time block
- No rule conflicts (no_camp, no_bt, time windows, Wafik's 12:00–1:00 block,
  court zone rules, season limits, PTO, travel, rest days)
- Active for the current season
- Their own group does not train in that same block

Ranking uses ROTATION, not familiarity:
1. Coach who has subbed least recently / least often this season ranks first.
   Spread sub duty so no coach repeatedly loses touch with their own group.
2. Tiebreak: lowest assigned hours that week.

Track sub history per coach (date, group, session) via the `sub = true`
assignment records to power the rotation.

Nothing is ever auto-assigned. Suggestions only; admin picks. The pick is
recorded as a substitute assignment, linked to the absent coach if known.

UI: shortage rows on the coverage report get a "Find coach" button that opens
the ranked list showing each coach's current week load and soft warnings.

Build any priority or ranking values as configurable per-season settings,
never hardcoded.

---

## Q5 — Continuity vs optimization

Continuity is not an optimizer setting. The season roster IS the continuity:
the same team serves the same group every week by definition. Weekly
generation re-places the same rostered people; it never reshuffles coaches
across groups. The only optimization in the system is the substitute
suggestion ranking in Q4, which deliberately ROTATES subs rather than
repeating the same familiar sub.

---

## Q6 — Mid-week changes

Changes apply INSTANTLY to the published schedule. No draft/re-publish cycle
for mid-week edits.

Visibility vs notification are different things:
- VISIBILITY: when a change happens (e.g. a camp slot is filled), the camp
  director, head coaches, admins, and the replacing coach can all see it in
  their schedule views, with a "changed" indicator on modified sessions for
  that week.
- NOTIFICATION (active alert): only the sub who got added and that sub's
  head coach. Phase 1 can be an in-app banner or email:
  "You were added to Camp PM, Wed July 16."

History is REQUIRED:
- Never overwrite assignments destructively. Every change writes an audit
  row: `assignment_id`, `changed_by`, `changed_at`, `old_value`, `new_value`,
  `reason` ('sick' | 'travel' | 'swap' | 'other').
- Admin can view any past week as "originally published" vs "as actually ran."
- Workload and merit reports calculate from ACTUAL delivered assignments,
  not the original plan.
- Rename/repurpose the empty `change_requests` table as
  `schedule_change_log`. No approval workflow in Phase 1; admins make the
  changes themselves.

---

## New role — Camp Director

Add "Camp Director" as a staff title and role:
- Login: yes
- Permissions: read-only view of ALL camp sessions and the camp weekly
  schedule, plus visibility of any schedule change that touches camp
  (fills, removals, time changes).
- NOT an admin. Cannot edit schedules, rosters, or rules.
- Add the title to the Title Hierarchy reference data. Admin access continues
  to be controlled only by `is_admin = true`, never by title.

---

## Standing rules (unchanged from CURSOR_CONTEXT.md)

- Never delete records; deactivate or archive only.
- Store `duration_minutes` on every assignment record.
- Supabase RLS: coaches see only their own data.
- All conflict detection stays in pure functions, separate from UI.
- Do not modify /lib/conflicts.ts unless a task explicitly says to.
