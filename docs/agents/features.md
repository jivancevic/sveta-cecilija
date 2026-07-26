# Feature design notes

Deeper notes on two features whose design is non-obvious. CLAUDE.md keeps a one-line pointer to each.

## Bad-weather venue change, Ljetno → Zimsko (#94)

Admin edit-view action `MarkMovedToZimskoMenuItem`, 2-step:

1. **Preview** — affected-buyer count + sample emails, with **no writes**.
2. **Confirm** — **claims the move atomically before sending mail**:
   ```sql
   UPDATE shows SET venue='zimsko-kino', venue_changed_at=NOW(), venue_changed_by_id=$user
   WHERE id=$show AND venue='ljetno-kino' AND venue_changed_at IS NULL RETURNING id
   ```

Claim-before-send means two concurrent confirmations can't double-notify (the loser claims 0 rows → reported `already-moved`, no send); it also short-circuits `already-moved` / `not-applicable` (a natively-Zimsko show).

The notice is **deduped by email** (`DISTINCT ON (lower(email))` — one per person, not per order) and is **not a refund trigger** (the show still happens). Buyers who want out reply to `info@` and admin refunds case-by-case via the existing flow.

Pure DI orchestration in `src/lib/venue-change.ts`; route `POST/GET /api/shows/[id]/move-to-zimsko`. All buyer-facing venue names come from the shared `VENUE_LABEL` in `src/lib/venues.ts`.

## Reschedule a show + notify buyers

Admin edit-view action `RescheduleShowMenuItem`, mirror of the venue-change flow:

1. **Preview** — current date + affected-buyer count + sample emails, **no writes**.
2. **Send test to me** — sends the EN+HR email (with the real old→new dates) to the **logged-in admin's own inbox** only; **no DB write, no buyer mail**. The "see it first" path.
3. **Confirm & send** — **claims the new date atomically before sending mail**:
   ```sql
   UPDATE shows SET date=($newDate||' 12:00:00+00')::timestamptz, date_changed_at=NOW(),
          date_changed_by_id=$user, original_date=COALESCE(original_date,date::date), updated_at=NOW()
   WHERE id=$show AND date::date=$expectedOldDate RETURNING id
   ```

Optimistic-concurrency claim on the *current* date (not a one-shot flag like the venue move): a concurrent confirm whose `expectedOldDate` no longer matches claims 0 rows → `date-mismatch`, no send. `original_date` (via `COALESCE`) keeps the very first date across repeated reschedules. A new date equal to the current one → `no-op` (no mail). Orders reference the show by **id**, so existing tickets/QRs follow the new date automatically — this is **not a refund trigger**.

The notice is **deduped by email** (`DISTINCT ON (lower(email))` — one per person) and **transactional** (never checks `marketing_optouts`). Pure DI orchestration in `src/lib/show-reschedule.ts`; sender `src/lib/email/send-date-change-email.ts`; route `POST/GET /api/shows/[id]/reschedule`. Audit columns `date_changed_at` / `date_changed_by_id` / `original_date` added in `db/schema/app.sql`.

### Re-issuing a lost self-serve refund link (support)

The reschedule email's refund link (ADR-0021) is the buyer's only route to it — there is no "resend my link" self-service, and buyers do lose the mail (first real case: 2026-07-26). The token is **stateless and never expires**, so it can be regenerated on demand for any order.

1. Find the order and confirm eligibility — needs `shows.date_changed_at IS NOT NULL`, `channel='online'`, a `stripe_payment_intent_id`, `refund_status='none'`, and **zero scanned tickets** (the same conditions `evaluateRefundEligibility` re-derives; see `src/lib/refund/reschedule-refund-context.ts`). Note the orders column is `email`, not `buyer_email`.
2. Sign the token with the **prod** `PAYLOAD_SECRET` — run it inside the running app container so the secret never leaves the box, and print only the URL:
   ```js
   // node -e inside the prod app container
   const { createHmac } = require('crypto')
   const id = '<orderId>'
   const t = Buffer.from(id).toString('base64url') + '.' +
     createHmac('sha256', process.env.PAYLOAD_SECRET).update(id).digest('base64url')
   console.log(`${process.env.NEXT_PUBLIC_BASE_URL}/order/${encodeURIComponent(t)}/refund`)
   ```
3. Verify before sending: a plain `GET` on the URL is side-effect-free (the refund is a `POST`). A 200 showing the order total + the "Cancel & refund" CTA means `ELIGIBLE`; the page renders its own neutral state for every other case.

Prefer this over refunding for the buyer from `/admin` — the decision (and the irreversible click) stays with them.

## Marketing-class email + opt-outs (#57)

Only the **post-show review email** is marketing-class. Everything else (ticket confirmation, refund, venue-change) is **transactional** and never checks the opt-out list — it concerns a ticket the buyer already holds.

- **One-click unsubscribe** uses a **stateless HMAC token** (signed with `PAYLOAD_SECRET`, no per-send storage — `src/lib/marketing/unsubscribe-token.ts`) in a footer link, **plus** RFC 8058 `List-Unsubscribe` / `List-Unsubscribe-Post` headers (required by Gmail/Yahoo for bulk senders).
- The opt-out is keyed by **email** in the raw `marketing_optouts` table — by email, not order, so it persists across every future show (each show is a fresh Orders row; a per-order flag would silently re-subscribe on the next purchase).
- `/api/unsubscribe` writes it (`ON CONFLICT DO NOTHING`, GET = confirmation page, POST = one-click); the dispatch SQL excludes opted-out emails via `NOT EXISTS`.
- A collection-time consent notice (`consent.notice`, EN+HR) sits under the email field on checkout + the `/scan` claim form.
