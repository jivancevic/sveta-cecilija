-- Two small additions from the 2026 season's paper notebook (popis moreški).
--
-- 1. `experience`: a sixth performance kind, the Moreška Experience (the short
--    form sold on the public site, danced by three pairs and a bula in the
--    society's premises). The 2026 season had fourteen of them and none was a
--    row, so a dancer's season undercounted. CONTEXT.md → *Moreška Experience*.
--
-- 2. `members.year_round`: the notebook's "c" next to a dancer, the one who
--    lives in Korčula the whole year. Pre-season and post-season only these
--    can be cast (the rest are students away in other towns), so a voditelj
--    planning an Experience filters by it. CONTEXT.md → *Cijelu godinu u
--    Korčuli*.
--
-- ORDERING: `zz-df` sorts after `migrate-shows-performance.sql` (which creates
-- the enum) and after `migrate-moreskant-identity.sql` (which makes members a
-- roster). The enum ADD VALUE is alone in its statement and nothing here reads
-- the new value, so the single-transaction rule (db-bootstrap.md) is not hit.
-- Idempotent: safe on every restart.

ALTER TYPE public.enum_shows_kind ADD VALUE IF NOT EXISTS 'experience';

ALTER TABLE members ADD COLUMN IF NOT EXISTS year_round boolean DEFAULT false;
