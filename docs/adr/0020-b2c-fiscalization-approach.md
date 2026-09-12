# ADR-0020: B2C fiscalization of online ticket sales — SaaS vs in-house CIS

**Status:** Proposed — build-vs-buy decision stands; still contingent on the external "unblock" checklist below (see the 2026-08-21 amendment for what has since closed and what has not)
**Date:** 2026-06-25 (renumbered 0018 → 0020 on 2026-07-07; legal + vendor claims re-verified against current sources the same day — see the verification note under Context. **Amended 2026-08-21** with the accountant's corrections and the vendor-inquiry results — read the amendment first, it overrides several claims below.)

> ## Amendment 2026-08-21 — accountant's facts override the leanings below
>
> The body of this ADR was written before the org's accountant and secretary
> answered. **Where they disagree, their answer governs.** Read this section
> before acting on anything further down.
>
> **1. VAT is 25%, included in the ticket price — not exempt, not 5%.**
> Confirmed by tajnica Tatjana Vigna 2026-07-07, sourced from the local Porezna
> uprava: €20 adult = €16.00 base + €4.00 PDV, €10 child at the same rate. This
> **supersedes** the "čl. 39 exemption or 5% reduced rate" lean in the Context
> verification note and in checklist item 1. The rate is nevertheless **not
> settled forever** — Tatjana noted it "may change subject to a ministry
> opinion", and a request for that opinion is an open parallel track (worth ~€3.05
> per adult ticket if it succeeds). **Therefore the VAT rate must be a
> configuration value, never a constant** — a successful opinion changes one
> setting, not the integration.
>
> **2. The FINA certificate exists.** Issued **2026-07-02**, ref
> `FFAA0D6B7A59FD63D914`, in the name of the physical person **Velebit Veršić**
> linked to the business entity HGD SV. CECILIJA-KORČULA. The secretary
> downloaded it and set a password. Checklist item 2 is therefore **mostly
> closed**, with two caveats: the `.p12`/`.pfx` file has **not yet been handed to
> the developer**, and the issuance mail describes a *"NRA1"* certificate issued
> to a physical person, so it must be **verified to be the fiscalization
> application certificate** (the one that signs the ZKI) and not a business
> certificate for ePorezna access. Verify from the file's subject before
> committing to a vendor. The password was transmitted in plain-text email and
> should be treated as compromised: re-download with a new one if practical.
>
> **3. New requirement this ADR never covered: R1 company invoices.** The
> accountant wants the web shop itself to issue an **R1 račun** (company buyer:
> naziv, OIB, adresa) automatically when a buyer asks for one. It carries the
> **same number sequence** as ordinary receipts — the buyer block is the only
> difference — so no separate series is needed. This means a
> "trebam račun na firmu" capture step in checkout, which must ship **behind the
> same feature flag as fiscalization** (promising a company invoice we cannot yet
> issue is worse than not offering it).
>
> **4. Payment method decides the regime.** F1 (JIR/ZKI via CIS) for cash and
> cards; F2/eRačun for bank transfers. **Partner-channel sales stay out of F1** —
> partners receipt their own buyers, and HGD settles with them B2B under F2 at
> season end. This is consistent with ADR-0008, which is *not* reversed; see the
> scoping note added there.
>
> **5. Nothing has ever been fiscalized.** Confirmed 2026-07-07: no online sale,
> from launch through the 2026 season, has produced a fiscalized račun. The
> working decision is to **draw a line at go-live** and fiscalize forward, leaving
> the prior period to the accountant to settle in the books rather than
> back-filling hundreds of receipts into CIS with wrong dates. **This is pending
> the accountant's explicit confirmation** and is the one open item where being
> wrong means filing bad data.
>
> **6. Vendor selection has moved.** See the amended vendor section below —
> Fiskalio was never actually contacted, and the two vendors who did reply
> changed the picture.
>
> **Still open and blocking the build** (owner: Marija Šestanović, accountant, via
> Tatjana): the **poslovni prostor label** and its ePorezna registration as an
> internetska trgovina, the **naplatni uređaj label**, the **operater OIB**, the
> mandatory receipt notes, the **interni akt** and its starting number for the WEB
> series, how a **refund/storno** is fiscalized (we have buyer self-serve refunds
> per ADR-0021, so storno must be automatable), and the deadline for deferred
> submission when CIS is unreachable. Without the first four, no receipt can be
> sent at all.
>
> Two edge cases the accountant still has to rule on, both created by ADRs written
> after this one: **comp tickets** (`channel='comp'`, `total=0` — ADR-0019) and
> **promo-code orders** (discounted adult price — ADR-0018). A zero-value receipt
> and a discounted one are not obviously the same case.

> **Renumbered 0018 → 0020.** This ADR was originally merged as **ADR-0018**
> (PR #304, 2026-06-25). A later change (PR #328) independently reused 0018/0019
> for the member-promo-codes and comp-ticket ADRs, which are referenced across the
> code, schema and docs far more widely. To resolve the duplicate-number collision
> with the least churn, this document was moved to the next free number, **0020**.
> Older references that say "ADR-0018" (issue #297 comments, PR #304) mean this ADR.

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

> **Verified 2026-07-07** (re-checked against current Porezna uprava, Narodne
> novine, FINA and vendor sources). Every load-bearing claim above still holds:
> NN 89/2025 is in force from 2025-09-01; Porezna states explicitly that *B2C
> invoicing (Fiskalizacija 1.0) does not change* under 2.0 — consumer receipts
> still get a **JIR + locally-computed ZKI + QR via the real-time CIS flow**, and
> eRačun (B2B/B2G) carries no JIR/ZKI and does **not** cover consumer ticket
> sales. The one genuinely new 2026 fact is the payment-method expansion noted
> above: since **2026-01-01** B2C fiscalization applies to *all* payment methods
> incl. transaction-account settlement (previously exempt), so an online Stripe
> sale is squarely in scope. The obligor trigger is confirmed to be **porez na
> dobit, independent of PDV status** (a non-PDV porez-na-dobit payer still
> fiscalizes) — which is exactly why HGD's 2026-06-18 porez-na-dobit confirmation
> settles our obligor status. The čl. 39 cultural-services exemption and the
> **5%** reduced rate for cultural-event tickets (5% or 25%, *not* 13%) both
> remain in force. The current CIS interface is **tech spec v2.6** (WSDL v1.8 from
> 2025-09-01, **v1.9 from 2026-01-01**) — a moving target that reinforces the
> "let a vendor track spec drift" decision below.

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
| **Recurring cost** | ~€0–80/mo. Fiskalio (all prices **+ PDV/VAT**): Free (3 inv/mo) → Starter €19.99 (200) → Basic €39.99 (500) → Pro €79.99 (1000, REST API). Our peak fits Starter/Basic. Plus FINA cert €39.82+VAT / 5 yr. | FINA cert only (€39.82+VAT / 5 yr). No SaaS fee — but real cost is dev + ongoing maintenance against spec changes. |
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

> **Superseded 2026-08-21 — the vendor pick below is stale.** The decision
> *"SaaS, not in-house CIS"* stands and was independently confirmed by the
> accountant. The specific ranking did not survive contact with the market. What
> actually happened:
>
> A new selection criterion appeared after this ADR was written: the accountant
> asked that the **same service also provide a physical POS blagajna** for
> door sales. That filtered **Fiskalio and FiskalAPI out before they were ever
> contacted** — neither was emailed. On **2026-07-15** an inquiry went from
> `info@moreska.eu` to four POS-capable vendors: Solo/Superbo, e-Računi,
> Webračun and Adeo POS. **Only two replied.** Solo and e-Računi never answered
> and are treated as non-responsive.
>
> | | **Webračun** | **Adeo POS** (neoinfo.hr) |
> |---|---|---|
> | Own FINA cert | Yes, uploaded to them (F1); their intermediary cert for F2 | Yes, stays HGD's |
> | JIR/ZKI via REST | Yes | Yes, F1 + F2 on one API, docs supplied (*Fiscalization API v1.14*) |
> | **Storno via API** | **No — UI only** | **Yes** |
> | **R1 auto-fiscalized** | **No — buyer data makes it a non-fiscalized PDF needing two manual clicks** | Yes, full company buyer block |
> | Blagajna | Android/web, **no offline mode** | Android, offline with catch-up fiscalization |
> | Price | €40 setup + €24,99/mo only in months with ≥1 invoice, 700 invoices incl. | €100/mo (1.000 tx), €0,30/tx over, **+€1.000 optional integration support** |
>
> **Webračun is disqualified on function, not price.** Manual storno cannot serve
> ADR-0021's buyer self-serve refunds, which fire without a human present, and an
> R1 that needs two manual clicks is not the automatic R1 the accountant asked
> for. Its seasonal pricing model is otherwise the best fit here, which is worth
> remembering if either gap ever closes.
>
> **Adeo POS is the leading candidate**, and the only respondent that satisfies
> every functional requirement. The open question is cost: €1.200/yr flat for an
> org that sells tickets four months a year. On **2026-08-21** a reply was sent
> asking for **seasonal pricing or dormancy in no-revenue months**, declining the
> €1.000 integration support, and asking how certificate handover, expiry and a
> test environment work. **If they refuse seasonal pricing, re-open Fiskalio and
> FiskalAPI for a web-only integration** and let the org buy a POS separately —
> the "one vendor for both" criterion was the secretary's convenience, not a legal
> requirement, and it is what removed the two cheapest candidates from
> consideration in the first place. Lock-in stays bounded either way: JIR and ZKI
> land on our own Order.
>
> Everything from here to the end of this section is the **original 2026-06-25
> reasoning, retained for context**.

**Vendor pick: Fiskalio first.** It is purpose-built for exactly this shape —
a **native Stripe-webhook flow** (add its URL in the Stripe dashboard; it
detects the payment, fiscalizes, emails the račun), **upload-your-own FINA
cert**, PDF račun on every tier, and a REST API on the Pro tier for the
tighter "return JIR/PDF to us, we attach to our email" integration we prefer.
**e-racuni.hr is the fallback** — it advertises a native Stripe connector
(paste the Stripe secret key) and full Croatian accounting, heavier than we
need but a proven escape hatch. **FiskalAPI (fiskalapi.hr) is a strong
developer-first second fallback** if we'd rather call an API from our own
handler: a REST fiscalization API (F1.0 + 2.0 + eRačun) with **webhooks**, a
free 50-invoice/mo tier and €29/mo for 1000, no contract — it fits a
webhook-driven Next.js app almost as directly as Fiskalio, minus the turnkey
Stripe connector. (Solo has an API but **cannot talk to Stripe directly** — it
needs middleware we'd build — so it is not a drop-in; FiskAI (fiskai.hr) is a
newer 2026 webshop-B2C entrant worth a look if the above fall short.)

**Integration style — prefer API-return over vendor-emails-buyer.** Both
Fiskalio and e-racuni can email the buyer the račun *directly* off the Stripe
webhook, which is the zero-code path. We instead prefer to **call the vendor
from our own `notifyBuyer`, receive JIR/ZKI/PDF, and attach the račun to our
existing branded ticket email** — one email, our ADR-0005 identity, and the JIR
stored on our Order. We accept the slightly higher code cost (Pro-tier API or
e-racuni API) for that control. If delivery deadline pressure beats polish, the
vendor-direct-email path is an acceptable v0 that we upgrade later.

## What unblocks us (exact checklist)

These are external and owned by the accountant (Marija Šestanović,
Knjigovodstveni servis ŠESTA, `marija6anovic@gmail.com`) + secretary (Tatjana
Vigna, who relays rather than decides) + FINA, not by the developer. **None of
the code below ships until items 1–4 are done.**

> **Checklist status 2026-08-21.** Item 1 is **answered** (25% PDV included in
> the price — see the amendment at the top; a ministry opinion for a lower rate is
> a separate, non-blocking track). Item 2 is **mostly closed** — the certificate
> was issued 2026-07-02 but the file is not yet in the developer's hands and its
> type needs verifying. **Items 3 and 4 are untouched and are now the real
> blockers**: without a registered poslovni prostor label, a naplatni uređaj
> label, an operater OIB and an interni akt fixing the WEB number series, not a
> single receipt can be transmitted. Asked of the secretary 2026-07-07, answered
> *"I don't know all of this, I have to check"*, and never followed up. Re-asked
> of the accountant directly 2026-08-21.

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
