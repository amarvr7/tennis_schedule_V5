-- =============================================================================
-- Season scheduling — CURSOR_ANSWERS.md Q1–Q6
--
--   Q1  Staffing is defined per group (program): required lead/assistant
--       counts on programs + a season roster table (group_coach_roster).
--       Non-roster fills are recorded as substitutes on weekly_assignments.
--   Q2  One master week template per season (template_sessions). Creating a
--       week clones the template into week-owned sessions rows
--       (sessions.week_start_date). Week edits never touch the master.
--   Q3  schedule_weeks holds the per-week record (camp_headcount entered by
--       admin at week setup). programs.base_capacity powers the camp
--       overflow warning. Overflow ratio lives in season_settings.
--   Q4  Sub history is tracked via weekly_assignments.sub +
--       subbing_for_coach_id; ranking values are season_settings, not code.
--   Q6  change_requests is renamed/repurposed as schedule_change_log: an
--       append-only audit trail of every schedule change (old/new value,
--       who, when, why). No approval workflow.
--
-- Core rule: never delete records — archive/deactivate only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- programs — staffing requirements (Q1) + camp capacity (Q3)
-- -----------------------------------------------------------------------------
alter table public.programs
  add column if not exists required_lead_count int not null default 1
    check (required_lead_count >= 0),
  add column if not exists required_assistant_count int not null default 0
    check (required_assistant_count >= 0),
  add column if not exists base_capacity int
    check (base_capacity is null or base_capacity > 0);

comment on column public.programs.base_capacity is
  'Camp only: head count the fixed roster is sized for. Overflow shows a coverage warning (Q3).';

-- -----------------------------------------------------------------------------
-- group_coach_roster — the group''s assigned coach team for a season (Q1)
-- -----------------------------------------------------------------------------
create table if not exists public.group_coach_roster (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  coach_id   uuid not null references public.coaches (id) on delete cascade,
  role       text not null check (role in ('lead', 'assistant')),
  season     text not null default 'summer_2025',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- One live roster row per coach per group per season (deactivated rows are history).
create unique index if not exists group_coach_roster_unique_active
  on public.group_coach_roster (program_id, coach_id, season)
  where is_active;

create index if not exists group_coach_roster_program_idx
  on public.group_coach_roster (program_id, season);
create index if not exists group_coach_roster_coach_idx
  on public.group_coach_roster (coach_id, season);

-- -----------------------------------------------------------------------------
-- template_sessions — the master week template, one per season (Q2)
-- -----------------------------------------------------------------------------
create table if not exists public.template_sessions (
  id               uuid primary key default gen_random_uuid(),
  season           text not null default 'summer_2025',
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
  notes            text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  constraint template_sessions_time_order check (end_time > start_time)
);

create index if not exists template_sessions_season_idx
  on public.template_sessions (season, is_active);

-- -----------------------------------------------------------------------------
-- sessions — week ownership (Q2)
--   Legacy rows (week_start_date is null) remain readable for historical weeks.
--   New weeks get their own cloned copies; edits to a week touch only its copies.
-- -----------------------------------------------------------------------------
alter table public.sessions
  add column if not exists week_start_date date,
  add column if not exists template_session_id uuid
    references public.template_sessions (id) on delete set null,
  add column if not exists is_active boolean not null default true;

create index if not exists sessions_week_start_date_idx
  on public.sessions (week_start_date);

-- -----------------------------------------------------------------------------
-- schedule_weeks — one record per scheduled week (Q2 / Q3)
-- -----------------------------------------------------------------------------
create table if not exists public.schedule_weeks (
  id                       uuid primary key default gen_random_uuid(),
  week_start_date          date not null unique,
  season                   text not null default 'summer_2025',
  camp_headcount           int check (camp_headcount is null or camp_headcount >= 0),
  status                   text not null default 'draft' check (status in ('draft', 'published')),
  created_from_template_at timestamptz,
  created_at               timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- weekly_assignments — substitute tracking (Q1 / Q4)
-- -----------------------------------------------------------------------------
alter table public.weekly_assignments
  add column if not exists sub boolean not null default false,
  add column if not exists subbing_for_coach_id uuid
    references public.coaches (id) on delete set null;

create index if not exists weekly_assignments_sub_idx
  on public.weekly_assignments (coach_id, sub)
  where sub;

-- -----------------------------------------------------------------------------
-- schedule_change_log — rename/repurpose change_requests (Q6)
--   Append-only audit of every schedule change. No approval workflow.
-- -----------------------------------------------------------------------------
alter table public.change_requests rename to schedule_change_log;
alter index if exists change_requests_requesting_coach_idx
  rename to schedule_change_log_legacy_coach_idx;

alter table public.schedule_change_log
  alter column requesting_coach_id drop not null;

alter table public.schedule_change_log
  drop constraint if exists change_requests_status_check;

alter table public.schedule_change_log
  add column if not exists week_start_date date,
  add column if not exists session_id uuid references public.sessions (id) on delete set null,
  add column if not exists coach_id uuid references public.coaches (id) on delete set null,
  add column if not exists changed_by uuid references public.coaches (id) on delete set null,
  add column if not exists changed_at timestamptz not null default now(),
  add column if not exists action text
    check (action in ('assign', 'unassign', 'swap', 'session_change')),
  add column if not exists old_value jsonb,
  add column if not exists new_value jsonb;

comment on column public.schedule_change_log.coach_id is
  'The coach affected by the change (added, removed, or swapped).';

alter table public.schedule_change_log
  drop constraint if exists schedule_change_log_reason_check;
alter table public.schedule_change_log
  add constraint schedule_change_log_reason_check
  check (reason is null or reason in ('sick', 'travel', 'swap', 'other'));

create index if not exists schedule_change_log_week_idx
  on public.schedule_change_log (week_start_date);
create index if not exists schedule_change_log_coach_idx
  on public.schedule_change_log (coach_id);

-- -----------------------------------------------------------------------------
-- season_settings — configurable per-season values (Q3 / Q4: never hardcode)
-- -----------------------------------------------------------------------------
create table if not exists public.season_settings (
  id         uuid primary key default gen_random_uuid(),
  season     text not null,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  unique (season, key)
);

-- Camp overflow default: 1 extra coach per 8 campers over base capacity (Q3).
insert into public.season_settings (season, key, value)
values ('summer_2025', 'camp_overflow_per_coach', '8'::jsonb)
on conflict (season, key) do nothing;

-- -----------------------------------------------------------------------------
-- Camp Director helper — read-only visibility into camp scheduling.
-- Title-driven visibility only; NEVER admin access (admin = is_admin flag).
-- -----------------------------------------------------------------------------
create or replace function public.is_camp_director()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select title = 'Camp Director' from public.coaches where auth_user_id = auth.uid() limit 1),
    false);
$$;

revoke all on function public.is_camp_director() from public;
grant execute on function public.is_camp_director() to authenticated;

-- True when the session belongs to a camp program.
create or replace function public.session_is_camp(p_session_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.sessions s
    join public.programs p on p.id = s.program_id
    where s.id = p_session_id and p.type = 'camp');
$$;

revoke all on function public.session_is_camp(uuid) from public;
grant execute on function public.session_is_camp(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.group_coach_roster enable row level security;
alter table public.template_sessions  enable row level security;
alter table public.schedule_weeks     enable row level security;
alter table public.season_settings    enable row level security;
-- schedule_change_log keeps RLS enabled from its change_requests days.

-- Rosters are config data: readable by any authenticated coach, admin-write.
create policy "group_coach_roster: read for authenticated"
  on public.group_coach_roster for select to authenticated
  using (true);

create policy "group_coach_roster: admin write"
  on public.group_coach_roster for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "template_sessions: read for authenticated"
  on public.template_sessions for select to authenticated
  using (true);

create policy "template_sessions: admin write"
  on public.template_sessions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "schedule_weeks: read for authenticated"
  on public.schedule_weeks for select to authenticated
  using (true);

create policy "schedule_weeks: admin write"
  on public.schedule_weeks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "season_settings: read for authenticated"
  on public.season_settings for select to authenticated
  using (true);

create policy "season_settings: admin write"
  on public.season_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Old change_requests policies referenced requesting_coach_id; replace them.
drop policy if exists "change_requests: admin full access" on public.schedule_change_log;
drop policy if exists "change_requests: read own" on public.schedule_change_log;
drop policy if exists "change_requests: create own" on public.schedule_change_log;

create policy "schedule_change_log: admin full access"
  on public.schedule_change_log for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- The affected coach can see changes that touch them ("changed" indicators).
create policy "schedule_change_log: read own"
  on public.schedule_change_log for select to authenticated
  using (coach_id = public.current_coach_id());

-- Camp Director sees every change that touches a camp session (Q6 visibility).
create policy "schedule_change_log: camp director reads camp changes"
  on public.schedule_change_log for select to authenticated
  using (public.is_camp_director() and public.session_is_camp(session_id));

-- Head coaches see changes touching their own group.
create policy "schedule_change_log: head coach reads group changes"
  on public.schedule_change_log for select to authenticated
  using (exists (
    select 1
    from public.sessions s
    join public.programs p on p.id = s.program_id
    where s.id = schedule_change_log.session_id
      and p.head_coach_id = public.current_coach_id()));

-- Camp Director: read-only view of ALL camp assignments (new role).
create policy "weekly_assignments: camp director reads camp"
  on public.weekly_assignments for select to authenticated
  using (public.is_camp_director() and public.session_is_camp(session_id));

-- Head coaches: read assignments across their own group.
create policy "weekly_assignments: head coach reads group"
  on public.weekly_assignments for select to authenticated
  using (exists (
    select 1
    from public.sessions s
    join public.programs p on p.id = s.program_id
    where s.id = weekly_assignments.session_id
      and p.head_coach_id = public.current_coach_id()));
