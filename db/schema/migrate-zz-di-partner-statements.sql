-- The partner statement, frozen at the moment it was sent (#599).
--
-- Until this table the monthly obračun was recomputed on every read, which
-- looked harmless and was not: `commission_percent` lives on the Partner and was
-- applied at read time, so raising a reseller's rate from 10% to 12% silently
-- rewrote every month the accountant had already invoiced. A settlement is a
-- statement about the past; once it has been sent it must stop moving.
--
-- So: marking a month sent STORES the document. The PDF and the CSV of a sent
-- month render from this JSON rather than from a fresh query, which is what
-- makes a download a year later the same document the partner received. Until
-- it is stamped, everything stays live and nothing is written here.
--
-- A RAW table, deliberately not a Payload collection, for the reasons
-- `app_notifications` and `app_join_codes` are not: nobody edits a settlement in
-- the Backoffice, every row is written by an action rather than by a person
-- filling a form, and hand-editing one would be exactly the thing this table
-- exists to prevent. `src/lib/partner/statement-store.ts` is its only reader and
-- writer. Because Payload never emits it, it must NOT appear in the generated
-- `00-base.sql`: the drift gate requires bootstrap to be a SUPERSET of Payload's
-- schema, so an extra table here is fine while adding it to the baseline would
-- be lost the next time that file is regenerated.
--
-- ORDERING: bootstrap-db.mjs applies db/schema/*.sql in plain filename order
-- with no dependency resolution (db/schema/README.md), so a file carrying a
-- foreign key must sort after whatever creates the table it points at. Both FKs
-- here reach tables `00-base.sql` builds first (`partners`, `users`). The
-- `zz-di-` prefix continues the `zz-d…` sequence (`…-dg-`, `…-dh-`) and still
-- sorts BEFORE `migrate-zz-drop-users-role.sql`, which must stay the last
-- `migrate-*` file (#398, asserted by `src/lib/db-schema-safety.test.ts`).
--
-- Every statement is guarded and safe to re-run on every restart. Nothing here
-- writes or mutates a row.

-- The settlement contact (#599). Declared on the Partners collection, so
-- Payload's own push adds it in development; this is what adds it on a
-- deployment, where push is off.
--
-- It rides in this file because it is the same change: a statement that is
-- frozen still has to reach somebody, and the address it reaches is not the
-- linked login's. That login belongs to whoever stands at the reseller's
-- counter; the obračun goes to the agency's accounting address, which is a
-- different person at most partners and a different mailbox at all of them.
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS email character varying;

-- One row per (partner, month), written only when a month is marked sent.
--
-- `statement` is the whole `StatementDocument` (`src/lib/partner/statement-
-- document.ts`), not a handful of totals: the partner's name, OIB and address
-- as they stood, every izvedba line, the period and every cent. A settlement is
-- a record of what was SAID, so re-deriving any part of it from today's rows
-- would reintroduce the bug this table closes.
--
-- `commission_percent` is stored beside it even though the JSON carries it too.
-- It is the one number a human is most likely to be asked to check ("what rate
-- did we bill Kaleta at in August?"), and a plain numeric column answers that
-- with a query rather than with a JSON path.
--
-- ON DELETE CASCADE for the partner: a deleted reseller's statements are
-- nobody's. SET NULL for the sender: an account can be deleted while the
-- settlement it stamped stays true, and `sent_by` is display only.
CREATE TABLE IF NOT EXISTS partner_statements (
    id                 serial PRIMARY KEY,
    partner_id         integer NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    year               integer NOT NULL,
    month              integer NOT NULL,
    statement          jsonb NOT NULL,
    commission_percent numeric NOT NULL,
    sent_at            timestamp(3) with time zone DEFAULT now() NOT NULL,
    sent_by            integer REFERENCES users(id) ON DELETE SET NULL
);

-- One settlement per partner per month, enforced rather than trusted: the stamp
-- route is a SWITCH (`{ sent: true | false }`) and a retry from a second phone
-- must not be able to write a second, differently-computed row for the same
-- month. The unique index is also the upsert target.
CREATE UNIQUE INDEX IF NOT EXISTS partner_statements_partner_period_idx
  ON partner_statements USING btree (partner_id, year, month);

-- "Which months of this year are already sent" is what the screen asks to draw
-- its list, and it opens with the partner.
CREATE INDEX IF NOT EXISTS partner_statements_partner_year_idx
  ON partner_statements USING btree (partner_id, year);
