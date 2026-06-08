-- =============================================================================
-- Tournament Travel Planner — Phase A foundation
-- Links tournaments to programs, adds publish workflow fields, and assignment
-- role/status for travel roster management.
-- =============================================================================

alter table public.tournaments
  add column if not exists program_id uuid references public.programs (id) on delete set null,
  add column if not exists published_at timestamptz,
  add column if not exists is_archived boolean not null default false;

alter table public.tournament_assignments
  add column if not exists role text check (role in ('lead', 'assistant', 'driver')),
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  add column if not exists created_at timestamptz not null default now();

create index if not exists tournaments_program_id_idx on public.tournaments (program_id);
create index if not exists tournaments_start_date_idx on public.tournaments (start_date);
create index if not exists tournament_assignments_status_idx
  on public.tournament_assignments (status);
