-- Odustali: who said "dolazim" and then took it back (#612).
--
-- Glossary: CONTEXT.md → *Odustajanje*. A dancer who answers `dolazim`, leaves
-- it standing for at least ten minutes and then moves to `ne dolazim` has
-- ODUSTAO — a hole in an evening somebody was counting on. A faster reversal is
-- a mis-tap correcting itself and is not recorded as anything.
--
-- Three columns rather than a history table, deliberately. `attendance` keeps one
-- row per (performance, member) and the answer route upserts it, so the earlier
-- answer is gone the moment the next one lands. The voditelj's question is not
-- "what did this person click all season" but "who is missing from tonight that
-- I thought I had", and that is a property of the row as it stands now:
--
--   confirmed_at  when the row most recently ENTERED `coming`. Untouched while
--                 the answer stays `coming`, which is what makes the ten-minute
--                 window measure the standing answer rather than the last tap.
--   withdrew_at   when a standing `coming` was taken back. NULL on every other
--                 row, including the fast correction and the dancer who never
--                 said they were coming at all.
--   withdrew_own  whether the DANCER took it back or a voditelj wrote it down
--                 for them. Stamped at write time because the fact is free
--                 there and needs the field-locked `Users.member` link to
--                 recover afterwards. A dancer who withdrew has gone quiet; one
--                 a voditelj wrote down phoned somebody.
--
-- Returning to `dolazim` clears `withdrew_at` (the list is a picture of who is
-- missing, not a reliability file), and clearing an answer deletes the row and
-- with it both stamps.
--
-- The rule lives once, in `src/lib/attendance/withdrawal-stamp.ts`, and the
-- answer route is its only writer. Nothing backfills: rows answered before this
-- migration carry NULL in both columns, so Odustali begins empty and fills from
-- the first answer after deploy.
--
-- ORDERING: bootstrap-db.mjs applies these files in plain filename order with no
-- dependency resolution (db/schema/README.md). This one only ALTERs a table, so
-- it must sort after `migrate-zz-attendance.sql` which creates it — `zz-a…`
-- sorts before `zz-dj…`, and `zz-dj-` continues the `zz-d…` sequence while
-- still sorting before `migrate-zz-drop-users-role.sql`, which must stay the
-- final `migrate-*` file (#398, asserted by `db-schema-safety.test.ts`).
--
-- Every statement is guarded and safe to re-run on every restart.

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS confirmed_at timestamp(3) with time zone;

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS withdrew_at timestamp(3) with time zone;

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS withdrew_own boolean;

-- Stanje reads "who withdrew from THIS evening", never "everything this dancer
-- ever did", so the index opens with the performance. Partial, because the
-- overwhelming majority of rows have never withdrawn anything.
CREATE INDEX IF NOT EXISTS attendance_performance_withdrew_idx
  ON attendance USING btree (performance_id, withdrew_at)
  WHERE withdrew_at IS NOT NULL;

-- The withdrawal PUSH is retired with this change (#612): a dancer changing
-- their mind is written under the evening, in Odustali, and no longer rings a
-- voditelj's phone or lands in anyone's Sandučić. The rows it already filed are
-- the twelve-unread noise the change exists to remove, so they go too.
--
-- A mutation inside bootstrap, which the schema files otherwise avoid, and it
-- earns the exception by being idempotent in the strongest sense: after the
-- first run it matches nothing, and if an old container were ever rolled back
-- and filed more, the next restart would clear those as well.
DELETE FROM app_notifications WHERE kind = 'withdrawal';
