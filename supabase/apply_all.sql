-- ============================================================
-- Academy Scheduling App — full apply bundle
-- Paste into Supabase Dashboard → SQL Editor → Run.
-- Generated from supabase/migrations/* + supabase/seed.sql
-- ============================================================

-- =============================================================================
-- Academy Scheduling App — Initial schema
-- Source of truth: CURSOR_CONTEXT.md "Database Schema"
--
-- Notes / intentional additions beyond the doc schema:
--   * coaches.auth_user_id  -> links a coach row to a Supabase Auth user.
--     Required so Row Level Security can resolve "this coach == the caller".
--   * coaches.is_admin      -> the 3 admin accounts get full edit access.
--   * sessions.duration_minutes is a GENERATED column (end - start) to remove
--     human error. weekly_assignments.duration_minutes stays a stored value:
--     it is a historical snapshot for year-end workload / merit reports and
--     must not change if the underlying session is later edited.
--   * Hard enumerations are enforced with CHECK constraints (kept as text so
--     new config values can be added via migration without enum surgery).
-- Core rule: never delete records — deactivate/archive instead.
-- =============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- coaches  (created first; seeded separately in seed.sql)
-- -----------------------------------------------------------------------------
create table public.coaches (
  id                  uuid primary key default gen_random_uuid(),
  auth_user_id        uuid unique references auth.users (id) on delete set null,
  full_name           text not null,
  initials            text,
  title               text,
  primary_program_id  uuid,                      -- FK added after programs exists
  season              text not null default 'year_round'
                        check (season in ('year_round', 'summer_only', 'tbd')),
  season_start        date,
  season_end          date,
  earliest_start      time,
  latest_end          time,
  midday_block_start  time,
  midday_block_end    time,
  no_camp             boolean not null default false,
  no_bt               boolean not null default false,
  no_drive            boolean not null default false,
  travel_restricted   boolean not null default false,
  program_restriction text check (program_restriction in ('adults_only')),
  is_admin            boolean not null default false,
  is_active           boolean not null default true,
  onboarding_status   text check (onboarding_status in ('orientation', 'onboarding', 'active')),
  onboarding_start_date date,
  created_at          timestamptz not null default now()
);

create index coaches_initials_idx on public.coaches (initials);
create index coaches_is_active_idx on public.coaches (is_active);

-- -----------------------------------------------------------------------------
-- programs
-- -----------------------------------------------------------------------------
create table public.programs (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type            text check (type in (
                    'competitive', 'developmental', 'foundational', 'camp',
                    'adults', 'pro', 'bt', 'travel', 'saturday')),
  gender          text check (gender in ('boys', 'girls', 'mixed')),
  head_coach_id   uuid references public.coaches (id) on delete set null,
  is_two_a_day    boolean not null default false,
  default_surface text,
  default_courts  text,
  priority_zone   text
);

create index programs_head_coach_id_idx on public.programs (head_coach_id);

-- Resolve the circular reference: coach belongs to a primary program.
alter table public.coaches
  add constraint coaches_primary_program_id_fkey
  foreign key (primary_program_id) references public.programs (id) on delete set null;

create index coaches_primary_program_id_idx on public.coaches (primary_program_id);

-- -----------------------------------------------------------------------------
-- coach_rules  (historical: rule changes keep old row w/ end date + new row)
-- -----------------------------------------------------------------------------
create table public.coach_rules (
  id             uuid primary key default gen_random_uuid(),
  coach_id       uuid not null references public.coaches (id) on delete cascade,
  rule_type      text not null,
  priority       text not null default 'hard' check (priority in ('hard', 'soft', 'system')),
  value          text,
  effective_from date,
  effective_to   date,
  notes          text,
  created_at     timestamptz not null default now()
);

create index coach_rules_coach_id_idx on public.coach_rules (coach_id);

-- -----------------------------------------------------------------------------
-- sessions
-- -----------------------------------------------------------------------------
create table public.sessions (
  id               uuid primary key default gen_random_uuid(),
  program_id       uuid references public.programs (id) on delete set null,
  day_of_week      text check (day_of_week in (
                     'monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  start_time       time not null,
  end_time         time not null,
  duration_minutes int generated always as (
                     (extract(epoch from (end_time - start_time)) / 60)::int) stored,
  court_zone       text,
  court_numbers    text,
  surface          text,
  season           text not null default 'all',
  notes            text,
  constraint sessions_time_order check (end_time > start_time)
);

create index sessions_program_id_idx on public.sessions (program_id);
create index sessions_day_of_week_idx on public.sessions (day_of_week);

-- -----------------------------------------------------------------------------
-- weekly_assignments  (duration_minutes is a stored historical snapshot)
-- -----------------------------------------------------------------------------
create table public.weekly_assignments (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.sessions (id) on delete cascade,
  coach_id         uuid not null references public.coaches (id) on delete cascade,
  week_start_date  date not null,
  role             text check (role in ('lead', 'assistant', 'coverage')),
  status           text not null default 'active'
                     check (status in ('active', 'pto', 'traveling', 'archived')),
  duration_minutes int,
  is_published     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index weekly_assignments_coach_week_idx on public.weekly_assignments (coach_id, week_start_date);
create index weekly_assignments_session_week_idx on public.weekly_assignments (session_id, week_start_date);
create index weekly_assignments_week_idx on public.weekly_assignments (week_start_date);

-- -----------------------------------------------------------------------------
-- coach_availability
-- -----------------------------------------------------------------------------
create table public.coach_availability (
  id              uuid primary key default gen_random_uuid(),
  coach_id        uuid not null references public.coaches (id) on delete cascade,
  week_start_date date not null,
  day_of_week     text check (day_of_week in (
                    'monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  status          text check (status in ('available', 'pto', 'traveling', 'rest', 'orientation')),
  notes           text,
  approved_by     uuid references public.coaches (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index coach_availability_coach_week_idx on public.coach_availability (coach_id, week_start_date);

-- -----------------------------------------------------------------------------
-- tournaments
-- -----------------------------------------------------------------------------
create table public.tournaments (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  location        text,
  is_local        boolean not null default false,
  start_date      date,
  end_date        date,
  days_count      int,
  tournament_type text check (tournament_type in ('ITF', 'USTA', 'local', 'clinic', 'special_event')),
  is_canceled     boolean not null default false,
  notes           text
);

-- -----------------------------------------------------------------------------
-- tournament_assignments
-- -----------------------------------------------------------------------------
create table public.tournament_assignments (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references public.tournaments (id) on delete cascade,
  coach_id        uuid not null references public.coaches (id) on delete cascade,
  student_name    text,
  departed_at     timestamptz,
  returned_at     timestamptz,
  rest_days_owed  int not null default 0,
  notes           text
);

create index tournament_assignments_coach_idx on public.tournament_assignments (coach_id);
create index tournament_assignments_tournament_idx on public.tournament_assignments (tournament_id);

-- -----------------------------------------------------------------------------
-- change_requests
-- -----------------------------------------------------------------------------
create table public.change_requests (
  id                  uuid primary key default gen_random_uuid(),
  requesting_coach_id uuid not null references public.coaches (id) on delete cascade,
  assignment_id       uuid references public.weekly_assignments (id) on delete set null,
  reason              text,
  status              text not null default 'pending'
                        check (status in ('pending', 'approved', 'denied')),
  reviewed_by         uuid references public.coaches (id) on delete set null,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now()
);

create index change_requests_requesting_coach_idx on public.change_requests (requesting_coach_id);

-- -----------------------------------------------------------------------------
-- court_bookings
-- -----------------------------------------------------------------------------
create table public.court_bookings (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.coaches (id) on delete cascade,
  court        text,
  booking_date date,
  start_time   time,
  end_time     time,
  purpose      text,
  canceled     boolean not null default false,
  created_at   timestamptz not null default now()
);

create index court_bookings_coach_idx on public.court_bookings (coach_id);
create index court_bookings_date_idx on public.court_bookings (booking_date);

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------
create table public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  recipient_coach_id  uuid not null references public.coaches (id) on delete cascade,
  type                text,
  message             text,
  is_read             boolean not null default false,
  created_at          timestamptz not null default now()
);

create index notifications_recipient_idx on public.notifications (recipient_coach_id);

-- -----------------------------------------------------------------------------
-- keep weekly_assignments.updated_at fresh
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger weekly_assignments_set_updated_at
  before update on public.weekly_assignments
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Row Level Security
-- Policy model:
--   * Admins (coaches.is_admin = true) -> full edit on everything.
--   * Coaches -> read ONLY their own personal data (own assignments,
--     availability, rules, tournament assignments, requests, bookings,
--     notifications, and their own coach row).
--   * Config data (programs, sessions, tournaments) -> readable by any
--     authenticated coach, editable by admins only. The schedule grid needs
--     to render programs/sessions, but no one edits them except admins.
--   * Coaches may create their own change_requests and court_bookings, and
--     mark their own notifications read.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper functions (security definer so they can read coaches under RLS)
-- -----------------------------------------------------------------------------
create or replace function public.current_coach_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.coaches where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_admin from public.coaches where auth_user_id = auth.uid() limit 1),
    false);
$$;

revoke all on function public.current_coach_id() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.current_coach_id() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS on every table
-- -----------------------------------------------------------------------------
alter table public.coaches                enable row level security;
alter table public.programs               enable row level security;
alter table public.coach_rules            enable row level security;
alter table public.sessions               enable row level security;
alter table public.weekly_assignments     enable row level security;
alter table public.coach_availability     enable row level security;
alter table public.tournaments            enable row level security;
alter table public.tournament_assignments enable row level security;
alter table public.change_requests        enable row level security;
alter table public.court_bookings         enable row level security;
alter table public.notifications          enable row level security;

-- =============================================================================
-- coaches
-- =============================================================================
create policy "coaches: admin full access"
  on public.coaches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "coaches: read own row"
  on public.coaches for select to authenticated
  using (auth_user_id = auth.uid());

create policy "coaches: update own row"
  on public.coaches for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- =============================================================================
-- programs (config: read-all, admin-write)
-- =============================================================================
create policy "programs: read for authenticated"
  on public.programs for select to authenticated
  using (true);

create policy "programs: admin write"
  on public.programs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- sessions (config: read-all, admin-write)
-- =============================================================================
create policy "sessions: read for authenticated"
  on public.sessions for select to authenticated
  using (true);

create policy "sessions: admin write"
  on public.sessions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- tournaments (config: read-all, admin-write)
-- =============================================================================
create policy "tournaments: read for authenticated"
  on public.tournaments for select to authenticated
  using (true);

create policy "tournaments: admin write"
  on public.tournaments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- coach_rules (own read, admin write)
-- =============================================================================
create policy "coach_rules: admin full access"
  on public.coach_rules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "coach_rules: read own"
  on public.coach_rules for select to authenticated
  using (coach_id = public.current_coach_id());

-- =============================================================================
-- weekly_assignments (own read, admin write)
-- =============================================================================
create policy "weekly_assignments: admin full access"
  on public.weekly_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "weekly_assignments: read own"
  on public.weekly_assignments for select to authenticated
  using (coach_id = public.current_coach_id());

-- =============================================================================
-- coach_availability (own read, admin write)
-- =============================================================================
create policy "coach_availability: admin full access"
  on public.coach_availability for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "coach_availability: read own"
  on public.coach_availability for select to authenticated
  using (coach_id = public.current_coach_id());

-- =============================================================================
-- tournament_assignments (own read, admin write)
-- =============================================================================
create policy "tournament_assignments: admin full access"
  on public.tournament_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "tournament_assignments: read own"
  on public.tournament_assignments for select to authenticated
  using (coach_id = public.current_coach_id());

-- =============================================================================
-- change_requests (own read, coach can create own, admin reviews)
-- =============================================================================
create policy "change_requests: admin full access"
  on public.change_requests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "change_requests: read own"
  on public.change_requests for select to authenticated
  using (requesting_coach_id = public.current_coach_id());

create policy "change_requests: create own"
  on public.change_requests for insert to authenticated
  with check (requesting_coach_id = public.current_coach_id());

-- =============================================================================
-- court_bookings (own read, coach can create own, admin full)
-- =============================================================================
create policy "court_bookings: admin full access"
  on public.court_bookings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "court_bookings: read own"
  on public.court_bookings for select to authenticated
  using (coach_id = public.current_coach_id());

create policy "court_bookings: create own"
  on public.court_bookings for insert to authenticated
  with check (coach_id = public.current_coach_id());

-- =============================================================================
-- notifications (recipient reads + marks read, admin full)
-- =============================================================================
create policy "notifications: admin full access"
  on public.notifications for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "notifications: read own"
  on public.notifications for select to authenticated
  using (recipient_coach_id = public.current_coach_id());

create policy "notifications: mark own read"
  on public.notifications for update to authenticated
  using (recipient_coach_id = public.current_coach_id())
  with check (recipient_coach_id = public.current_coach_id());

-- =============================================================================
-- court_zones — reference/config table for the academy's physical courts.
--
-- Addition beyond the doc schema: the "Court Zones" section of CURSOR_CONTEXT.md
-- is concrete configuration the conflict engine needs (Court Zone Rule, Court
-- Double Booking, surface ties), but the doc DB schema had nowhere to store it.
-- sessions.court_zone / programs.priority_zone reference these by name.
--
-- blocks_main_campus_10am encodes the hard rule: a coach on West Campus or
-- Legacy at 8am is blocked from a 10am assignment on main campus the same day.
-- =============================================================================

create table public.court_zones (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null unique,
  courts                  text,
  surface                 text check (surface in ('Hard', 'Clay', 'Indoor')),
  location                text,
  rule                    text,
  blocks_main_campus_10am boolean not null default false
);

alter table public.court_zones enable row level security;

create policy "court_zones: read for authenticated"
  on public.court_zones for select to authenticated
  using (true);

create policy "court_zones: admin write"
  on public.court_zones for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- Seed: coach roster (from CURSOR_CONTEXT.md "Coach Roster")
-- Idempotent: only seeds when the coaches table is empty, so re-running
-- migrations/seeds never duplicates rows (core rule: never delete records).
--
-- Special cases encoded from the roster Notes column:
--   WB     -> midday block 12:00–13:00 daily; travel_restricted (no travel
--             outside Bradenton).
--   ANDREI -> summer only; 10:00 start / 15:00 end; no BT.
--   ANNA   -> summer only.
--   RB, JO -> program_restriction = 'adults_only' (Adults / Legacy only).
--   Summer coaches use the 2025 summer window (Jun 1 – Aug 21).
--   TBD coaches use season = 'tbd' until their program is confirmed.
--   JH, AMV, PM -> Tier 0 operations staff; is_admin = true. Admin access is
--             driven solely by is_admin; title drives the 48h booking window.
-- =============================================================================

do $$
begin
  if not exists (select 1 from public.coaches) then
    insert into public.coaches (
      full_name, initials, title, season, season_start, season_end,
      earliest_start, latest_end, midday_block_start, midday_block_end,
      no_camp, no_bt, no_drive, travel_restricted, program_restriction, is_active
    ) values
    -- full_name, initials, title, season, s_start, s_end, e_start, l_end, mb_start, mb_end, no_camp, no_bt, no_drive, travel_restricted, program_restriction, is_active
    ('Red David Ayme',      'RED',    'Senior Head Coach',              'year_round', null, null, null, null, null, null, true,  true,  false, false, null,          true),
    ('Eric Eichelbaum',     'EE',     'Senior Head Coach',              'year_round', null, null, null, null, null, null, true,  true,  false, false, null,          true),
    ('Aggelos Venizelos',   'AV',     'Senior Head Coach',              'year_round', null, null, null, null, null, null, true,  true,  false, false, null,          true),
    ('Martin Alund',        'ALUND',  'Senior Head Coach',              'year_round', null, null, null, null, null, null, true,  true,  false, false, null,          true),
    ('Jorge Gonzalez',      'JGZ',    'Senior Head Coach',              'year_round', null, null, null, null, null, null, true,  true,  false, false, null,          true),
    ('Jakub Grzeslo',       'JGO',    'Senior Head Coach',              'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Denis Pelegrin',      'DP',     'Senior Head Coach',              'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Roger Blackburn',     'RB',     'Senior Head Coach',              'year_round', null, null, null, null, null, null, false, false, false, false, 'adults_only', true),
    ('Peter Van Lieshout',  'PVL',    'Head Coach',                     'year_round', null, null, null, null, null, null, false, false, true,  false, null,          true),
    ('Neo Capellan',        'NEO',    'Head Coach',                     'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Arnaud Petel',        'APG',    'Head Coach',                     'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Tina Cvetkovic',      'TC',     'Head Coach',                     'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Dorian Cudina',       'DC',     'Head Coach',                     'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Nick Park',           'NP',     'Head Coach',                     'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Alvaro Figuerola',    'FIGO',   'Head Coach',                     'year_round', null, null, null, null, null, null, false, true,  false, false, null,          true),
    ('Hisa Sato',           'HS',     'Senior Asst Coach / Camp Lead',  'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Martin Damm',         'MD',     'Senior Assistant Coach',         'year_round', null, null, null, null, null, null, true,  true,  false, false, null,          true),
    ('Micah Klousia',       'MICAH',  'Senior Assistant Coach',         'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Joao Riquelme',       'JR',     'Senior Assistant Coach',         'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Isaac Johnson',       'IJ',     'Senior Assistant Coach',         'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Ricardo Icaza',       'RI',     'Senior Assistant Coach',         'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Wafik Bennacer',      'WB',     'Senior Assistant Coach',         'year_round', null, null, null, null, '12:00', '13:00', false, false, false, true,  null,          true),
    ('Jonathan Osuigwe',    'JO',     'Senior Assistant Coach',         'year_round', null, null, null, null, null, null, false, false, false, false, 'adults_only', true),
    ('Chad Oxendine',       'OX',     'Asst Coach / Camp Lead',         'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Peter Kovats',        'PK',     'Asst Coach / Camp Lead',         'year_round', null, null, null, null, null, null, false, false, true,  false, null,          true),
    ('Geoff',               'GEOFF',  'Assistant Coach',                'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Nicola Manni',        'NM',     'Asst Coach / Camp Lead',         'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Cole Schneider',      'CL',     'Assistant Coach',                'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Joseph Wymer',        'JW',     'Assistant Coach',                'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Alexandra Pisareva',  'APS',    'Assistant Coach',                'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Alex Haizel',         'AH',     'Assistant Coach',                'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Alejandro Dejesus',   'AD',     'Assistant Coach',                'year_round', null, null, null, null, null, null, false, false, true,  false, null,          true),
    ('Bart Meister',        'BM',     'Assistant Coach',                'tbd',        null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Caio Larcedo',        'CAIO',   'Assistant Coach',                'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Karim Chaouqi',       'KC',     'Assistant Coach',                'year_round', null, null, null, null, null, null, false, true,  true,  false, null,          true),
    ('Ramon Rincon Jimenez','RAMON',  'Assistant Coach',                'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Xavier Pino',         'XP',     'Assistant Coach',                'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Andrey Cherkasov',    'ANDREI', 'Assistant Coach',                'summer_only', '2025-06-01', '2025-08-21', '10:00', '15:00', null, null, false, true,  false, false, null,          true),
    ('Anna Shumate',        'ANNA',   'Assistant Coach',                'summer_only', '2025-06-01', '2025-08-21', null, null, null, null, false, false, false, false, null,          true),
    ('Tianyu Bao',          'BAO',    'Performance Analyst',            'year_round', null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Sofia Pepe',          'SFP',    'Assistant Coach',                'tbd',        null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Olivia Bryant',       'OB',     'Assistant Coach',                'tbd',        null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Noa Cohen',           'NC',     'Assistant Coach',                'tbd',        null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Max Linder',          'ML',     'Assistant Coach',                'tbd',        null, null, null, null, null, null, false, false, false, false, null,          true),
    ('Sule Ladipo',         'SL',     'Assistant Coach',                'tbd',        null, null, null, null, null, null, false, false, false, false, null,          true);

    -- Tier 0 operations staff. Admin access is granted solely by is_admin = true.
    -- Title drives display + the 48-hour indoor court booking window only.
    insert into public.coaches (full_name, initials, title, season, is_admin, is_active) values
    ('Juan Herrera',     'JH',  'Director of Tennis',                      'year_round', true, true),
    ('Amar Vora',        'AMV', 'Assistant Director of Tennis Operations', 'year_round', true, true),
    ('Phillip McMurray', 'PM',  'Tennis Operations Coordinator',           'year_round', true, true);
  end if;
end $$;

-- =============================================================================
-- Seed: programs (from CURSOR_CONTEXT.md "Programs")
-- head_coach_id resolved by coach initials (AGGE -> AV). Programs with multiple
-- listed coaches use the first listed as head; "varies"/"admin" stay null.
-- priority_zone = 'Zone C' for Competitive Girls 1 and Developmental Boys 1
-- (Court Priority rule: C1 Girls + D1 Boys priority on Hard 15-21).
-- =============================================================================

do $$
begin
  if not exists (select 1 from public.programs) then
    insert into public.programs (
      name, type, gender, head_coach_id, is_two_a_day, default_surface, default_courts, priority_zone
    ) values
    ('Competitive Boys 1 (Academy)', 'competitive',   'boys',  (select id from public.coaches where initials = 'AV'),   false, null,   null,         null),
    ('Competitive Boys 2',           'competitive',   'boys',  (select id from public.coaches where initials = 'FIGO'), false, null,   null,         null),
    ('Competitive Girls 1',          'competitive',   'girls', (select id from public.coaches where initials = 'RED'),  false, null,   null,         'Zone C'),
    ('Competitive Girls 2',          'competitive',   'girls', (select id from public.coaches where initials = 'EE'),   false, null,   null,         null),
    ('Developmental Boys 1',         'developmental', 'boys',  (select id from public.coaches where initials = 'RED'),  false, null,   null,         'Zone C'),
    ('Developmental Boys 1.5',       'developmental', 'boys',  (select id from public.coaches where initials = 'DC'),   false, null,   null,         null),
    ('Developmental Boys 2',         'developmental', 'boys',  (select id from public.coaches where initials = 'JGO'),  false, null,   null,         null),
    ('Developmental Girls 1',        'developmental', 'girls', (select id from public.coaches where initials = 'NEO'),  false, null,   null,         null),
    ('Developmental Girls 2',        'developmental', 'girls', (select id from public.coaches where initials = 'DP'),   false, null,   null,         null),
    ('Foundational Boys 1',          'foundational',  'boys',  (select id from public.coaches where initials = 'TC'),   false, null,   null,         null),
    ('Foundational Boys 2',          'foundational',  'boys',  (select id from public.coaches where initials = 'APG'),  false, null,   null,         null),
    ('Foundational Girls 1',         'foundational',  'girls', (select id from public.coaches where initials = 'NP'),   false, null,   null,         null),
    ('Foundational Girls 2',         'foundational',  'girls', (select id from public.coaches where initials = 'DC'),   false, null,   null,         null),
    ('Junior Camp AM',               'camp',          'mixed', (select id from public.coaches where initials = 'HS'),   false, null,   null,         null),
    ('Junior Camp PM',               'camp',          'mixed', (select id from public.coaches where initials = 'HS'),   false, null,   null,         null),
    ('Adults Regular',               'adults',        'mixed', (select id from public.coaches where initials = 'JO'),   false, null,   null,         null),
    ('Adults Special Help',          'adults',        'mixed', (select id from public.coaches where initials = 'JO'),   false, null,   null,         null),
    ('Adults Legacy',                'adults',        'mixed', (select id from public.coaches where initials = 'RB'),   false, 'Clay', 'Legacy 1-6', null),
    ('Female Pros',                  'pro',           'girls', (select id from public.coaches where initials = 'JGZ'),  false, 'Clay', 'ST Clay',    null),
    ('Pro / Elite Boys',             'pro',           'boys',  (select id from public.coaches where initials = 'AV'),   false, 'Hard', 'ST Hard',    null),
    ('Breakthrough (BT)',            'bt',            'mixed', null,                                                    false, null,   null,         null),
    ('Tournament Travel',            'travel',        'mixed', null,                                                    false, null,   null,         null),
    ('Saturday Combined',            'saturday',      'mixed', null,                                                    false, null,   null,         null);
  end if;
end $$;

-- =============================================================================
-- Seed: court_zones (from CURSOR_CONTEXT.md "Court Zones")
-- West Campus and Legacy carry the 8am->no-10am-main-campus block.
-- =============================================================================

do $$
begin
  if not exists (select 1 from public.court_zones) then
    insert into public.court_zones (name, courts, surface, location, rule, blocks_main_campus_10am) values
    ('Zone A',      'Hard 1-7',      'Hard',  'Main campus', 'No buffer needed. Can combine with Zone B',                                  false),
    ('Zone B',      'Hard 8-14',     'Hard',  'Main campus', 'Adjacent to Zone A and Green Clay',                                          false),
    ('Zone C',      'Hard 15-21',    'Hard',  'Main campus', 'Priority: C1 Girls and D1 Boys',                                             false),
    ('Zone D',      'Hard 22-28',    'Hard',  'Main campus', 'Adjacent to Zone C',                                                         false),
    ('Green Clay',  'Clay 1-9',      'Clay',  'Main campus', 'Clay 6-7 ties with Hard 1-7 or 4-7. Clay 8-9 ties with Hard 8-14 or 11-14',  false),
    ('Red Clay',    'Red Clay 1-4',  'Clay',  'Main campus', 'Adults and Pros. Can tie with Hard 1-3 if needed',                           false),
    ('ST Clay',     'ST Clay',       'Clay',  'Main campus', '1 court. Female Pros PM',                                                    false),
    ('ST Hard',     'ST Hard',       'Hard',  'Main campus', '1 court. Pros primarily',                                                    false),
    ('Indoor',      'Indoors 1-4',   'Indoor','Main campus', 'Booking windows apply by title tier',                                        false),
    ('West Campus', 'West Clay 1-5', 'Clay',  'West Campus', '8am here blocks 10am on main campus',                                        true),
    ('Legacy',      'Legacy 1-6',    'Clay',  'Legacy',      '8am here blocks 10am on main campus. Afternoon preferred',                   true);
  end if;
end $$;

-- =============================================================================
-- Seed: sessions (recurring weekly session grid for the schedule builder)
-- Configuration data: the weekly template the academy runs Mon–Sat. Weekly
-- coach assignments are layered on top per week_start_date. Idempotent.
-- court_numbers are ranges (e.g. "Hard 15-18"); the app expands them into
-- individual courts for the Court Double Booking conflict check.
-- =============================================================================

do $$
begin
  if not exists (select 1 from public.sessions) then
    insert into public.sessions (
      program_id, day_of_week, start_time, end_time, court_zone, court_numbers, surface, season
    )
    select p.id, d.day, t.start_time, t.end_time, t.court_zone, t.court_numbers, t.surface, 'all'
    from (values
      ('Competitive Girls 1',          '08:00'::time, '10:00'::time, 'Zone C',   'Hard 15-18',  'Hard'),
      ('Competitive Boys 1 (Academy)', '08:00'::time, '10:00'::time, 'Zone B',   'Hard 8-11',   'Hard'),
      ('Pro / Elite Boys',             '08:00'::time, '10:00'::time, 'ST Hard',  'ST Hard',     'Hard'),
      ('Developmental Boys 1',         '10:00'::time, '12:00'::time, 'Zone C',   'Hard 19-21',  'Hard'),
      ('Foundational Boys 1',          '10:00'::time, '12:00'::time, 'Zone A',   'Hard 1-4',    'Hard'),
      ('Junior Camp AM',               '09:00'::time, '12:00'::time, 'Zone D',   'Hard 22-25',  'Hard'),
      ('Adults Regular',               '12:00'::time, '13:00'::time, 'Red Clay', 'Red Clay 1-4','Clay'),
      ('Junior Camp PM',               '14:30'::time, '16:30'::time, 'Zone D',   'Hard 22-25',  'Hard'),
      ('Breakthrough (BT)',            '16:00'::time, '17:30'::time, 'Zone B',   'Hard 12-14',  'Hard')
    ) as t(program_name, start_time, end_time, court_zone, court_numbers, surface)
    join public.programs p on p.name = t.program_name
    cross join (values
      ('monday'),('tuesday'),('wednesday'),('thursday'),('friday')
    ) as d(day);

    insert into public.sessions (
      program_id, day_of_week, start_time, end_time, court_zone, court_numbers, surface, season, notes
    )
    select p.id, 'saturday', '09:00'::time, '12:00'::time, 'Zone A', 'Hard 1-7', 'Hard', 'all',
           'Saturday combined session'
    from public.programs p
    where p.name = 'Saturday Combined';
  end if;
end $$;

