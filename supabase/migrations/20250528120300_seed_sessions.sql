-- =============================================================================
-- Seed: sessions (recurring weekly session grid for the schedule builder)
--
-- The doc DB schema seeds coaches, programs and court_zones but no sessions.
-- The Weekly Schedule Builder needs a set of recurring sessions to render the
-- grid (days as columns, time slots as rows). These are CONFIGURATION DATA:
-- the weekly template the academy runs Mon–Sat. Weekly coach assignments are
-- layered on top per `week_start_date` in `weekly_assignments`.
--
-- Idempotent: only seeds when the sessions table is empty (core rule: never
-- delete records — re-running migrations must never duplicate rows).
--
-- court_numbers are stored as ranges (e.g. "Hard 15-18"); the app expands them
-- into individual courts for the Court Double Booking conflict check.
-- =============================================================================

do $$
begin
  if not exists (select 1 from public.sessions) then
    -- Weekday template (Mon–Fri): each row is one program at a fixed slot/court.
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

    -- Saturday combined session.
    insert into public.sessions (
      program_id, day_of_week, start_time, end_time, court_zone, court_numbers, surface, season, notes
    )
    select p.id, 'saturday', '09:00'::time, '12:00'::time, 'Zone A', 'Hard 1-7', 'Hard', 'all',
           'Saturday combined session'
    from public.programs p
    where p.name = 'Saturday Combined';
  end if;
end $$;
