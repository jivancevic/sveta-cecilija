# Design Brief — moreska.eu
# HGD Sveta Cecilija Homepage

---

## Content Sources

All website copy is maintained in two files:

- **English:** `uploads/copywriting.md`
- **Croatian:** `uploads/copywriting-hr.md`

All the videos and images are inside uploads folder.

All text in this brief (headlines, body copy, CTAs, labels) should be drawn from those files. Do not invent copy — use the exact strings defined there.

---

## Project

Homepage for HGD Sveta Cecilija — a 143-year-old Croatian cultural organisation and guardian of the Moreška sword dance, Korčula, Croatia. Website: moreska.eu.

**Goal:** Generate 3 high-fidelity homepage prototypes. The site must feel like the definitive cultural home of Moreška — cinematic and prestigious on arrival, warm and editorial as the user scrolls deeper.

---

## Brand Identity

### Colours

| Role | Hex |
|---|---|
| Near-black | `#0A0A0A` |
| Warm off-white | `#F5F0EA` |
| Blood red | `#8B0000` |
| Amber gold | `#D4A017` |

### Typography

| Role | Typeface |
|---|---|
| Headlines & display | Gandur New Semibold |
| Body copy & UI labels | Inter |
| Dates, times, prices, ticket counts | IBM Plex Mono |

### Buttons

- **Primary:** Solid blood red `#8B0000`, white text, 6px border radius — used for "Buy Tickets"
- **Secondary:** Ghost button, white border + white text on dark backgrounds, 6px border radius — used for "Discover"
- All buttons: Inter Medium, slightly wide letter-spacing

### Recurring Motif

A single amber gold `#D4A017` horizontal ornamental rule or thin line used as a section divider throughout the page.

---

## Page Structure (top to bottom)

### 1. Navigation

- Transparent over the hero, transitions to solid `#0A0A0A` on scroll
- Logo (emblem + wordmark) left-aligned in white — use `uploads/cecilija-logo.png`
- Links right-aligned in white: Performances · About · Sections *(dropdown)* · Services *(dropdown)* · Contact · EN / HR language toggle
- Persistent **Buy Tickets** button in blood red `#8B0000` at the far right — always visible
- **Mobile:** hamburger icon opens a full-screen dark overlay (`#0A0A0A`) with links centred in large Gandur New

---

### 2. Hero — Full screen, dark and cinematic

- Full-bleed video: `hero-horizontal.webm` on desktop (landscape viewports), `hero-vertical.webm` on mobile (portrait viewports)
- First 5 seconds have text baked into the video: "MOREŠKA" → "KORČULA" → "HGD SVETA CECILIJA" — render this as large Gandur New Semibold text in the mockup over a dark video still
- From second 5 onward: video continues under a dark grey desaturating overlay. The HGD Sveta Cecilija logo (emblem + wordmark) animates into the centre — scale up from 60% + fade in, duration 0.6s, quick and confident. Show the logo centred on the greyed overlay in the mockup.
- Video loops from the 5-second mark onward after the first play
- Two CTA buttons pinned near the bottom of the hero, centred:
  - **Buy Tickets** — solid blood red, white text
  - **Discover** — ghost white outline
- No other text on the hero

---

### 3. Gold Divider

Full-width amber gold ornamental rule, thin, marking the threshold between the dark hero and the warm body.

---

### 4. About — Warm white `#F5F0EA` background

- 50/50 split: copy on the left, strong performance photograph on the right
- **Left:** large Gandur New Semibold headline — *"A Living Tradition, 143 Years in the Making"* — followed by 3 sentences of Inter body copy, followed by a text link CTA: *Discover Our Story →* in amber gold
- **Right:** full-bleed performance photograph cropped to fill the panel. Moreška performers in costume mid-action. Use `uploads/moreska02.jpg`.

---

### 5. Performance Schedule — Warm white `#F5F0EA` background

- Headline in Gandur New Semibold: *"2026 Season Performances"*
- Subheadline in Inter: *"Summer Cinema, Korčula · Showtime 21:00"* — "Summer Cinema" is a gold underlined link (opens Google Maps: https://maps.app.goo.gl/jbkEs9o7L9oa3S2F9)
- Next 4 upcoming performances as a compact list. Each row in IBM Plex Mono: date · day · time · a small capacity pill (amber gold when below threshold, grey when ample) · **Buy** button in blood red
- Below the list: *"View All 24 Performances →"* text link in amber gold
- Ticket pricing line in Inter: *Adult €20 · Children under 14 €10 · Groups: every 5th ticket free*
- Full schedule page uses a month accordion — shows grouped by month, each expanding to the compact list treatment above

---

### 6. History Timeline — Warm white `#F5F0EA` background

- Headline centred: *"Four Centuries in the Making"* in Gandur New Semibold
- Vertical amber gold centre spine running the full height of the section
- 8 entries alternating left and right of the spine. Each entry:
  - Year in large Gandur New Semibold in amber gold `#D4A017`, anchored to the spine
  - Title in Gandur New Semibold, near-black
  - 2–3 sentence description in Inter
  - Square photograph with a subtle amber gold frame, opposite the text
- Entries animate in on scroll (fade + slight upward translate)
- On mobile: collapses to a single-column list with the spine on the left

**Timeline entries (7 total):**

1. **1150** — The Dance Is Born — `uploads/leridas.jpg`
2. **1666** — First Record in Korčula — `[PLACEHOLDER — no archival image available]`
3. **1883** — HGD Sveta Cecilija Is Founded — `uploads/cecilija-old-logo.png`
4. **1937** — The Music Is Written Down — `uploads/mandolina.jpg`
5. **1944** — Revived from the Ashes — `uploads/torches.jpg`
6. **1991** — A New Era — `uploads/bula-kralj.jpg`
7. **Today** — A Protected Living Heritage — `uploads/bula-krupni.jpg`

---

### 7. Sections — Near-black `#0A0A0A` background

- Headline centred in Gandur New Semibold, warm off-white: *"Our Sections"*
- **Layout:** Moreška gets a large featured card (left, approx 60% width). Brass Band, Klapa, and Choir share the right column as three stacked equal cards.
- Each card: full-bleed performance photograph with a dark grey overlay. Section name in Gandur New Semibold in warm off-white over the overlay. One-line description in Inter below the name. Subtle *Discover →* link in amber gold at the bottom of each card.
- **Card images:**
  - Moreška — `uploads/kraljevi-krupni.jpg`
  - Brass Band — `uploads/band01.jpg`
  - Klapa — `uploads/klapa.jpg`
  - Choir — `uploads/choir.jpeg`
- On hover: overlay lightens slightly, revealing more of the photograph beneath
- On mobile: all four cards stack to full-width

---

### 8. Services — Warm white `#F5F0EA` background

- Headline centred in Gandur New Semibold: *"Private Experiences"*
- Two equal cards side by side:
  - **Private Moreška** — a full private performance for groups — `uploads/black-king-closeup.jpg`
  - **Moreška Experience** — an intimate educational encounter, min. 5 people — `uploads/moreska-experience.jpg`
- Each card: atmospheric photograph, card title in Gandur New Semibold, one-line teaser in Inter, *Enquire →* CTA in blood red text link
- No pricing shown on either card

---

### 9. Contact — Warm white `#F5F0EA` background

- Headline: *"Get in Touch"* in Gandur New Semibold
- Subheadline in Inter: *"For general enquiries, private bookings, press, or anything else."*
- Simple form: Name · Email · Enquiry type (dropdown) · Message · Submit button in blood red
- Right of the form (desktop): contact details in Inter — *info@moreska.eu · HGD Sveta Cecilija, Korčula, Croatia*

---

### 10. Footer — Near-black `#0A0A0A` background

- Tagline in Gandur New Semibold, warm off-white: *"Guardians of the Steel Dance since 1883."*
- Navigation links in Inter, muted warm-white
- Social icons: Facebook · Instagram · YouTube
- Legal links: Privacy Policy · Cookie Policy
- Language toggle: EN / HR

---

## Tone Reference

The page should feel like a **theatre programme crossed with a luxury cultural institution website** — not a folk museum, not a tourist trap. Prestigious, restrained, with moments of drama. The Moreška is not quaint — it is iron and fire and 400 years of survival. The design should say so.

---

## Three Prototype Directions

### 1. "Teatro"
Maximum restraint. Wide whitespace on the light sections, all drama concentrated in the hero and sections block. Typography does most of the work. Gold used sparingly as a single accent.

### 2. "Korčula Stone"
Textured warmth. The off-white sections feel like aged parchment. Gold is used more liberally — borders, rules, drop caps on pull quotes. Photography is slightly warmer and more intimate.

### 3. "Steel and Fire"
Higher contrast. The dark zones are darker, the red is more prominent (used also on hover states and active links, not just buttons). The timeline spine is bolder. The hero transition to content is more abrupt — a hard cut rather than a gentle divider.
