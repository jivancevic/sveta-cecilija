# "Feel the Swords" — A2 exit poster

Print poster for the A-frame stand placed at the **exit of the evening performance**,
in the middle next to the used swords, inviting the audience to come touch/hold them
(plus a quiet nudge to tag the org on Instagram).

## Files

| File | What it is |
|---|---|
| `feel-the-swords-A2.pdf` | **Print master** — send this to the printer. A2 portrait (420×594 mm), 3 mm bleed, crop marks. |
| `preview.png` | Downsized on-screen preview (~1600px). Not for print. |
| `design-philosophy.md` | The canvas-design rationale ("Tempered Silence") behind the layout. |

The full-res 300 dpi PNG and the earlier V1 were left out of the repo to avoid bloat
(each is ~22–32 MB). Regenerate the PNG from the PDF if ever needed.

## Design

- **Copy (verbatim, English only):** `FEEL / THE / SWORDS`, stacked. Footer: Instagram glyph + `TAG US  @hgdsvetacecilija`. No URL, no QR, no dates, no prices.
- **Background:** near-black `#0A0A0A` with a vignette to `#050505` at the corners + subtle film grain.
- **Hero:** warm off-white `#F5F2EC`, Labrada SemiBold, monumental all-caps, wide letter-spacing, optically centered just above the vertical middle.
- **Divider:** the site's `GoldDivider` motif — crossed-swords glyph centered on a slim gold line, gold `#B8881A`/`#D9A526`.
- **Footer:** Cecilija emblem above the tag line, muted gold.

## Before printing (checked with the print shop)

- **Rich black:** build the near-black field as a rich black (e.g. C40 M30 Y30 K100), **not** flat 100% K, or the large dark field prints weak/mottled and can band. Disable any auto-convert-to-K-only.
- **Colour profile:** the PDF is untagged RGB with no embedded ICC. Assign/convert to the printer's CMYK profile (e.g. FOGRA39) at the RIP; confirm the gold doesn't shift muddy.
- **Type:** rasterised into the 300 dpi artwork (no live fonts — zero substitution risk, but not editable/vector).
- **Swords glyph:** source art (`assets/images/archived/swords.png`) is low-res, upscaled ~1.4× to print size. Reads clean in preview; eyeball the blade hairlines at 100% on the physical proof.
