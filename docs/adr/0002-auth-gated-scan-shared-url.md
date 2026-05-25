# ADR-0002: Auth-gated scan endpoint with a shared buyer/staff URL

**Status:** Accepted
**Date:** 2026-05-24

## Context

QR codes are emailed to buyers after purchase. Each QR encodes `https://moreska.eu/scan/[token]`. The current `/scan/[token]` endpoint is public and atomically marks the token scanned on first hit.

This creates a real-world failure: buyers tap the link from their email "to check it works" and burn their own ticket. At the door, staff sees ALREADY_SCANNED and the buyer is locked out. Reported by HGD as the top concern blocking cutover.

A separate native or PWA scanner app (Pretix-style) was reconsidered as a fix.

## Decision

Keep a single `/scan/[token]` URL. Branch on request auth:

- **Unauthenticated** → render a buyer-facing ticket view (details + on-page QR + "show this at the door" notice). **Do not** mark the token scanned.
- **Authenticated `door-staff` or `admin`** → atomic mark-and-read; render VALID or ALREADY_SCANNED.

Introduce a restricted `door-staff` Payload role for the shared door account. Add a 2-minute "Undo scan" link on the ALREADY_SCANNED page for authed users.

## Alternatives considered

**Separate scanner app (native or PWA).** Rejected. The buyer would still tap the email link and land on `/scan/[token]` — so we'd still have to build the buyer-facing page. The scanner app is therefore strictly additive work without removing the underlying problem. It also adds install/onboarding friction for volunteer door staff. The web stack already works on staff phones and signal coverage at Ljetno kino is reliable.

**Two URLs — `/scan/[token]` (staff) and `/ticket/[token]` (buyer email).** Rejected because a fraction of buyers will still share the wrong link, paste it in chats, or tap the staff URL out of curiosity. Same URL with auth-aware behaviour is more forgiving — the wrong audience hitting the wrong URL just sees the right thing.

**Per-staff Payload accounts with audit trail.** Rejected. HGD's door is 1–2 known volunteers per show; attributing scans to a specific human has near-zero operational value. One shared `door-staff` account with rotatable password is sufficient.

## Consequences

- The atomic mark-and-read race-safety guarantee (single SQL `UPDATE ... WHERE scanned = false RETURNING ...`) still holds — only the gate condition changes (`isAuthed && role in [door-staff, admin]`).
- The buyer page is purely informational; it can render without DB writes, so it's safe behind aggressive caching if needed later.
- The Stats dashboard and the scan endpoint share the same role check, so role plumbing is amortised across both features.
- "Undo scan" within 2 minutes covers honest misclicks. Beyond 2 minutes, admin must intervene — acceptable given low expected volume.
- If signal at the venue ever becomes unreliable, an offline-capable PWA could wrap this same endpoint. The decision doesn't preclude that.
