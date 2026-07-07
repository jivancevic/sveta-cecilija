# "Look Left" — A2 gate wayfinding poster

Print poster for an A-frame at the **bottom of the Korčula Old Town gate stairs**. Its one job
is to catch people descending the steps and **turn their head to the left** — 20 m away, toward
the **Summer Theatre entrance**, where the gates are open and two Moreška performers stand with
torches. The torch-lit entrance is the payoff; this poster is only the turn of the head.

This is the **left-facing mirror** of `docs/print/look-right/` — same poster, glance and arrow
flipped — for the A-frame position where the entrance is to the viewer's left instead of right.
Print whichever one matches how the A-frame actually sits at the gate. Fourth member of the
poster family, after **Feel the Swords** (`docs/print/feel-the-swords/`), **Leave a Review**
(`docs/print/leave-a-review/`) and **Look Right** (`docs/print/look-right/`). Same "Tempered
Silence" kit.

## Files

| File | What it is |
|---|---|
| `look-left-A2.pdf` | **Print master** — send this to the printer. A2 portrait (420×594 mm), 3 mm bleed, crop marks. |
| `preview.png` | Downsized on-screen preview (~1600px). Not for print. |
| `design-philosophy.md` | The canvas-design rationale ("Tempered Silence — Third Movement, mirrored: The Turned Gaze (Left)"). |

The full-res 300 dpi PNG (5031×7088) was left on the Desktop, not in the repo, to avoid bloat.
Regenerate it from the PDF if ever needed.

## Design

The poster gives **three reinforcing leftward cues** so the redirect is unmissable from a moving
distance: the hero eyes glance left, the headline says it, and a gold arrow launches off the
left edge toward the real event.

- **Copy (verbatim, English only):** eyebrow `MOREŠKA · KORČULA`; headline `LOOK LEFT`; anchor `THE SWORDS ARE OUT · 20 M`; footer `moreska.eu`. No dates, no prices.
- **Hero — the eyes:** a large engraved pair of eyes glancing hard left, drawn as fine off-white line-art with a gold iris (radial striations + single catch-light) and near-black pupil. A faint off-white sclera glow lets them read from across the street without breaking the austere look. The pupils sit at the **viewer's left**, so the gaze points the same way as the physical entrance.
- **Arrow:** a slender gold blade-arrow (with a fuller groove, so it reads as both arrow and Moreška blade) aimed *through* the left margin.
- **Background:** near-black `#0A0A0A` with a vignette to `#050505` + subtle film grain (identical to the siblings).
- **Headline:** warm off-white `#F5F2EC`, Labrada SemiBold, monumental all-caps.
- **Divider:** the site's `GoldDivider` motif — crossed-swords glyph on a slim gold line, gold `#B8881A`/`#D9A526` — kept small as a supporting motif under the anchor line.
- **Footer:** Cecilija emblem (gold-toned) above `moreska.eu`, muted gold.

The eyes and arrow are the exact art of the Look Right sibling, mirrored horizontally
(`scaleX(-1)`), so the two posters are a true matched pair.

## Before printing (same notes as the siblings)

- **Rich black:** build the near-black field as a rich black (e.g. C40 M30 Y30 K100), **not** flat 100% K, or the large dark field prints weak/mottled and can band. Disable any auto-convert-to-K-only.
- **Colour profile:** the PDF is untagged RGB with no embedded ICC. Assign/convert to the printer's CMYK profile (e.g. FOGRA39) at the RIP; confirm the gold of the iris and the arrow stays clean and doesn't shift muddy.
- **Type & marks:** headline/labels are rasterised into the 300 dpi artwork (no live fonts). Crop marks sit in the 3 mm bleed.
- **Swords glyph:** source art (`assets/images/archived/swords.png`, transparent padding auto-trimmed at build) is low-res, upscaled to print size; eyeball the blade hairlines at 100% on the physical proof.
- **Placement:** mount on the A-frame so the poster's left edge faces the Summer Theatre; the eyes and arrow then point true toward the entrance.
