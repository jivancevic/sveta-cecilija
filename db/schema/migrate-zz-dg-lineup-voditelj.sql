-- A lineup line for the person who ran the evening without dancing.
--
-- Every Moreška Experience has a voditelj (in 2026, Brane on all of them), and
-- the paper notebook wanted him written down on the postava. He is not a
-- dancer that evening, so `voditelj` is a LINEUP role and not a dance role: no
-- profile can hold it, and the statistics and a dancer's own season skip it
-- (their loaders filter on `isDanceRole`, which does not know this value).
-- CONTEXT.md → *Voditelj (u postavi)*.
--
-- ORDERING: `zz-dg` sorts after `migrate-zz-b-lineups.sql` (which creates the
-- enum). The ADD VALUE is alone in its statement and nothing here reads the new
-- value, so the single-transaction rule (db-bootstrap.md) is not hit.
-- Idempotent: safe on every restart.

ALTER TYPE public.enum_lineups_role ADD VALUE IF NOT EXISTS 'voditelj';
