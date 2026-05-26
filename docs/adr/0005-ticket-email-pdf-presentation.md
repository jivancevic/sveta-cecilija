# ADR-0005: Ticket email + PDF presentation layer

**Status:** Accepted
**Date:** 2026-05-26

## Context

ADR-0004 settled the email *infrastructure* — who sends what, from which identity, to which inbox. It deliberately did not settle the *presentation* of the ticket-confirmation mail, which until now has been a bare HTML body plus one PNG QR attachment per ticket (`src/lib/email/send-ticket-email.ts`). Three problems with the current shape:

1. **Email is visually unbranded.** No logo, no typographic identity, no design tokens shared with `moreska.eu`. It does not look like it comes from the same organisation as the website the buyer just paid on.
2. **Tickets ship as N individual PNGs.** A four-ticket order arrives as four loose attachments. There is no single artefact to hand to door staff, save to a wallet folder, or print as a set.
3. **No print affordance.** The PNG is a QR with no surrounding context — no show title, no buyer name, no ticket number. A buyer who prints it has a bare square on a page.

The fix is a deeper change than copy tweaks: a real email template plus a generated PDF with one ticket per page, both carrying the website's visual identity.

Several constraints frame the solution space:

- **Coolify / Nixpacks deploy.** Native binaries and large runtime deps fight Nixpacks (CLAUDE.md documents the Node 22 ceiling, lockfile churn, and esbuild override). Shipping ~170MB of Chromium for PDF rendering is a real operational cost, not a hypothetical one.
- **Solo developer, no design ops.** Per-show photography, photo curation, or per-order custom assets all require a process this org does not have.
- **Door staff workflow is Croatian; buyers are mixed EN/HR.** ADR-0001 settled that buyer locale lives in a cookie; the ticket email already follows it.
- **Stripe webhook is the only call site.** `notifyBuyer` is wrapped in `try/catch` so the webhook always returns 200 — any rendering failure logs and loses the email, never double-charges or double-creates.
- **QR generation is already solved.** `src/lib/email/qr.ts#generateQrPng` produces PNG buffers; whatever renders the PDF can embed them as images.

## Decision

### Rendering stack

- **PDF:** `@react-pdf/renderer`. Pure Node, no headless browser, ~2MB. JSX with a flexbox-style layout primitive set. Embeds the existing `generateQrPng` PNG output verbatim.
- **HTML email:** `@react-email/components` + `@react-email/render`. JSX components that render to table-based HTML with inline styles, tested across Gmail / Outlook / Apple Mail. Matches the React stack and the same author DX as the PDF renderer.

Both renderers are pure functions of `{show, buyer, order, tokens, locale}`; `send-ticket-email.ts` orchestrates them and attaches one PDF to the Brevo call.

### Ticket PDF — one page per ticket

- **A4 portrait**, stub layout: large main zone (show title, date, time, venue, buyer name, ticket type, price, doors time, order reference) and a right-hand stub separated by a dashed perforation line carrying the QR, ticket number (`2 / 4`), and short scan instructions.
- **Per-ticket type** (`Adult` / `Child`) is derived deterministically from `order.adultCount` at render time: the first N tokens render as Adult, the next M as Child. No schema change to `QRTokens`. Safe today because there is no token reordering and refunds are full-order.
- **Language follows buyer locale** — no bilingual labels. Door staff parse a single QR; the visible copy is for the buyer.
- **Filename:** `moreska-tickets-{YYYY-MM-DD}.pdf` (one attachment per email).
- **Order reference** rendered as `Order #{payload-id}`. No new field on the Orders collection.

### Email body — confirmation only, no inline QR

- Section order: brand header (logo + `HGD SVETA CECILIJA` + gold rule) → hero line (`Your tickets are attached`, buyer first name) → show card (title, date, time, venue) → order summary (adult/child breakdown, total paid, order reference) → footer (refund note, support email, Knežev prolaz 1 physical address).
- **No QR in the email body.** The PDF is the sole scan surface. Avoids two-scan-surface ambiguity for door staff and removes the failure mode where someone flashes a stale email QR instead of the PDF.

### Visual identity — typographic only

- Stone background, Bodoni Moda SC for the show title and `MOREŠKA` wordmark, IBM Plex Mono for codes and ticket numbers, Inter for body, gold horizontal rule as accent, `cecilija-logo.png` top-left.
- **No photography.** Same look across every show, prints well in B&W, no per-show image pipeline.
- Font files (Bodoni Moda SC, IBM Plex Mono — both OFL) bundled in the repo and registered once at module load with `@react-pdf/renderer`'s `Font.register`. Email side falls back to web-safe stacks since most clients strip `@font-face`.

### Failure mode

Unchanged. `notifyBuyer` keeps its existing `try/catch` in `src/app/api/stripe/webhook/route.ts` — render or Brevo failures log with grep-able prefixes (`orderId=`, `email=`, `tokens=`) for manual resend. The webhook still returns 200. No retry, no fallback to PNG attachments.

## Alternatives considered

1. **Puppeteer / Playwright HTML→PDF.** Highest visual parity with the website (reuse `globals.css` directly). Rejected: ships ~170MB of Chromium, slow cold start, frequent Nixpacks / Linux container friction (CLAUDE.md documents prior `EBADPLATFORM` debugging on much smaller deps). Heavy for one render per checkout.
2. **`pdfkit` + imperative drawing.** Smallest dep footprint and fastest cold start. Rejected: every layout primitive (multi-column, alignment, perforation rule) is hand-coded pixel math. False economy for a visually rich ticket and a non-trivial template lifecycle.
3. **Hand-rolled table-based HTML for the email.** No new dependency. Rejected: every brand tweak becomes a multi-hour cross-client debugging session. `react-email` is the lowest-friction choice for a non-trivial branded transactional template.
4. **MJML compiled at build.** Powerful and well-trodden. Rejected: adds a build step and a templating dialect to learn for one transactional template. `react-email` covers the same problem inside the existing React stack.
5. **Add a `type` (adult/child) field to QRTokens.** Cleanest data model and survives any future per-seat operation. Rejected for now: would require a `db/schema/*.sql` migration, a webhook update, and a backfill, in exchange for solving a problem (per-seat refunds, transfers) that does not exist today. Revisit when per-seat ops are scoped.
6. **Bilingual PDF (EN + HR side-by-side).** Considered for the door-staff use case. Rejected: clutter, two PDFs' worth of layout work, and door staff scan the QR — they do not read the visible copy.
7. **Branded email + first ticket's QR inline.** Considered as a fallback for buyers whose PDF reader fails on older phones. Rejected: creates two scan surfaces for the same order. Door staff might scan the email QR for ticket 1 while tickets 2–4 sit in the PDF, splitting the `scanned` state across artefacts that look interchangeable. Single artefact wins.
8. **Per-show hero image in PDF / email.** Considered for editorial polish. Rejected: requires a per-show image field, asset curation, and a fallback — no design ops capacity. The typographic-only treatment is the same artefact every time, which is itself a brand signal.
9. **Plain-text confirmation email, all visuals in PDF.** Lowest email-deliverability risk. Rejected: explicitly contradicts the part of the ask that the email itself should be visually appealing.
10. **CTA-driven email with a `/tickets/download/[token]` link instead of an attachment.** Considered as the email's centrepiece. Rejected: requires building an authenticated download endpoint — a new security surface — for a file that already rides as an attachment for the overwhelming majority of clients.

## Consequences

- **Pro:** A buyer's confirmation looks like it came from the same organisation as the site they paid on. Brand recall on the only artefact most buyers will see between purchase and the show.
- **Pro:** One PDF per order — savable, printable, forwardable as a unit. Matches how buyers think about "their tickets".
- **Pro:** No headless browser in the runtime. Render pipeline stays inside the Node process the rest of the app already runs on.
- **Pro:** No schema change. The first ship is presentation-only; data model deferrals are documented for re-evaluation.
- **Con:** Two new deps to maintain (`@react-pdf/renderer`, `@react-email/*`). Both are mature and actively maintained; verify in `node:22` container before each push (per the Coolify deploy gotchas in CLAUDE.md).
- **Con:** Bundled TTF font files add ~400KB to the deployed artefact. Acceptable; the alternative is shipping fonts at runtime from Google Fonts, which adds a network dependency to every email send.
- **Con:** The "adult vs child" assignment is deterministic but implicit — it lives in render code, not the data model. If anyone ever needs to address a specific seat (per-seat refund, transfer), the schema change is a known follow-up.

## Related

- ADR-0004 — Email infrastructure (sender identities, providers, plan)
- ADR-0003 — Brand layer (the visual tokens this presentation reuses)
- `src/lib/email/send-ticket-email.ts` — current orchestrator (to be refactored)
- `src/app/api/stripe/webhook/route.ts` — sole call site; failure-mode contract preserved
- CLAUDE.md — "Email sending", Coolify / Nixpacks deploy gotchas, design tokens
