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
