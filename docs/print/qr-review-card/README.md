# QR review-solicitation card (GitHub #43)

Double-sided business card handed to every guest at the Summer Cinema (Ljetno
kino) exit, asking them to leave a review. Front → **Tripadvisor**, back →
**Google**. Bilingual EN/HR, brand layer per ADR-0003 ("Moreška by HGD Sveta
Cecilija").

## Files

| File | What it is |
|---|---|
| `qr-review-card.pdf` | **Print master** — 2 pages (p1 front/Tripadvisor, p2 back/Google), vector, with bleed + crop marks. This is what goes to the printer. |
| `preview-front.png` / `preview-back.png` | 300 dpi raster previews for review (not for print). |

Regenerate everything with:

```bash
node scripts/generate-review-cards.mjs
# previews (any of these work):
pdftoppm -png -r 300 docs/print/qr-review-card/qr-review-card.pdf docs/print/qr-review-card/preview
```

## Print specs (give these to the printer)

| Spec | Value |
|---|---|
| Trim size | **85 × 55 mm** (standard EU business card) |
| Bleed | **3 mm** all four sides → artboard **91 × 61 mm** |
| Safe margin | 4 mm inside trim (all live copy sits inside this) |
| Sides | Double-sided (4/4), front + back are the two PDF pages |
| Crop marks | Included in the bleed band at each corner |
| Colour | Artwork is RGB; ask the printer for a **CMYK** conversion proof. Brand gold `#B8881A`, ink `#1A140C`, Tripadvisor green `#00AA6C`, Google blue `#4285F4`. |
| Resolution | Vector (text + logo); QR is embedded at 600 px. Effectively unlimited at this size. |
| Stock | 350 gsm silk/matt recommended; **matt or soft-touch laminate** — gloss glare makes a QR harder to scan. Keep the QR's white quiet zone clean (no laminate texture over it). |
| Quantity | 500 (per #43) |
| Finish | Optional rounded corners are fine; they don't touch the safe area. |

## QR codes

- Error-correction level **H** (highest) — survives small print and a scuffed card.
- Both QRs were decoded back from the rendered 300 dpi output and verified to
  match their intended URLs (encoding integrity check, run during the build).
- **Before printing 500**, do the #43 acceptance test: scan both with a normal
  phone camera and confirm each opens the correct *write-a-review* form.

## Review URLs (the bit that needs human sign-off)

Both live in `scripts/generate-review-cards.mjs` as the `URLS` constant.

| Side | URL | Status |
|---|---|---|
| Front · Tripadvisor | `…/UserReviewEdit-g1007309-d1898279-…` | **Confirmed** — listing claimed under `pr@moreska.eu` (#35); same link the review posters use. |
| Back · Google | `search.google.com/local/writereview?placeid=ChIJ1WfXALdRShMRDwNPzjZgj2I` | **Provisional.** The canonical source is the GBP "Get more reviews" short link (`https://g.page/r/…/review`), which only exists once the profile is configured (#36, still open). **Swap this constant for the `g.page/r/…/review` link before the print run**, then regenerate. |

No incentive is offered for a review anywhere on the card — offering one
violates Google + Tripadvisor TOS (#43).

## Door-staff exit script

See `door-staff-exit-script.md` in this folder (the one-line ask to brief all
door staff with at season start).
