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
