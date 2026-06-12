-- =============================================================================
-- Weekly availability collection — contact fields, collections, requests
-- Magic-link forms write into coach_availability (existing table).
-- Core rule: never delete records — collections close, requests archive status.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- coaches — contact + channel preference
-- -----------------------------------------------------------------------------
alter table public.coaches
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists preferred_channel text not null default 'email'
    check (preferred_channel in ('email', 'sms', 'whatsapp'));

create index if not exists coaches_preferred_channel_idx on public.coaches (preferred_channel);

-- -----------------------------------------------------------------------------
-- availability_collections — one open window per target week
-- -----------------------------------------------------------------------------
create table public.availability_collections (
  id              uuid primary key default gen_random_uuid(),
  week_start_date date not null unique,
  status          text not null default 'open'
                    check (status in ('open', 'closed')),
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  created_at      timestamptz not null default now()
);

create index availability_collections_status_idx on public.availability_collections (status);
create index availability_collections_week_idx on public.availability_collections (week_start_date desc);

-- -----------------------------------------------------------------------------
-- availability_requests — per-coach send + response tracking
-- -----------------------------------------------------------------------------
create table public.availability_requests (
  id               uuid primary key default gen_random_uuid(),
  collection_id    uuid not null references public.availability_collections (id) on delete cascade,
  coach_id         uuid not null references public.coaches (id) on delete cascade,
  channel          text not null check (channel in ('email', 'sms', 'whatsapp')),
  token            uuid not null default gen_random_uuid() unique,
  sent_at          timestamptz,
  reminder_count   int not null default 0,
  last_reminded_at timestamptz,
  responded_at     timestamptz,
  status           text not null default 'pending'
                     check (status in ('pending', 'responded', 'no_response')),
  created_at       timestamptz not null default now(),
  unique (collection_id, coach_id)
);

create index availability_requests_collection_idx on public.availability_requests (collection_id);
create index availability_requests_coach_idx on public.availability_requests (coach_id);
create index availability_requests_status_idx on public.availability_requests (status);
create index availability_requests_token_idx on public.availability_requests (token);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.availability_collections enable row level security;
alter table public.availability_requests     enable row level security;

create policy "availability_collections: admin full access"
  on public.availability_collections for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "availability_requests: admin full access"
  on public.availability_requests for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "availability_requests: read own"
  on public.availability_requests for select to authenticated
  using (coach_id = public.current_coach_id());
