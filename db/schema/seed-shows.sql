-- Seed the 2026 season's public (Redovna) shows from docs/performances.md.
--
-- Idempotent via WHERE NOT EXISTS: only fires on a fresh DB (shows table
-- empty). Once any show is in the table — manually or from this seed —
-- subsequent runs are no-ops. Re-running won't clobber sold counts or
-- manually-added private shows.
--
-- Non-Redovna shows from performances.md (Gulliver, Adriatic DMC, KONCERT,
-- Sv. Todor) are intentionally NOT seeded — those are private bookings or
-- off-site events handled by the operator and shouldn't appear on the
-- public /tickets page. Add them via the admin when they're confirmed.
--
-- All entries default to status='active', venue='ljetno-kino', 21:00.
-- onlineSold/inPersonSold default to 0 (per the column defaults).

INSERT INTO shows (date, time, venue, status)
SELECT * FROM (VALUES
  ('2026-05-18 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-05-25 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-06-08 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-06-10 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-06-22 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-06-24 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-07-06 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-07-09 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-07-20 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-07-23 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-08-03 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-08-06 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-08-17 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-08-20 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-08-31 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-09-02 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-09-14 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-09-16 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-09-28 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-09-30 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-10-12 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status),
  ('2026-10-14 12:00:00+00'::timestamptz, '21:00', 'ljetno-kino'::enum_shows_venue, 'active'::enum_shows_status)
) AS v(date, time, venue, status)
WHERE NOT EXISTS (SELECT 1 FROM shows);

-- Legacy reservations (#256). Tickets sold on the old korcula-moreska.com
-- (Tickera/WooCommerce) system for shows that fall AFTER cutover. Those seats
-- are already gone, so block them from online sale on the new site. Static,
-- known set for the 2026 season (per the legacy export): 2026-06-08 → 7,
-- 2026-06-22 → 2.
--
-- Restart-safe + reset-safe: these run on every bootstrap (unlike the INSERT
-- above, which only fires on an empty table), AFTER the shows exist, so they
-- survive container restarts AND re-apply cleanly if the DB is reset and
-- re-seeded. The `legacy_reserved = 0` guard makes them seed-once: an already
-- non-zero value (e.g. a later manual admin adjustment) is left untouched.
UPDATE shows SET legacy_reserved = 7 WHERE date::date = '2026-06-08' AND legacy_reserved = 0;
UPDATE shows SET legacy_reserved = 2 WHERE date::date = '2026-06-22' AND legacy_reserved = 0;
