-- The 14 NON-PUBLIC performances of the 2026 season (#411, ADR-0024 phase 2).
--
-- Source: the table in #404, which `docs/performances.md` and the print
-- spreadsheet both agree with. Adriatic DMC and Gulliver cruise-ship calls, the
-- Sv. Justina concert and the Sv. Todor performance. After this import the
-- `shows` table is the source of truth for EVERY performance and
-- `docs/performances.md` is a frozen historical print.
--
-- A non-public performance carries a free-text `location` (and, for a ship
-- booking, a `client`) instead of a venue: `venue` is deliberately absent from
-- the column list so it lands NULL. `threshold_crni` / `threshold_bili` (8/8)
-- and the sold counters (0) come from their column defaults. Dates are stamped
-- at noon UTC, matching `seed-shows.sql` and dodging the raw-pg Date gotcha.
--
-- ORDERING: sorts after `migrate-shows-performance.sql` (which adds `kind`,
-- `is_public`, `location`, `client` and makes `venue` nullable) and after
-- `seed-shows.sql` — the `zz` is there to beat `seed-shows.sql`, since `-`
-- sorts BEFORE `.` and a plain `seed-shows-nonpublic.sql` would run first.
--
-- THE GUARD: the whole INSERT fires only while NO non-public row exists at all.
-- bootstrap-db.mjs re-applies every file in this directory on every restart, so
-- a per-row `WHERE NOT EXISTS (date, time)` guard would resurrect a performance
-- the voditelj deleted on the next deploy (#404, rejected explicitly). Once any
-- non-public row exists — from this seed, or entered by hand in the admin — this
-- file is a permanent no-op. The Redovna seed keeps its own "table empty" guard.

INSERT INTO shows (date, time, kind, is_public, location, client, status)
SELECT * FROM (VALUES
  ('2026-05-29 12:00:00+00'::timestamptz, '20:30', 'koncert'::enum_shows_kind,  false, 'Sv. Justina',          NULL,              'active'::enum_shows_status),
  ('2026-06-16 12:00:00+00'::timestamptz, '10:00', 'dmc'::enum_shows_kind,      false, 'Zimsko kino',          'Le Ponant',       'active'::enum_shows_status),
  ('2026-07-14 12:00:00+00'::timestamptz, '10:30', 'gulliver'::enum_shows_kind, false, 'Zimsko kino',          'Le Bougainville', 'active'::enum_shows_status),
  ('2026-07-29 12:00:00+00'::timestamptz, '21:30', 'ostalo'::enum_shows_kind,   false, 'Spomenik sv. Todora',  NULL,              'active'::enum_shows_status),
  ('2026-08-05 12:00:00+00'::timestamptz, '19:00', 'gulliver'::enum_shows_kind, false, 'Ljetno kino',          'Le Ponant',       'active'::enum_shows_status),
  ('2026-08-12 12:00:00+00'::timestamptz, '19:00', 'gulliver'::enum_shows_kind, false, 'Ljetno kino',          'Le Ponant',       'active'::enum_shows_status),
  ('2026-08-13 12:00:00+00'::timestamptz, '16:30', 'dmc'::enum_shows_kind,      false, 'Zimsko kino',          'NG Orion',        'active'::enum_shows_status),
  ('2026-08-19 12:00:00+00'::timestamptz, '19:00', 'gulliver'::enum_shows_kind, false, 'Ljetno kino',          'Le Ponant',       'active'::enum_shows_status),
  ('2026-08-20 12:00:00+00'::timestamptz, '16:30', 'dmc'::enum_shows_kind,      false, 'Zimsko kino',          'NG Orion',        'active'::enum_shows_status),
  ('2026-08-26 12:00:00+00'::timestamptz, '19:00', 'gulliver'::enum_shows_kind, false, 'Ljetno kino',          'Le Ponant',       'active'::enum_shows_status),
  ('2026-09-08 12:00:00+00'::timestamptz, '10:00', 'dmc'::enum_shows_kind,      false, 'Zimsko kino',          'Le Ponant',       'active'::enum_shows_status),
  ('2026-09-15 12:00:00+00'::timestamptz, '10:00', 'dmc'::enum_shows_kind,      false, 'Zimsko kino',          'Le Ponant',       'active'::enum_shows_status),
  ('2026-09-22 12:00:00+00'::timestamptz, '10:00', 'dmc'::enum_shows_kind,      false, 'Zimsko kino',          'Le Ponant',       'active'::enum_shows_status),
  ('2026-10-15 12:00:00+00'::timestamptz, '18:00', 'dmc'::enum_shows_kind,      false, 'Zimsko kino',          'Lady Eleganza',   'active'::enum_shows_status)
) AS v(date, time, kind, is_public, location, client, status)
WHERE NOT EXISTS (SELECT 1 FROM shows WHERE is_public = false);
