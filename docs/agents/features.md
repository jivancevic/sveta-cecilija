# Feature design notes

Deeper notes on the features whose design is non-obvious. CLAUDE.md keeps a one-line pointer to each.

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

### The reissue (#379) — the notice is only half the fix

The notice says "your tickets are automatically valid for the new date". True of the **QR token**, false of the **artefact the buyer holds**: their original ticket email keeps its old subject and its PDF keeps the old date, so a buyer who misses one email keeps re-reading a document that confidently states the wrong date. That cost a no-show, a chargeback and a 1-star review on 2026-08-20.

So after the claim + notice, `rescheduleShow` **reissues the ticket itself** as a **second message per affected ORDER** (`findReissueOrderIds` → `reissueTicket`, wired to the existing `sendOrderTicketEmail`):

- **Per order, not per buyer** — the notice dedupes by email, a ticket cannot: each order carries its own QR codes and its own PDF. Same scope otherwise (`channel IN ('online','comp')`, `email IS NOT NULL`, `refund_status='none'`).
- **Same QR tokens.** `sendOrderTicketEmail` re-renders the **existing** `tickets` rows from the already-moved show row. It writes nothing — no new tokens, no re-scan invalidation, and the old PDF a buyer is already holding at the door still scans `VALID`.
- **Ticket sent last** so the newest ticket-shaped thing in the inbox is the correct one.
- **Never a rollback.** The move is claimed and committed first; a reissue that returns false *or throws* is counted (`reissued` / `reissueFailed` in the result, surfaced in the admin modal) and logged, never unwound. A failure means someone still holds an old-date PDF — fix it with the per-order **Resend ticket email** action.
- The `reissue` copy line in `send-date-change-email.ts` announces the second message and states that the QR codes did not change. **Keep the two in sync** — if the reissue is ever dropped, drop that line with it.

Items 2 (follow-up to non-openers via Brevo `opened` events) and 3 (admin view of non-openers) of #379 ship separately.

## Marketing-class email + opt-outs (#57)

Only the **post-show review email** is marketing-class. Everything else (ticket confirmation, refund, venue-change) is **transactional** and never checks the opt-out list — it concerns a ticket the buyer already holds.

- **One-click unsubscribe** uses a **stateless HMAC token** (signed with `PAYLOAD_SECRET`, no per-send storage — `src/lib/marketing/unsubscribe-token.ts`) in a footer link, **plus** RFC 8058 `List-Unsubscribe` / `List-Unsubscribe-Post` headers (required by Gmail/Yahoo for bulk senders).
- The opt-out is keyed by **email** in the raw `marketing_optouts` table — by email, not order, so it persists across every future show (each show is a fresh Orders row; a per-order flag would silently re-subscribe on the next purchase).
- `/api/unsubscribe` writes it (`ON CONFLICT DO NOTHING`, GET = confirmation page, POST = one-click); the dispatch SQL excludes opted-out emails via `NOT EXISTS`.
- A collection-time consent notice (`consent.notice`, EN+HR) sits under the email field on checkout + the `/scan` claim form.

### Attendance gate on the review email (#378)

The review email only goes to buyers who **turned up**: the dispatch SQL projects `attended` = "this order has at least one **active, scanned** ticket", and `dispatchReviewEmails` skips the rest. Door scanning is therefore the source of truth for attendance; a group waved through unscanned silently loses its review ask, which is the cheap direction to fail (a no-show asked to review a show they missed produced a PayPal dispute and a 1-star review on 2026-08-19/20; 6.9% of the season's sends had this shape).

The gate deliberately sits in `dispatchReviewEmails`, not in the query's `WHERE`, for two reasons: a skipped no-show is **never claimed** (`review_email_sent_at` stays NULL) so a late scan correction still sends on a later run, and the per-run `skippedNoShow` count keeps the sold-vs-scanned gap visible in the route's JSON + container log.

**That "never claimed" property is exactly why the send window needs a floor as well as a ceiling.** `findEligibleOrders` takes a `SendWindow { from, to }` and the SQL brackets the show start with `BETWEEN`. Without `from`, a no-show would be re-selected on **every run forever** (it is never claimed, so `review_email_sent_at` never stops being NULL): `skippedNoShow` would report a season-long backlog rather than the recent gap, and a stray late scan months later would fire "how was the show?" for a long-past performance. `REVIEW_WINDOW_DAYS = 7` is far longer than the same-night door corrections it has to tolerate.

## Stripe disputes / chargebacks (#380)

Before this the webhook early-returned on everything except `payment_intent.succeeded`, so a chargeback was invisible: nobody was told a dispute had opened (the evidence deadline was only discoverable by logging into Stripe), and a **lost** dispute left the order at `refundStatus='none'` with its tickets `active` — still holding a seat and still scanning VALID at the door. Real incident 2026-08-20 (order 659), cleaned up by hand in prod.

Two event types are subscribed, and nothing else (`charge.dispute.updated` is noise — nothing in the app reacts to evidence-state changes):

| Event | Action |
|---|---|
| `charge.dispute.created` | Alert `info@` with order code, buyer, amount, reason and the `evidence_details.due_by` deadline. **Order untouched** — an open dispute is not a decision. |
| `charge.dispute.closed` → `lost` | Mark refunded + cascade-void the tickets. No Stripe call, no buyer email. |
| `charge.dispute.closed` → `won` | Recorded, order left intact. |
| `charge.dispute.closed` → `warning_closed` / `charge_refunded` | Explicit no-op (never became a dispute / our own refund path already did the work). |

Two design points worth not re-litigating:

- **A lost dispute never calls Stripe.** The funds moved when Stripe decided it (`is_charge_refundable` is false by then), so the refund engine would double-refund or error. This path mirrors only the bookkeeping half of `refundOrder`'s already-refunded self-heal branch.
- **`refundStatus` reuses `refunded`; there is no `disputed` value.** It is a drift-gate enum column (`db/schema/00-base.sql`) and `refunded` already means what the door and the revenue reports need: money not ours, seat freed, QR dead. The accounting distinction lives in the `critical_events` row (`stripe_dispute_created` / `_lost` / `_won`), which keeps the dispute id, reason, amount and `ticketsVoided`. Same reasoning applies to `cancel_reason='refund'` on the voided tickets: a chargeback and a refund leave a ticket in the same terminal, non-restorable state.

**Idempotency is an atomic claim, not a check.** `claimEvent` runs `INSERT INTO critical_events … ON CONFLICT DO NOTHING RETURNING id` against the partial unique index on `(kind, context->>'disputeId')` (`db/schema/app.sql`) and the handler acts **only if it won the insert**. Two earlier shapes were rejected and should not come back:

- *check-then-act* (`hasHandled` then `record`) — two deliveries racing both read false and both alert;
- *record after the work* via `recordCriticalEvent` — that writer swallows its own insert failure **by contract**, so a dropped ledger row leaves the event un-deduped forever.

So `claimEvent` must **not** swallow (a failure has to 500 so Stripe retries), `releaseEvent` hands the claim back when the work then throws, and only `finalizeEvent` — enrichment after the money and tickets are already correct — is best-effort. Same claim/release shape as the review-email cron.

**Manual step, without which none of this fires:** the live webhook endpoint must be subscribed to `charge.dispute.created` and `charge.dispute.closed` in the Stripe dashboard. See the runbook in `docs/agents/deployment.md`.
