-- =============================================================================
-- Adults head counts — per-session enrollment numbers.
--
-- Unlike juniors (stable groups, roster-driven) and camp (one weekly number),
-- adults enrollment differs each day and between the AM and PM tracks. The
-- number therefore lives on the week's SESSION row, which is already scoped
-- to a day + time block.
--
-- Ratio: 1 coach per 4 adults (owner-confirmed, same ratio as juniors).
-- Stored as a season setting — never hardcoded (CURSOR_ANSWERS.md Q3/Q4).
-- Coverage shows a WARNING when assigned staff is short of the ratio; nothing
-- is blocked or auto-assigned, matching the camp overflow behavior.
-- =============================================================================

alter table public.sessions
  add column if not exists headcount int
    check (headcount is null or headcount >= 0);

comment on column public.sessions.headcount is
  'Enrollment for this specific session (adults: varies per day and AM/PM). Drives the coverage staffing warning; warn-only, never blocks.';

-- 1 coach per 4 adults.
insert into public.season_settings (season, key, value)
values ('summer_2025', 'adults_per_coach', '4'::jsonb)
on conflict (season, key) do nothing;
