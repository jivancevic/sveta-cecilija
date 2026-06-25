# ADR-0018: B2C fiscalization of online ticket sales — SaaS vs in-house CIS

**Status:** Proposed — contingent on the external "unblock" checklist below (FINA cert, VAT decision, ePorezna registration, interni akt)
**Date:** 2026-06-25

## Context

Online ticket sales on `moreska.eu` settle through Stripe and produce a branded
QR-ticket PDF (ADR-0005) plus Stripe's generic email receipt. They produce **no
fiscalized račun** — there is no ZKI, no JIR, and no fiscalization code anywhere
in the repo. This is a confirmed Croatian compliance gap (issue #297, surfaced
2026-06 by the secretary).

**The obligation is real and current:**

- HGD Sveta Cecilija is a confirmed **obveznik fiskalizacije** — the trigger is
  **porez na dobit**, not PDV (confirmed by tajnica Tatjana, 2026-06-18; the
  "status obveznika" blocker is closed).
- Under the new **Zakon o fiskalizaciji (NN 89/2025, "Fiskalizacija 2.0")**, in
  force from 2025-09-01, **B2C consumer receipts must be fiscalized for *all*
  payment methods since 2026-01-01** — explicitly including bank/transaction
  settlements, which is what a Stripe payout is. Card sales were already in
  scope under Fiskalizacija 1.0.
- **Crucially, 2.0 did not change the B2C mechanism.** A consumer receipt still
  gets its **JIR via the existing CIS (Centralni informacijski sustav) SOAP/XML
  flow with a locally-computed ZKI**. The new **eRačun** (structured B2B/B2G
  e-invoicing) regime is a *separate* system that does **not** cover
  consumer ticket sales. We will separately need to *receive* eRačuns as a
  non-VAT entity from 2026-01-01, but that is out of scope for this ADR.

So: every online B2C ticket sale must yield a **fiscalized račun carrying ZKI +
JIR + the fiscalization QR**, delivered to the buyer alongside the ticket PDF.
The acceptance criterion in #297 is exactly this.

**This ADR is a design spike, not shippable code.** Issuance is externally
**blocked** until the checklist at the end is cleared (no FINA certificate yet;
VAT treatment of the tickets — čl. 39 cultural-services exemption vs a rate — not
yet confirmed). We decide the *approach* now so that when the blockers clear the
build is mechanical.

### Constraints that frame the solution space

- **Solo developer, no ops team, tiny volume.** A few hundred online orders per
  season at peak. Whatever we pick has to be near-zero-maintenance the other 10
  months.
- **The račun must legally be issued by HGD**, and the **FINA application
  certificate is held by the legal entity** (the udruga) — an implementer cannot
  obtain it on the obligor's behalf. So "who holds the cert" is about where the
  *private key lives at signing time*, not who is liable.
- **The webhook is the only natural issue point.** `POST /api/stripe/webhook`
  → `handlePaymentSucceeded` → `notifyBuyer` is where the Order exists, the
  buyer is known, and the ticket email is already sent (ADR-0005). Fiscalization
  must hook in here.
- **The webhook's failure contract is sacred (ADR-0005).** `notifyBuyer` is
  wrapped in `try/catch` so the webhook **always returns 200** — Stripe must
  never retry and double-create the order. A fiscalization failure therefore
  **must not** throw past that boundary, and must be **recoverable out-of-band**
  (the račun can be issued late; the legal duty is "issue without undue delay",
  not "synchronously inside the webhook").
- **No mature Node OSS library for B2C fiscalization.** The one TypeScript lib
  (`shunkica/fiskalizacija2-js`) covers only 2.0/eRačun and explicitly **not**
  B2C. Reference implementations exist in .NET (`tgrospic/Cis.Fiscalization`),
  PHP (`grizwako/Fiskalizator_PHP`), Ruby (`infinum/fiscalizer`), and Go
  (`l-d-t/fiskalhrgo`) — but in-house in Node means porting the SOAP + ZKI
  (RSA-SHA1 → MD5-hex) logic against the current v2.6 tech spec ourselves.
- **Coolify / standalone container runtime** (ADR-0012). A SOAP/XML + crypto
  client is pure Node and fits; the bigger cost of in-house is correctness and
  lifecycle, not bundle size.

### The data we already have at the issue point

At `notifyBuyer`, per order, we hold everything a račun needs **except** the
tax fields: buyer name/email, `adultCount`/`childCount`, `total` (EUR cents),
`orderCode`, show date/time/venue, `paymentIntentId`, `locale`. Fixed prices
(€20 adult / €10 child) are known. Missing: VAT treatment (exempt vs rate), the
fiscalization **number sequence** (a gap-free `broj/prostor/uređaj` per year),
the **premises/device labels**, and the **signing certificate**.

## Decision

**Adopt Approach A — a Croatian fiscalization SaaS wired to the Stripe webhook —
specifically [Fiskalio](https://fiskalio.net) (with e-racuni.hr as the
documented fallback).** Reject Approach B (in-house CIS integration) for the
initial implementation; keep it as a documented escape hatch if the SaaS proves
inadequate.

The integration is a **fiscalization seam behind a feature flag**
(`FISCALIZATION_ENABLED`), invoked from the existing `notifyBuyer` path,
**fail-open** (a fiscalization error never breaks ticket delivery and never
trips the webhook's 200 contract), with failures recorded to the
critical-events log (ADR-0016) for out-of-band re-issue.

### The two approaches compared

| Dimension | **A — SaaS (Fiskalio / e-racuni.hr)** | **B — In-house CIS** |
|---|---|---|
| **Dev effort** | Low. Map Order → invoice payload, one authenticated POST, store JIR/ZKI/PDF ref. Days. | High. Port SOAP envelope + WS-Security signing + ZKI (RSA-SHA1→MD5) + JIR parse + error taxonomy + račun PDF, all against the v2.6 spec, no Node OSS base. Weeks, plus a long correctness tail. |
| **Recurring cost** | ~€0–80/mo. Fiskalio: Free (3 inv/mo) → Starter €20 (200) → Basic €40 (500) → Pro €80 (1000, REST API). Our peak fits Starter/Basic. Plus FINA cert €39.82+VAT / 5 yr. | FINA cert only (€39.82+VAT / 5 yr). No SaaS fee — but real cost is dev + ongoing maintenance against spec changes. |
| **Who holds the FINA cert** | HGD obtains it; **uploaded to the SaaS**, which signs server-side. Private key lives at the vendor. (Legal liability stays with HGD either way.) | HGD obtains it; **private key lives in our runtime** (Coolify secret), we sign. |
| **Failure modes** | Vendor downtime/outage; vendor lock-in on the JIR/PDF archive; a third party holds the signing key. Mitigated: JIR/ZKI are returned to us and stored locally; cert is re-uploadable elsewhere. | We own every failure: malformed ZKI, clock skew, cert expiry, CIS schema drift, SOAP faults. A wrong ZKI = invalid račun = compliance exposure. Highest-stakes surface in the app, maintained by one dev. |
| **How the račun reaches the buyer** | SaaS can email a PDF račun directly (all Fiskalio tiers), **or** return the PDF/JIR/ZKI to us to attach to the existing ticket email. Prefer the latter — one branded email, our ADR-0005 artefact. | We render the račun PDF ourselves (reuse the `@react-pdf/renderer` stack from ADR-0005) and attach it to the existing ticket email. |
| **Fit with webhook → Order → email flow** | Drop-in at `notifyBuyer`: after the order/tickets exist, call the SaaS, persist the result, attach/queue the račun. Async-safe. | Same seam, but the call is to our own CIS client module instead of an HTTP vendor. |
| **VAT correctness** | We still must tell the SaaS the right tax treatment (exempt vs rate) — the SaaS does not decide it. | Same — we encode it in the message ourselves. |
| **Lifecycle / spec drift** | Vendor tracks Porezna spec changes (v2.6 → …). | We track them. Ongoing burden on one developer. |

### Why A wins for this org

1. **Effort/risk ratio.** The legally dangerous part is the ZKI/JIR
   correctness, and a SaaS that does this for thousands of merchants is far less
   likely to produce an invalid račun than a from-scratch Node port maintained
   by one person. For a compliance artefact, "boringly correct" beats "owned".
2. **Maintenance.** Fiscalization spec changes (we've already gone 1.0 → 2.0 →
   v2.6) are the vendor's problem, not a recurring interrupt for a solo dev whose
   real backlog is the website.
3. **Cost is trivially affordable.** €20–40/mo at our volume is noise next to the
   developer-weeks Approach B costs up front and the maintenance tail after.
4. **The lock-in is bounded.** The JIR + ZKI we receive are the legally
   meaningful outputs and we store them on the Order; the FINA cert is ours and
   re-uploadable. If we ever outgrow the SaaS we can revisit B with a real driver
   (volume, a feature the SaaS lacks), not a guess.

**Vendor pick: Fiskalio first.** It is purpose-built for exactly this shape —
a **native Stripe-webhook flow** (add its URL in the Stripe dashboard; it
detects the payment, fiscalizes, emails the račun), **upload-your-own FINA
cert**, PDF račun on every tier, and a REST API on the Pro tier for the
tighter "return JIR/PDF to us, we attach to our email" integration we prefer.
**e-racuni.hr is the fallback** — it advertises a native Stripe connector
(paste the Stripe secret key) and full Croatian accounting, heavier than we
need but a proven escape hatch. (Solo / FiskalAPI are REST-only alternatives if
we'd rather call an API from our own handler.)

**Integration style — prefer API-return over vendor-emails-buyer.** Both
Fiskalio and e-racuni can email the buyer the račun *directly* off the Stripe
webhook, which is the zero-code path. We instead prefer to **call the vendor
from our own `notifyBuyer`, receive JIR/ZKI/PDF, and attach the račun to our
existing branded ticket email** — one email, our ADR-0005 identity, and the JIR
stored on our Order. We accept the slightly higher code cost (Pro-tier API or
e-racuni API) for that control. If delivery deadline pressure beats polish, the
vendor-direct-email path is an acceptable v0 that we upgrade later.

## What unblocks us (exact checklist)

These are external and owned by the accountant (Marija Šestanović) + secretary
(Tatjana) + FINA, not by the developer. **None of the code below ships until
items 1–4 are done.**

- [ ] **1. VAT / PDV decision on the tickets.** Determine whether Moreška/
      folklore performance tickets sold by HGD are **VAT-exempt under čl. 39
      ZPDV** ("usluge u kulturi" by a legal person in culture — hinges on HGD's
      cultural-legal classification, e.g. entry in the Ministry of Culture
      register) **or** taxed (reduced **5%** for cultural-event tickets since
      2022-04-01; **25%** only if 5% conditions aren't met — **not 13%**).
      This decides the tax fields on every račun and is the single most
      fact-specific open point. *Owner: Marija Šestanović.*
      **Fiscalization is owed regardless of the answer** — even VAT-exempt /
      outside-the-VAT-system entities fiscalize B2C (the message just carries a
      "not in PDV system" flag).
- [ ] **2. FINA application certificate** ("poslovni aplikacijski certifikat za
      fiskalizaciju"). €39.82 + VAT, 5-year validity, **requested by HGD itself**
      (the legal entity — an implementer can't request it for them). For
      Approach A this is then **uploaded to the SaaS**. A **free demo cert** lets
      us build and test against TEST CIS (`cistest.apis-it.hr`) before the
      production cert exists. *Owner: Tatjana / FINA procedure (in progress).*
- [ ] **3. ePorezna registration of the poslovni prostor as
      "internetska trgovina"** (online shop). The naplatni uređaj is **not**
      entered in ePorezna — its label lives in the interni akt + the billing
      software. *Owner: accountant.*
- [ ] **4. Interni akt o fiskalizaciji** — the internal act defining the
      invoice **numbering rules** (gap-free `broj/oznaka prostora/oznaka
      uređaja`, restarting at 1 each calendar year), the **premises label**, the
      **naplatni uređaj label(s)**, and the cash maximum. The numbering sequence
      it defines is what the integration must drive. *Owner: accountant + board.*
- [ ] **5. (then) Choose vendor tier and create the Fiskalio account**, upload
      the production FINA cert, configure premises/device labels to match the
      interni akt.

## Integration seam (sketch only — do NOT build until unblocked)

The seam mirrors how `notifyBuyer` is wired in `src/app/api/stripe/webhook/route.ts`
as an injected dependency — pure logic, DI'd I/O, fail-open, flag-gated. **No
runtime behaviour changes from this ADR.**

```
                  src/app/api/stripe/webhook/route.ts
                                  │
                  handlePaymentSucceeded(event, deps)
                                  │
        ┌─────────────────────────┴─────────────────────────┐
   createOrder / createTickets                          notifyBuyer  ◄── existing seam
   (Order + per-person Tickets)                              │
                                            ┌────────────────┴────────────────┐
                                     send ticket email                 issueRacun (NEW)
                                     (ADR-0005, unchanged)             behind FISCALIZATION_ENABLED
                                                                             │
                                                          ┌──────────────────┴──────────────────┐
                                                   FiscalizationService (DI'd, like notifyBuyer) │
                                                   - maps Order → invoice payload (tax fields    │
                                                     from the VAT decision)                      │
                                                   - calls Fiskalio (or e-racuni) API            │
                                                   - returns { jir, zki, racunBroj, pdf? }       │
                                                          │                                       │
                                          persist JIR/ZKI/broj on the Order  ───────────────────┘
                                          attach račun PDF to the ticket email  (preferred)
                                                          │
                                          on failure → log to critical-events (ADR-0016),
                                          NEVER throw past notifyBuyer (200 contract held),
                                          re-issue out-of-band
```

**Shape (illustrative — not wired):**

```ts
// src/lib/fiscalization/issue-racun.ts  (sketch)
export interface IssueRacunInput {
  orderId: string
  orderCode: string
  buyer: { name: string; email: string }
  // EUR cents; tax treatment resolved from the VAT decision (checklist #1).
  amounts: { adultCount: number; childCount: number; total: number }
  paymentIntentId: string
  issuedAt: string // Europe/Zagreb
}
export interface RacunResult {
  jir: string
  zki: string
  racunBroj: string // broj/prostor/uređaj, gap-free per year (interni akt)
  pdf?: Buffer // attach to the ADR-0005 ticket email, or vendor emails directly
}
export interface FiscalizationDeps {
  enabled: boolean // FISCALIZATION_ENABLED feature flag
  fiscalize: (input: IssueRacunInput) => Promise<RacunResult> // SaaS adapter
  recordFailure: (orderId: string, err: unknown) => Promise<void> // ADR-0016 sink
}

// Fail-open: returns null (never throws) so the webhook keeps its 200 contract.
export async function issueRacun(
  input: IssueRacunInput,
  deps: FiscalizationDeps,
): Promise<RacunResult | null> {
  if (!deps.enabled) return null
  try {
    return await deps.fiscalize(input)
  } catch (err) {
    await deps.recordFailure(input.orderId, err)
    return null
  }
}
```

Persisting `jir`/`zki`/`racunBroj` on the Orders collection is a follow-up
schema change (one migration, ADR-0013 / db-bootstrap conventions) deferred to
the build — out of scope for this proposal.

## Alternatives considered

1. **Approach B — in-house Porezna CIS integration.** Port the SOAP + ZKI
   (RSA-SHA1 → MD5-hex) + JIR flow against the v2.6 tech spec, render the račun
   PDF with the existing `@react-pdf/renderer` stack, attach to the ticket email.
   *Rejected for now:* weeks of work plus a long correctness tail and a
   permanent maintenance burden on a solo dev, for a legally high-stakes
   artefact, with **no mature Node OSS base** to start from. The upside (no SaaS
   fee, key stays in-house) doesn't justify the risk at our volume. Kept as a
   documented escape hatch if the SaaS ever proves inadequate.
2. **Vendor emails the buyer the račun directly off the Stripe webhook** (zero
   integration code on our side). *Rejected as the default, accepted as a v0
   fallback:* splits the buyer's purchase into two emails (our branded ticket
   email + the vendor's račun email), and the JIR doesn't land on our Order
   without extra wiring. The API-return integration keeps one branded artefact
   and our own record.
3. **Do nothing / keep only Stripe's receipt.** *Rejected:* the Stripe receipt
   is not a fiscalized račun (no ZKI/JIR), so this is the non-compliant status
   quo that #297 exists to close.
4. **Wait for a mature Node B2C OSS library.** *Rejected:* none exists, none is
   on the horizon; the one TS lib is eRačun-only. Waiting is just deferral.
5. **e-racuni.hr as the primary** instead of Fiskalio. *Not rejected — it is the
   designated fallback.* Fiskalio is leaner and purpose-built for the
   Stripe→fiscalize→email shape; e-racuni is a fuller accounting suite (more than
   we need) but has a proven native Stripe connector if Fiskalio falls short.

## Consequences

- **Pro:** Closes the #297 compliance gap with days, not weeks, of work, and
  offloads the legally dangerous ZKI/JIR correctness + spec-drift maintenance to
  a specialist vendor.
- **Pro:** Fits the existing webhook → Order → ticket-email flow as an injected,
  fail-open, flag-gated seam — no change to the sacred 200 contract (ADR-0005),
  no runtime behaviour change until the flag flips.
- **Pro:** Bounded lock-in — the JIR/ZKI are stored on our Order and the FINA
  cert is ours and re-uploadable.
- **Con:** A third party holds the signing certificate's key at signing time and
  is in the critical path of a legal obligation; a vendor outage delays (but,
  given out-of-band re-issue, does not lose) račun issuance.
- **Con:** A recurring SaaS fee (~€20–40/mo at our volume) — affordable, but a
  new ongoing cost line for the org.
- **Con:** Still blocked on the external checklist; this ADR only fixes the
  approach, it does not make us compliant by itself.
- **Follow-ups when unblocked:** Orders schema migration for `jir`/`zki`/
  `racunBroj`; the Fiskalio (or e-racuni) adapter behind `FISCALIZATION_ENABLED`;
  a re-issue path for logged failures; TEST-CIS verification with the demo cert
  before the production cert goes live.

## Related

- Issue #297 — the compliance gap and the external blocker checklist
- ADR-0005 — ticket email + PDF presentation; the `notifyBuyer` seam and the
  webhook's 200 failure contract this design must preserve
- ADR-0016 — critical-events log; the sink for fiscalization failures
- ADR-0013 — schema management; the Orders migration is a follow-up under these
  conventions
- ADR-0012 — standalone container runtime (a Node SOAP/crypto client would fit,
  were we to ever choose B)
- `src/app/api/stripe/webhook/route.ts`, `src/lib/checkout/handle-payment-succeeded.ts`,
  `src/lib/email/send-ticket-email.ts` — the call site + flow the seam hooks into
- Primary legal sources: NN 89/2025 (Zakon o fiskalizaciji); porezna-uprava.gov.hr
  B2C fiscalization + eRačun guidance; Fiskalizacija tehnička specifikacija v2.6;
  čl. 39 Zakona o PDV-u (oslobođenje usluga u kulturi); FINA certificate pricing
