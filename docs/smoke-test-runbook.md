# Cutover smoke-test runbook (#11)

Run end-to-end against **production deployment with Stripe in TEST mode** before flipping live keys. Target host: `https://moreska.eu` (or current deployed domain if pre-DNS-cutover). All ticks must pass before proceeding to the Cutover section.

Time budget: ~45 min for smoke test, ~30 min for cutover.

---

## 0. Pre-flight (5 min)

- [ ] Coolify env shows **test** Stripe keys: `STRIPE_SECRET_KEY=sk_test_...`, `STRIPE_PUBLISHABLE_KEY=pk_test_...`, `STRIPE_WEBHOOK_SECRET=whsec_...` (matches the test-mode endpoint).
- [ ] Stripe Dashboard → toggle **Viewing test data** ON. Confirm webhook endpoint `https://moreska.eu/api/stripe/webhook` is "Enabled" in test mode and the signing secret matches Coolify.
- [ ] Brevo dashboard reachable; daily quota not exhausted. Confirm `info@moreska.eu` is verified sender.
- [ ] You can log into `https://moreska.eu/admin` as a `superadmin` or `admin` user.
- [ ] Open a second browser (or incognito) for the buyer flow — keeps admin session separate.
- [ ] Have a phone with camera ready for the QR scan step (or just open the URL in a different browser profile).

---

## 1. Create a throwaway test show (3 min)

1. Go to `https://moreska.eu/admin/collections/shows/create`.
2. Fill:
   - **Date:** tomorrow
   - **Time:** `21:00`
   - **Venue:** `ljetno-kino`
   - **onlineSold:** `0`
   - **inPersonSold:** `0`
   - **Status:** `active`
3. Save. Copy the show ID from the URL (`/admin/collections/shows/<ID>`) — you'll need it.

- [ ] Show row exists in admin list at `https://moreska.eu/admin/collections/shows`.

## 2. Public tickets page shows the show (2 min)

1. Open `https://moreska.eu/tickets` in incognito (no `/en` or `/hr` prefix — locale is cookie-driven).
2. Confirm the new show appears with venue label **"Summer Cinema"** (EN) or **"Ljetno kino"** (HR).
3. Confirm **remaining = 320** (full ljetno-kino capacity).
4. Switch language toggle → HR copy renders, same show present.

- [ ] Show visible on `/tickets` in both EN and HR.
- [ ] Capacity reads 320 remaining.

## 3. Stripe checkout — happy path (5 min)

1. Click "Buy tickets" on the test show → lands on `/checkout/<showId>`.
2. Buyer form:
   - **Name:** `Smoke Test`
   - **Email:** a real inbox you control (Brevo sends to real addresses even in Stripe test mode)
   - **Adults:** `1`, **Children:** `1`
   - Total displayed: **€30.00**
3. Stripe Payment Element → pay with card:
   - **Number:** `4242 4242 4242 4242`
   - **Expiry:** any future date (e.g. `12/30`)
   - **CVC:** `123`
   - **ZIP:** any (e.g. `20260`)
4. Submit. Should land on `/checkout/<showId>/confirmation?pi=pi_...` and render order summary within ~2 s (5×400 ms retry bridges webhook race).

- [ ] Confirmation page renders with order details and 2 ticket placeholders.
- [ ] Browser devtools console: a single `gtag('event', 'purchase', ...)` call fires (Network tab → filter `collect?`). `transaction_id` matches the Stripe PI.
- [ ] No duplicate Google tag loaded (no `AW-*` `gtag/js` script; only the `GT-*` umbrella).

## 4. Webhook + email (3 min)

1. Stripe Dashboard → Developers → Events → top event should be `payment_intent.succeeded`, webhook delivery **200 OK**.
2. Check the buyer inbox — email from `info@moreska.eu` arrives within ~30 s.
3. Email contains **2 inline QR codes** (one per ticket), each pointing to `https://moreska.eu/scan/<token>`.

- [ ] Stripe webhook delivery 200.
- [ ] Email received with 2 distinct QR codes.

## 5. Admin verification (2 min)

1. `https://moreska.eu/admin/collections/orders` — top row is the test order, `total: 3000`, `refundStatus: none`, linked to the test show.
2. `https://moreska.eu/admin/collections/qr-tokens?where[order][equals]=<orderId>` — 2 rows, `scanned: false` on both. Copy both `token` values.
3. Reopen the test show in admin — `onlineSold` is now **1** (since 1 order = 1 record; if your incrementer adds ticket count instead, it will be 2 — note actual behaviour).

- [ ] Order + 2 QRTokens visible in admin.
- [ ] Show's `onlineSold` incremented.

## 6. QR scan flow (5 min)

Test **buyer view** (unauthenticated) AND **staff view** (authenticated). Cookie CSRF rules: staff path only triggers when the request `Sec-Fetch-Site` is `none`/`same-origin`/`same-site`. Type the URL directly or scan from camera — don't paste-and-click from Slack/Gmail.

### 6a. Buyer view (incognito, no admin login)
1. Open one QR URL in incognito: `https://moreska.eu/scan/<token1>`.
2. Should render buyer ticket view with on-page QR + "do not tap again" notice. **No DB write.**

- [ ] QRToken `scanned` still `false` in admin after viewing.

### 6b. Staff view (logged in as superadmin / admin / tehnika)
1. In your admin/tehnika browser, type into address bar: `https://moreska.eu/scan/<token1>`. Press Enter.
2. Should render **VALID** state. Refresh same URL → **ALREADY_SCANNED** with "Undo scan" link visible (server-checks the 2-minute window).
3. Open `<token2>` the same way → **VALID** on first hit.
4. Open `https://moreska.eu/scan/not-a-real-token` → **INVALID**.

- [ ] Token1: VALID → ALREADY_SCANNED on refresh.
- [ ] Token2: VALID first time.
- [ ] Invalid token: INVALID state.
- [ ] `scannedAt` populated in `qr-tokens` admin for both used tokens.

## 7. In-person sales (2 min)

1. Open the test show edit view in admin.
2. Use the **in-person sales** action (edit-menu item or custom button) to add `5` in-person tickets. If wired as direct field edit instead, set `inPersonSold: 5` and save.
3. Reload `/tickets` (incognito) → remaining capacity now **320 − 1 − 5 = 314**.

- [ ] Remaining count updates on public page.

## 8. Refund flow (3 min)

1. Open the test order in admin → trigger refund (edit-menu item or `POST /api/orders/<id>/refund` from the admin browser to keep the session cookie).
2. Stripe Dashboard → Payments → the test PI shows **Refunded €30.00**.
3. Order row: `refundStatus: refunded`.
4. Re-trigger refund → 4xx or no-op (idempotent — must not double-refund). Confirm Stripe still shows a single refund.

- [ ] Stripe shows one refund of €30.
- [ ] Second refund attempt is rejected/idempotent.

## 9. Stats view sanity (1 min)

1. `https://moreska.eu/admin/stats` — season aggregate shows the test show in the table.
2. `https://moreska.eu/admin/stats/<showId>` — per-show drill-down: online sold 1, in-person 5, scanned 2, revenue calculated.

- [ ] Stats numbers match expectation.

## 10. Cookie consent + GA gating (2 min)

1. Fresh incognito → cookie banner appears on first page load.
2. Open devtools Network → filter `googletagmanager` → **no requests** until you click Accept.
3. Click Accept → `gtag/js` loads, `_ga` cookie set.
4. Decline path: clear storage, decline → no `googletagmanager` requests on any page.

- [ ] GA only loads after explicit accept.

## 11. Cleanup before live cutover

- [ ] Delete the test show OR set `status: cancelled` so it never appears publicly.
- [ ] Delete the test order + its QRTokens (or leave with a "TEST" note — they're already refunded).
- [ ] Stripe test-mode events stay — they're isolated from live mode.

---

# Cutover

Do not begin until **every box above is checked** and you have ~2 hours of monitoring availability afterward.

## C1. Switch Stripe to live mode

1. Stripe Dashboard → toggle **Viewing test data** OFF.
2. Developers → API keys → copy live `sk_live_...` and `pk_live_...`.
3. Developers → Webhooks → create endpoint `https://moreska.eu/api/stripe/webhook` (in live mode), subscribe to `payment_intent.succeeded`, `charge.refunded`. Copy `whsec_...`.
4. Coolify → env → update all three: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`. Redeploy.
5. After redeploy, hit `https://moreska.eu/tickets` — page must still render (smoke check that the new keys are valid).

## C2. Bulk-create 2026 season shows

1. Source: `docs/performances.md` — only **Redovna** rows are public.
2. For each: admin → Shows → Create (date, time, venue, status=active, sold=0).
3. Spot-check 3 random shows on `/tickets` — date/time/venue correct, capacity matches `VENUE_CAPACITY`.

- [ ] All Redovna shows present.
- [ ] No Gulliver/Adriatic DMC/Crveni križ shows leaked to public page.

## C3. Announce + brief staff

- [ ] 24h notice sent to HGD staff (email + WhatsApp group) with cutover date/time.
- [ ] `tehnika@moreska.eu` (role: `tehnika`) login confirmed working on a phone.
- [ ] Walk-through done: `/admin/stats`, `/scan/<token>` from camera, refund flow.

## C4. DNS + legacy site redirect (day-of)

1. Hetzner DNS — confirm `moreska.eu` A record points to the Coolify host. SSL provisions on first HTTPS request after propagation (Traefik + Let's Encrypt automatic).
2. Totohost cPanel for `korcula-moreska.com`:
   - Option A (preferred): edit `.htaccess` to 301 to `https://moreska.eu/$1`.
   - Option B (fallback): edit the WordPress `wpbp_options` `siteurl`/`home`, or replace the landing page with a static notice + link.
3. Test from a fresh device (not your browser cache): `https://korcula-moreska.com/` → lands on `moreska.eu`.

- [ ] Old domain redirects or shows notice.
- [ ] New domain serves over HTTPS with valid cert (browser padlock).

## C5. First-live monitoring (first 3 real purchases)

- [ ] Stripe Dashboard live mode → each `payment_intent.succeeded` webhook delivers 200.
- [ ] Brevo → each ticket email shows delivered.
- [ ] First buyer's QR actually scans VALID on the door.
- [ ] No Sentry / Coolify logs spiking (`coolify logs` or app log tab).

If anything breaks: keep the old site reachable (don't break the redirect immediately). Roll Stripe back to test only if a structural issue with live keys appears. For payment-specific issues, refund the affected buyer immediately and contact them by phone — Korčula tourist-season buyers will call the org directly.

---

## Stripe test cards quick reference

| Scenario | Number | Notes |
|---|---|---|
| Success (Visa) | `4242 4242 4242 4242` | Primary smoke test |
| Success (Mastercard) | `5555 5555 5555 4444` | Verify both networks if desired |
| Requires 3DS auth | `4000 0025 0000 3155` | Pops the challenge modal |
| Declined (generic) | `4000 0000 0000 0002` | Confirm error state on checkout |
| Declined (insufficient funds) | `4000 0000 0000 9995` | Confirm error message renders cleanly |

Any future expiry, any 3-digit CVC, any ZIP.
