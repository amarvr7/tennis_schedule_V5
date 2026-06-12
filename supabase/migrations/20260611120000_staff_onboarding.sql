-- =============================================================================
-- Staff onboarding — per-coach contracted hours + certifications ledger
-- =============================================================================

alter table public.coaches
  add column if not exists contracted_weekly_hours numeric(4, 1)
    check (contracted_weekly_hours is null or (contracted_weekly_hours >= 0 and contracted_weekly_hours <= 60));

-- -----------------------------------------------------------------------------
-- coach_certifications — coaching credentials tracked at onboarding
-- -----------------------------------------------------------------------------
create table if not exists public.coach_certifications (
  id                 uuid primary key default gen_random_uuid(),
  coach_id           uuid not null references public.coaches (id) on delete cascade,
  certification_type text not null
                       check (certification_type in (
                         'ptr', 'uspta', 'itf', 'cpr_first_aid', 'safesport', 'other'
                       )),
  label              text,
  expires_on         date,
  created_at         timestamptz not null default now()
);

create index if not exists coach_certifications_coach_id_idx
  on public.coach_certifications (coach_id);

create index if not exists coach_certifications_expires_on_idx
  on public.coach_certifications (expires_on);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.coach_certifications enable row level security;

create policy "coach_certifications: admin full access"
  on public.coach_certifications for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "coach_certifications: read own"
  on public.coach_certifications for select to authenticated
  using (coach_id = public.current_coach_id());
