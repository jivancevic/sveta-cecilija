-- Stamp `users.password_set_at` on the accounts that are NOT dancer logins and
-- predate the column (#664).
--
-- `password_set_at` (#657, `migrate-zz-dm-…`) records the one moment a person
-- types a password of their own on Profil. It says nothing about the accounts
-- that already existed when it shipped, and NULL on such a row means "we have
-- never seen this happen", not "this person has no password of their own". The
-- card on Početna read the second meaning and told the account holding all
-- eleven permissions to go and set a password it has had since 2026-05-22.
--
-- The card's audience is fixed in code (`isDancerLogin`), which is the actual
-- bug fix. This file fixes the DATA for the half of the table where the true
-- answer is knowable: an account that is not a dancer login was opened in the
-- Backoffice by a `users` holder, with a password somebody chose or was handed,
-- which is exactly what the stamp means. A dancer's login is left NULL on
-- purpose — every invitation mints a random password nobody knows, so for the
-- roster the answer genuinely is unknown, and the honest reading is to ask.
--
-- CHECKED PREMISE, not an assumption (queried on production 2026-09-16, the day
-- the column shipped). All 50 accounts read NULL, because every one of them was
-- created before 14:45 CEST that day. Twelve of them hold a permission outside
-- {moreskant, door} and are therefore in scope here: `josip.ivancevic00`,
-- `bbazdaric4`, `ttvigna`, `vele`, `member`, and the seven partner POS logins
-- (`kaleta`, `korkyrainfo`, `zisagava`, `liburna`, `port9`, `hotelkorcula`,
-- `markopolo`). So this UPDATE changes twelve rows and is worth writing, unlike
-- the backfill in `migrate-zz-dk-drop-members-email.sql`, which was checked the
-- same way and turned out to be zero rows and was therefore not written.
--
-- `tehnika` is deliberately NOT in scope: it holds `door` alone, so it is a
-- dancer login by the predicate. It is also `shared`, and neither the card nor
-- the roster mark ever reads a shared login, so the stamp has no reader there.
--
-- The value is `created_at`: the moment that password was chosen is the moment
-- the account was opened. Guessing a later one would be inventing a fact.
--
-- ORDERING: bootstrap-db.mjs applies db/schema/*.sql in plain filename order on
-- every restart (db/schema/README.md). It has to sort AFTER
-- `migrate-zz-dm-users-password-set-at.sql`, which adds the column it writes
-- ('dm' < 'do'), and BEFORE `migrate-zz-drop-users-role.sql`, which must stay
-- the last `migrate-*` file ('do' < 'dr'; `src/lib/db-schema-safety.test.ts`
-- asserts that).
--
-- Safe to re-run, and bounded by a FIXED instant rather than by "is it null",
-- because "Resetiraj lozinku" CLEARS this column on purpose (a temporary
-- password read off a `users` holder's screen is not one the person chose). An
-- unbounded re-run would put the stamp straight back on the next restart. The
-- cutoff is the moment the column shipped, so only accounts that predate it are
-- ever touched, and after the first restart the WHERE matches nothing at all.

UPDATE public.users u
   SET password_set_at = u.created_at
 WHERE u.password_set_at IS NULL
   AND u.created_at < TIMESTAMPTZ '2026-09-16 12:45:00+00'
   AND EXISTS (
         SELECT 1
           FROM public.users_permissions p
          WHERE p.parent_id = u.id
            AND p.value::text NOT IN ('moreskant', 'door')
       );
