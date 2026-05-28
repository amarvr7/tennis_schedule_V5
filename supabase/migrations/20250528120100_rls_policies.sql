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
