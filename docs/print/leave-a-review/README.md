# "Leave a Review" — A2 exit poster

Print poster for the A-frame stand, sibling to **Feel the Swords** (`docs/print/feel-the-swords/`).
One design carrying **both** QR codes (Google + TripAdvisor), printed **twice**: one on the
reverse of the Feel-the-Swords A-frame, one at the **exit of the Summer Theatre**. Its job is
to turn people who just watched the show into reviewers, scannable from standing distance.

## Files

| File | What it is |
|---|---|
| `leave-a-review-A2.pdf` | **Print master** — send this to the printer. A2 portrait (420×594 mm), 3 mm bleed, crop marks. |
| `preview.png` | Downsized on-screen preview (~1600px). Not for print. |
| `design-philosophy.md` | The canvas-design rationale ("Tempered Silence — Second Movement: The Offered Blade") behind the layout. |

The full-res 300 dpi PNG (5031×7088, ~1.4 MB) was left on the Desktop, not in the repo, to
avoid bloat. Regenerate it from the PDF if ever needed.

## Design

- **Copy (verbatim, English only):** headline `LOVED MOREŠKA?` / `LEAVE A REVIEW`; eyebrow `MOREŠKA · KORČULA`; instruction `SCAN WITH YOUR CAMERA`; footer `moreska.eu`. No dates, no prices.
- **Background:** near-black `#0A0A0A` with a vignette to `#050505` at the corners + subtle film grain (identical to Feel the Swords).
- **Headline:** warm off-white `#F5F2EC`, Labrada SemiBold, monumental all-caps, wide letter-spacing, optically centered.
- **Divider:** the site's `GoldDivider` motif — crossed-swords glyph centered on a slim gold line, gold `#B8881A`/`#D9A526`.
- **Twin tablets:** two mirror-balanced warm-white (`#FDFCF9`) tablets, each with its platform's full-colour logo (Google multicolour wordmark; TripAdvisor owl + wordmark, brand green `#00AA6C`), a black-on-white QR, and a gold `★★★★★` row. The brand colour is quarantined inside the white so the piece still reads black/off-white/gold from across the room.
- **Footer:** Cecilija emblem (gold-toned) above `moreska.eu`, muted gold.

## QR codes (verified)

Generated as **vector SVG** (error-correction level **H**, 4-module quiet zone, black on white),
so they stay razor-sharp at any size. Each printed QR is ~130 mm — scans easily from 1.5–2 m.

| Tablet | Encodes |
|---|---|
| Google (left) | `https://search.google.com/local/writereview?placeid=ChIJ1WfXALdRShMRDwNPzjZgj2I` |
| TripAdvisor (right) | `https://www.tripadvisor.com/UserReviewEdit-g1007309-d1898279-Moreska_Sword_Dance-Korcula_Town_Korcula_Island_Dubrovnik_Neretva_County_Dalmatia.html` |

Both were decoded back from the rendered artwork with `zxing-wasm` and matched the URLs above
exactly before shipping.

## Before printing (same notes as the sibling)

- **Rich black:** build the near-black field as a rich black (e.g. C40 M30 Y30 K100), **not** flat 100% K, or the large dark field prints weak/mottled and can band. Disable any auto-convert-to-K-only.
- **Colour profile:** the PDF is untagged RGB with no embedded ICC. Assign/convert to the printer's CMYK profile (e.g. FOGRA39) at the RIP; confirm the gold and the QR-tablet whites stay clean and the platform logos hold their brand colours.
- **QR contrast:** keep the QR modules pure black on the near-white tablet — do **not** let a K-only or ink-saving conversion tint them, and do not scale/re-sample them (they are vector — leave them vector).
- **Type & marks:** headline/labels are rasterised into the 300 dpi artwork (no live fonts). Crop marks sit in the 3 mm bleed.
- **Swords glyph:** source art (`assets/images/archived/swords.png`, transparent padding auto-trimmed at build) is low-res, upscaled to print size; eyeball the blade hairlines at 100% on the physical proof.
