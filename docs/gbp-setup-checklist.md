# Google Business Profile setup checklist (#36)

> **#36 is closed (2026-09-19) and this pass is done.** Everything below landed except the photo target in step 6, which the owner waived at three photos rather than six. Two things outlived the issue: the duplicate report from step 8 is still with Google, and the previous owner is still **Primary owner** (step 1 deliberately left him there until the profile was configured, which it now is). Keep this file as the runbook for the next profile pass, and read the notes in steps 4 and 7 before touching either.

One-sitting checklist to configure the **existing** Google Business Profile for HGD Sveta Cecilija. The listing was already claimed and transferred to `info@moreska.eu` (backup `josip.ivancevic00@gmail.com`) on 2026-05-26, so **no postcard/verification is needed**. This is a configuration pass, not a creation pass.

Do everything from the **"Your business on Google"** panel that appears on a normal Google Search results page when you search the business name while signed in as `info@moreska.eu` (`authuser=` picks the account). `business.google.com/locations` only lists profiles, and deep paths like `business.google.com/n/<id>/managers` 404. Set the **category first**: it is what decides which surfaces exist.

---

## Naming decision (read first)

Set the business name to exactly **`HGD Sveta Cecilija`**.

- Do **not** prefix with "Moreška –". That reads as keyword stuffing to Google and risks suspension.
- This **overrides** the original framing in [ADR-0003](./adr/0003-brand-layer.md), which suggested registering as "Moreška – HGD Sveta Cecilija" to avoid auto-merge with the competitor. That concern is moot: the listings are already separate and this one is already claimed. The "Moreška" brand layer lives in the profile *description* and posts, not in the name.

---

## 1. Confirm ownership

`business.google.com` → select the listing → **Users** (or **Settings → People and access**).

- [ ] `info@moreska.eu` is listed as **Owner** (not Manager).
- [ ] `josip.ivancevic00@gmail.com` is listed as **Owner** (not Manager).
- [ ] **Do not** remove the previous owner's access yet — leave it until everything below is verified, in case access needs to be restored.

If either account shows as Manager, use the **⋮ → change role → Primary owner / Owner** flow. There can be one Primary owner plus additional Owners.

## 2. Name

Edit profile → **About / Name**.

- [ ] Name = `HGD Sveta Cecilija`

## 3. Address

Edit profile → **Location / Address**.

- [ ] Primary address = `Knežev prolaz 1, 20260 Korčula, Croatia`

This is the society HQ and matches the registry record (OIB `52537805408`, MB `03688194`), so it carries lower compliance risk than using the show venue. Keep the pin on the HQ.

## 4. Categories

Edit profile → **Category**.

- [ ] Primary category = `Performing arts theatre`
- [ ] Secondary categories (add all four):
  - [ ] `Cultural centre`
  - [ ] `Tourist attraction`
  - [ ] `Historical society`
  - [ ] `Live music venue`

> **Spelling is en-GB in this account's locale** (`theatre`, `centre`), and the field REFUSES free text: type a short prefix, wait for the async suggestion list, and click the entry. Typing the full name and pressing Save fails with "We didn't understand your category."

> Set the **primary** category before step 7, and expect approval to take about a day rather than the ten minutes the banner promises. Step 7's surface does not exist until the category is approved, not merely submitted.

## 5. Hours

Edit profile → **Hours**. Use society HQ office hours, **not** show times (show schedule goes in Posts instead, step 9).

- [ ] Monday: `21:00 – 23:00`
- [ ] Thursday: `21:00 – 23:00`
- [ ] Tuesday, Wednesday, Friday, Saturday, Sunday: **Closed**

## 6. Photos

Edit profile → **Photos**. Upload a primary photo + at least 5 more. Suggested mix:

- [ ] Primary: the HGD logo (or a strong performance shot)
- [ ] Exterior of `Knežev prolaz 1` (the HQ)
- [ ] 3–5 performance shots (Moreška in action)
- [ ] 1 of the Ljetno kino (Summer Cinema) venue

Source imagery: HGD-controlled photos only (avoid generic stock). Optimised webp/jpg from `assets/images/` are fine. Re-use the season's standout performance shot as the recurring post cover for visual consistency (see post template).

## 7. Booking / reservation link

**Not a field in Business information.** Verified 2026-09-14 with the primary category approved: there is no Appointment/Reservation field in any of the five sections (About, Contact, Location, Hours, More). For `Performing arts theatre` the booking URL lives behind the panel's **Activities** button, a two-step wizard:

1. Name, description, price, visitor type, then "Where can people book this activity online?" → **Booking URL**, then the includes chips.
2. Photo, duration, language. Its **Save** is what commits (Skip commits too, without the step-2 fields).

- [ ] Booking link = `https://moreska.eu/tickets`

An activity is editable and deletable afterwards, and shows publicly within ~20 minutes rather than going through the usual review queue. Only tick the includes chips that are TRUE: `Instant confirmation` and `Mobile ticket` are, `Free cancellation` is **not** (refunds here are admin-initiated, plus the ADR-0021 self-serve path on a rescheduled show).

Never point this at the legacy `korcula-moreska.com`.

## 8. Duplicate sanity check

While editing, search Google Maps for "Sveta Cecilija" / "Moreška HGD" in Korčula.

- [ ] Confirm there is no **second** HGD listing (a duplicate). If you find one, use **Suggest an edit → Close or remove → Duplicate** on the spurious one — do not touch the competitor's separate `moreska.hr` listing.

One WAS found and reported on 2026-09-13: `HRVATSKO GLAZBENO DRUŠTVO SV. CECILIJA` at Ul. Ante Starčevića 53, no reviews, no website, carrying the exact registry legal name. Still with Google. The Maps place panel would not open for it, so the report went through the Google Search knowledge panel's **Suggest an edit** instead. Its phone number `020 715 770` was never positively attributed to the society, so check that before re-filing if Google rejects the report.

## 9. Weekly posts (ongoing, not a one-off)

The post copy is ready in [`docs/gbp-weekly-post-template.md`](./gbp-weekly-post-template.md): Event post (per show), weather-fallback notice, and season opener, both EN and HR.

- [ ] Confirm you can post: **Promote → Add update / Event**. Post the first Event entries for this week's shows to validate the flow.

Ongoing curation (weekly posts, review responses, Q&A, photos) is owned by the **HGD campaign manager**, not the developer. Hand this off once the profile is configured.

## 10. Grab the review short link (unblocks #43)

Once the profile is live and configured:

- [ ] On the GBP dashboard, find **"Get more reviews" → Share review form**, copy the short link (looks like `https://g.page/r/XXXXXXXXXXXX/review`).
- [ ] Paste it into issue **#43** (QR review cards). That link is the Google QR target — #43 is blocked on it.

---

## Reference values (single source)

| Field | Value |
|---|---|
| Business name | `HGD Sveta Cecilija` |
| Address | `Knežev prolaz 1, 20260 Korčula, Croatia` |
| Primary category | `Performing arts theatre` (en-GB, as the picker spells it) |
| Secondary categories | `Cultural centre`, `Tourist attraction`, `Historical society`, `Live music venue` |
| Hours | Mon 21:00–23:00, Thu 21:00–23:00, else Closed |
| Booking link | `https://moreska.eu/tickets` |
| Legal name (if re-verification prompts) | `HRVATSKO GLAZBENO DRUŠTVO SV.CECILIJA - KORČULA` |
| OIB / MB (if prompted) | `52537805408` / `03688194` |

See `CLAUDE.md → Organisation registry details` for the full registry record.
