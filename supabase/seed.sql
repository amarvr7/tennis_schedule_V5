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

