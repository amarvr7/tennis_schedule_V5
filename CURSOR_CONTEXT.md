# Academy Scheduling App — Cursor Context

Paste this at the start of every Cursor session.

---

## What You Are Building

A scheduling app for a professional tennis academy with ~50 coaches.
The app replaces a manual Excel process and removes human error from weekly schedule building.

Stack: Next.js 14 App Router, Supabase, Tailwind CSS, Shadcn/ui, deployed on Vercel.

Phase 1 goal: working schedule builder for summer 2025.
Summer season: June 1 - August 21.

---

## Core Rules for the AI to Know

- Never delete records. Deactivate or archive only.
- Store `duration_minutes` on every `weekly_assignments` record. This powers year-end workload and merit review reports.
- Use Supabase Row Level Security. Coaches can only see their own data.
- Write all conflict detection as pure functions, separate from UI components.
- Times and group compositions are configuration data stored in the database. Do not hardcode them in logic.

---

## Coach Title Hierarchy

Drives indoor court booking windows and display. Title is NEVER used for admin
access — admin access is granted solely by the `coaches.is_admin` flag.

| Tier | Title | Booking Window | Schedule Access |
|------|-------|---------------|-----------------|
| 0 | Director of Tennis | 48 hours | Full edit — admin (is_admin) |
| 0 | Assistant Director of Tennis Operations | 48 hours | Full edit — admin (is_admin) |
| 0 | Tennis Operations Coordinator | 48 hours | Full edit — admin (is_admin) |
| 1 | Senior Head Coach | 24 hours | Read only unless is_admin |
| 2 | Head Coach | 12 hours | Read only — sees full group |
| 3 | Senior Asst Coach / Camp Lead | 8 hours | Read only |
| 4 | Senior Assistant Coach | 8 hours | Read only |
| 5 | Asst Coach / Camp Lead | 6 hours | Read only |
| 6 | Assistant Coach | 4 hours | Read only — own week only |
| — | Performance Analyst | N/A | Read only — Phase 3 |

Admin access = full edit, granted only when `coaches.is_admin = true`. The three
Tier 0 staff (Director of Tennis, Assistant Director of Tennis Operations,
Tennis Operations Coordinator) are the admin accounts. Booking windows are still
driven by `title`; admin access is not.

---

## Coach Roster

| Full Name | Initials | Title | Program / Group | Season | No Camp | No BT | No Drive | Notes |
|-----------|----------|-------|-----------------|--------|---------|-------|----------|-------|
| Juan Herrera | JH | Director of Tennis | Operations / Admin | Year-Round | NO | NO | NO | Admin (is_admin = true). Tier 0, 48h booking window |
| Amar Vora | AMV | Assistant Director of Tennis Operations | Operations / Admin | Year-Round | NO | NO | NO | Admin (is_admin = true). Tier 0, 48h booking window |
| Phillip McMurray | PM | Tennis Operations Coordinator | Operations / Admin | Year-Round | NO | NO | NO | Admin (is_admin = true). Tier 0, 48h booking window |
| Red David Ayme | RED | Senior Head Coach | Academy Group / Comp Boys 1 | Year-Round | YES | YES | NO | No camp, no BT year-round |
| Eric Eichelbaum | EE | Senior Head Coach | Competitive Girls 2 | Year-Round | YES | YES | NO | No camp, no BT year-round |
| Aggelos Venizelos | AV | Senior Head Coach | Travel / Pro | Year-Round | YES | YES | NO | Full-time pro travel. Im Back button |
| Martin Alund | ALUND | Senior Head Coach | Pro / Elite | Year-Round | YES | YES | NO | Primarily with pros |
| Jorge Gonzalez | JGZ | Senior Head Coach | Travel / Pro | Year-Round | YES | YES | NO | Pro travel year-round. Im Back button |
| Jakub Grzeslo | JGO | Senior Head Coach | Developmental Boys 2 | Year-Round | NO | NO | NO | |
| Denis Pelegrin | DP | Senior Head Coach | Developmental Girls 2 | Year-Round | NO | NO | NO | |
| Roger Blackburn | RB | Senior Head Coach | Adults / Legacy | Year-Round | NO | NO | NO | Adults and Legacy only |
| Peter Van Lieshout | PVL | Head Coach | World Clinician / Comp Girls 2 support | Year-Round | NO | NO | YES | World clinician. Does not drive |
| Neo Capellan | NEO | Head Coach | Developmental Girls 1 | Year-Round | NO | NO | NO | |
| Arnaud Petel | APG | Head Coach | Foundational Boys 2 | Year-Round | NO | NO | NO | |
| Tina Cvetkovic | TC | Head Coach | Foundational Boys 1 | Year-Round | NO | NO | NO | |
| Dorian Cudina | DC | Head Coach | Foundational Girls 2 / Dev Boys 1.5 | Year-Round | NO | NO | NO | |
| Nick Park | NP | Head Coach | Foundational Girls 1 | Year-Round | NO | NO | NO | |
| Alvaro Figuerola | FIGO | Head Coach | Competitive Boys 2 | Year-Round | NO | YES | NO | No BT year-round |
| Hisa Sato | HS | Senior Asst Coach / Camp Lead | Camp Lead | Year-Round | NO | NO | NO | Camp team lead |
| Martin Damm | MD | Senior Assistant Coach | Competitive Girls 1 | Year-Round | YES | YES | NO | No camp, no BT year-round |
| Micah Klousia | MICAH | Senior Assistant Coach | Competitive Boys 1 / Pro | Year-Round | NO | NO | NO | Main coach C1 Boys with Agge and Alund |
| Joao Riquelme | JR | Senior Assistant Coach | Competitive Boys 2 | Year-Round | NO | NO | NO | Tournament travel rotation |
| Isaac Johnson | IJ | Senior Assistant Coach | Competitive Boys 2 | Year-Round | NO | NO | NO | Tournament travel rotation |
| Ricardo Icaza | RI | Senior Assistant Coach | Competitive Girls 2 | Year-Round | NO | NO | NO | |
| Wafik Bennacer | WB | Senior Assistant Coach | Foundational / Adults | Year-Round | NO | NO | NO | 12:00-1:00 PM blocked daily. No travel outside Bradenton |
| Jonathan Osuigwe | JO | Senior Assistant Coach | Adults | Year-Round | NO | NO | NO | Adults and Legacy only |
| Chad Oxendine | OX | Asst Coach / Camp Lead | Camp / Dev Boys | Year-Round | NO | NO | NO | Camp rotation priority |
| Peter Kovats | PK | Asst Coach / Camp Lead | Foundational Boys / Indoors | Year-Round | NO | NO | YES | Does not drive |
| Geoff | GEOFF | Assistant Coach | Camp | Year-Round | NO | NO | NO | Camp team only |
| Nicola Manni | NM | Asst Coach / Camp Lead | Developmental Boys 1 | Year-Round | NO | NO | NO | Frequent tournament travel |
| Cole Schneider | CL | Assistant Coach | Developmental Boys 1 | Year-Round | NO | NO | NO | Can work Tuesdays when traveling |
| Joseph Wymer | JW | Assistant Coach | Dev Girls 1 / Dev Boys 1.5 | Year-Round | NO | NO | NO | |
| Alexandra Pisareva | APS | Assistant Coach | Foundational Boys 2 / Girls 2 | Year-Round | NO | NO | NO | |
| Alex Haizel | AH | Assistant Coach | Foundational Boys 1 / Girls 1 | Year-Round | NO | NO | NO | |
| Alejandro Dejesus | AD | Assistant Coach | Foundational Girls 1 | Year-Round | NO | NO | YES | Does not drive |
| Bart Meister | BM | Assistant Coach | TBD | TBD | NO | NO | NO | Program TBD |
| Caio Larcedo | CAIO | Assistant Coach | Pro / Elite / Dev Girls | Year-Round | NO | NO | NO | |
| Karim Chaouqi | KC | Assistant Coach | Developmental / Foundational | Year-Round | NO | YES | YES | No BT year-round. Does not drive |
| Ramon Rincon Jimenez | RAMON | Assistant Coach | Adults / Foundational | Year-Round | NO | NO | NO | Adults on Mondays. Frequent PTO |
| Xavier Pino | XP | Assistant Coach | Travel / Pro | Year-Round | NO | NO | NO | Pro travel. Im Back button |
| Andrey Cherkasov | ANDREI | Assistant Coach | Multiple Groups | Summer | NO | YES | NO | Summer only. 10am start, 3pm end. No BT |
| Anna Shumate | ANNA | Assistant Coach | Multiple Groups | Summer | NO | NO | NO | Summer only |
| Tianyu Bao | BAO | Performance Analyst | All Groups | Year-Round | NO | NO | NO | Books group meetings. Phase 3 |
| Sofia Pepe | SFP | Assistant Coach | TBD | TBD | NO | NO | NO | Details TBD |
| Olivia Bryant | OB | Assistant Coach | TBD | TBD | NO | NO | NO | Details TBD |
| Noa Cohen | NC | Assistant Coach | TBD | TBD | NO | NO | NO | Details TBD |
| Max Linder | ML | Assistant Coach | TBD | TBD | NO | NO | NO | Details TBD |
| Sule Ladipo | SL | Assistant Coach | TBD | TBD | NO | NO | NO | Details TBD |

---

## Hard Rules — Enforce These in Code

Every rule below must block or flag an assignment. Write each as a separate function.

| Rule | Type | Logic |
|------|------|-------|
| No Camp | HARD | `coach.no_camp === true && session.type === 'camp'` → block |
| No BT | HARD | `coach.no_bt === true && session.type === 'bt'` → block |
| Earliest Start | HARD | `session.start_time < coach.earliest_start` → block |
| Latest End | HARD | `session.end_time > coach.latest_end` → block |
| Midday Block | HARD | Session overlaps `coach.midday_block_start` to `coach.midday_block_end` → block. WB = 12:00-13:00 daily |
| No Travel Outside Bradenton | HARD | `coach.travel_restricted === true && tournament.is_local === false` → block |
| No Driving | HARD | `coach.no_drive === true && assignment.role === 'driver'` → block |
| Adults Only | HARD | `coach.program_restriction === 'adults_only' && session.type NOT IN ['adults','legacy']` → block |
| Season Dates | HARD | `coach.season === 'summer_only' && date outside Jun 1 - Aug 21` → block |
| Court Zone Rule | HARD | Coach assigned to West Campus or Legacy at 8am → block any 10am assignment on main campus same day |
| Double Booking | HARD | Same coach, overlapping time, different session → block |
| Court Double Booking | HARD | Same court numbers, same time, different session → block |
| Meeting Block | HARD | Session during Thursday 11:15am (head coaches) or Wednesday 11am (assistants) → block |
| PTO | HARD | Coach marked unavailable that day or week → block |
| Travel Block | HARD | Coach marked traveling → block all local assignments for that duration |
| Max Travel | HARD | 3 consecutive travel weeks → block 4th tournament assignment until home week |
| Rest After Weekend | SYSTEM | Coach works Sat + Sun → auto-block Monday. Pre-fill Monday groups from opposite schedule head coaches |

---

## Soft Rules — Show Warning, Do Not Block

| Rule | Logic |
|------|-------|
| Court Priority | C1 Girls and D1 Boys have priority on Hard 15-21. Warn if assigned elsewhere when those courts are free |
| Adults on Monday | RAMON should be on adults session Mondays. Warn if missed |

---

## Programs

| Program | Type | Gender | Head Coach |
|---------|------|--------|------------|
| Competitive Boys 1 (Academy) | competitive | boys | AGGE / ALUND / MICAH |
| Competitive Boys 2 | competitive | boys | FIGO |
| Competitive Girls 1 | competitive | girls | RED |
| Competitive Girls 2 | competitive | girls | EE |
| Developmental Boys 1 | developmental | boys | RED |
| Developmental Boys 1.5 | developmental | boys | DC |
| Developmental Boys 2 | developmental | boys | JGO |
| Developmental Girls 1 | developmental | girls | NEO |
| Developmental Girls 2 | developmental | girls | DP |
| Foundational Boys 1 | foundational | boys | TC |
| Foundational Boys 2 | foundational | boys | APG |
| Foundational Girls 1 | foundational | girls | NP |
| Foundational Girls 2 | foundational | girls | DC |
| Junior Camp AM | camp | mixed | HS |
| Junior Camp PM | camp | mixed | HS |
| Adults Regular | adults | mixed | JO |
| Adults Special Help | adults | mixed | JO |
| Adults Legacy | adults | mixed | RB |
| Female Pros | pro | girls | JGZ |
| Pro / Elite Boys | pro | boys | AV |
| Breakthrough (BT) | bt | mixed | admin |
| Tournament Travel | travel | mixed | varies |
| Saturday Combined | saturday | mixed | varies |

---

## Court Zones

| Zone | Courts | Surface | Location | Rule |
|------|--------|---------|----------|------|
| Zone A | Hard 1-7 | Hard | Main campus | No buffer needed. Can combine with Zone B |
| Zone B | Hard 8-14 | Hard | Main campus | Adjacent to Zone A and Green Clay |
| Zone C | Hard 15-21 | Hard | Main campus | Priority: C1 Girls and D1 Boys |
| Zone D | Hard 22-28 | Hard | Main campus | Adjacent to Zone C |
| Green Clay | Clay 1-9 | Clay | Main campus | Clay 6-7 ties with Hard 1-7 or 4-7. Clay 8-9 ties with Hard 8-14 or 11-14 |
| Red Clay | Red Clay 1-4 | Clay | Main campus | Adults and Pros. Can tie with Hard 1-3 if needed |
| ST Clay | ST Clay | Clay | Main campus | 1 court. Female Pros PM |
| ST Hard | ST Hard | Hard | Main campus | 1 court. Pros primarily |
| Indoor | Indoors 1-4 | Indoor | Main campus | Booking windows apply by title tier |
| West Campus | West Clay 1-5 | Clay | Other side of campus | 8am here blocks 10am on main campus |
| Legacy | Legacy 1-6 | Clay | Other side of campus | 8am here blocks 10am on main campus. Afternoon preferred |

---

## Database Schema

```sql
coaches (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  initials text,
  title text,
  primary_program_id uuid,
  season text default 'year_round',     -- year_round | summer_only
  season_start date,
  season_end date,
  earliest_start time,
  latest_end time,
  midday_block_start time,
  midday_block_end time,
  no_camp boolean default false,
  no_bt boolean default false,
  no_drive boolean default false,
  travel_restricted boolean default false,
  program_restriction text,             -- null | adults_only
  is_active boolean default true,
  onboarding_status text,               -- orientation | onboarding | active
  onboarding_start_date date,
  created_at timestamptz default now()
)

coach_rules (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references coaches(id),
  rule_type text not null,
  priority text default 'hard',         -- hard | soft | system
  value text,
  effective_from date,
  effective_to date,
  notes text,
  created_at timestamptz default now()
)

programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text,                            -- competitive | developmental | foundational | camp | adults | pro | bt | travel | saturday
  gender text,
  head_coach_id uuid references coaches(id),
  is_two_a_day boolean default false,
  default_surface text,
  default_courts text,
  priority_zone text
)

sessions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references programs(id),
  day_of_week text,
  start_time time not null,
  end_time time not null,
  duration_minutes int,
  court_zone text,
  court_numbers text,
  surface text,
  season text default 'all',
  notes text
)

weekly_assignments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id),
  coach_id uuid references coaches(id),
  week_start_date date not null,
  role text,                            -- lead | assistant | coverage
  status text default 'active',         -- active | pto | traveling | archived
  duration_minutes int,
  is_published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
)

coach_availability (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references coaches(id),
  week_start_date date not null,
  day_of_week text,
  status text,                          -- available | pto | traveling | rest | orientation
  notes text,
  approved_by uuid references coaches(id),
  created_at timestamptz default now()
)

tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  is_local boolean default false,
  start_date date,
  end_date date,
  days_count int,
  tournament_type text,                 -- ITF | USTA | local | clinic | special_event
  is_canceled boolean default false,
  notes text
)

tournament_assignments (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id),
  coach_id uuid references coaches(id),
  student_name text,
  departed_at timestamptz,
  returned_at timestamptz,
  rest_days_owed int default 0,
  notes text
)

change_requests (
  id uuid primary key default gen_random_uuid(),
  requesting_coach_id uuid references coaches(id),
  assignment_id uuid references weekly_assignments(id),
  reason text,
  status text default 'pending',        -- pending | approved | denied
  reviewed_by uuid references coaches(id),
  reviewed_at timestamptz,
  created_at timestamptz default now()
)

court_bookings (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references coaches(id),
  court text,
  booking_date date,
  start_time time,
  end_time time,
  purpose text,
  canceled boolean default false,
  created_at timestamptz default now()
)

notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_coach_id uuid references coaches(id),
  type text,
  message text,
  is_read boolean default false,
  created_at timestamptz default now()
)
```

---

## Phase 1 Scope — Build Only This

6 screens. Nothing else.

1. **Weekly Schedule Builder** — grid view, days as columns, time slots as rows, sessions in cells, conflict badges in red, draft and publish states
2. **Assign Coaches Panel** — click a session, see available coaches, grayed out with reason if blocked, override with confirmation
3. **Conflict Dashboard** — all active conflicts for current week, filterable by type
4. **Coach Profile** — admin view, all rules, current week, travel history, workload YTD
5. **My Schedule** — coach read-only view of own week, iCal download
6. **PDF Export** — one-click export of full week in current format

---

## Conflict Detection — Write These as Pure Functions

```javascript
function checkAllConflicts(assignment, allAssignments, coach, session, coachAvailability) {
  const conflicts = []

  // 1.  Double booking — same coach, overlapping time
  // 2.  No camp — coach.no_camp && session.type === 'camp'
  // 3.  No BT — coach.no_bt && session.type === 'bt'
  // 4.  Earliest start — session.start_time < coach.earliest_start
  // 5.  Latest end — session.end_time > coach.latest_end
  // 6.  Midday block — session overlaps coach midday block window
  // 7.  Season — summer_only coach outside Jun 1 - Aug 21
  // 8.  PTO — coach unavailable that day
  // 9.  Travel block — coach marked traveling
  // 10. Court double booking — same court, overlapping time
  // 11. Court zone rule — 8am West/Legacy blocks 10am main campus
  // 12. Meeting block — Wednesday 11am or Thursday 11:15am
  // 13. Rest day — coach in auto-blocked rest period
  // 14. Program restriction — adults_only coach in non-adult session
  // 15. Max travel — 3 consecutive travel weeks

  return conflicts // [{ type, severity, coachId, sessionId, message }]
}
```

---

## Key Business Logic

- **Im Back button:** When a traveling or pro coach returns, they press Im Back. App removes travel block, calculates rest days owed, auto-blocks those days, sends admin an alert.
- **Weekend rest rule:** Coach works Saturday and Sunday → Monday auto-blocked. Opposite schedule head coaches pre-filled for Monday groups automatically.
- **Max travel:** 3 consecutive travel weeks maximum. Block 4th tournament assignment until coach has a home week.
- **New coach onboarding:** Week 1 orientation (no sessions). Weeks 2-3 rotate through all programs daily including adults and camp. Week 4 assigned to permanent group.
- **Camp volume rule:** When camp head count exceeds 20, PM camp shifts from 2:30-4:30pm to 3:00-5:00pm. Admin or camp lead triggers. Assigned coaches notified.
- **BT override:** Admin can override No BT rule but must confirm. Affected coach is notified automatically.
- **Historical records:** Never delete. Rule changes store old rule with end date, new rule with start date.
