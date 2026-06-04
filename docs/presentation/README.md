# Board presentation — "Digitalna obnova HGD Sveta Cecilija"

Internal 20-minute talk for the Upravni odbor (board). Croatian, non-technical, before/after
framing of the whole digital revolution. Dark cinematic look (gold Bodoni titles, moreška photography).

## Deliverables (`out/`)

- **`Digitalna-obnova-HGD-Sveta-Cecilija.pptx`** — the slides to present (17 slides, 16:9).
  Speaker notes are embedded in each slide's notes pane.
- **`Digitalna-obnova-HGD-Sveta-Cecilija-INTERNI-VODIC.pdf`** — internal companion / rehearsal
  script: each slide's thumbnail + what's on screen + the full spoken text, plus a "how to present"
  page and the agenda.

Fonts used render on macOS: **Bodoni 72 Smallcaps** (titles), **Helvetica Neue** (body),
**Menlo** (labels). Open in Keynote or PowerPoint.

## Rebuild

```bash
cd docs/presentation/build
python3 prep_images.py     # cinematic backgrounds + browser frames + crops -> ../assets
python3 build_pptx.py      # -> ../out/...pptx
# thumbnails for the PDF (needs the deck rendered to PDF first):
soffice --headless --convert-to pdf --outdir ../out/preview ../out/Digitalna-obnova-HGD-Sveta-Cecilija.pptx
pdftoppm -png -r 96 ../out/preview/Digitalna-obnova-HGD-Sveta-Cecilija.pdf ../assets/thumbs/slide
python3 build_pdf.py       # writes ../out/internal.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-pdf-header-footer \
  --print-to-pdf=../out/Digitalna-obnova-HGD-Sveta-Cecilija-INTERNI-VODIC.pdf "file://$PWD/../out/internal.html"
```

Requires: `python-pptx`, `Pillow`, `reportlab` (pip); LibreOffice (`soffice`), `pdftoppm` (poppler),
Google Chrome.

## Editing copy

All slide text and the spoken talking points live in **`build/content.py`** (one dict per slide).
Edit there, then rerun `build_pptx.py` and the PDF steps.

## Source screenshots (`shots/`)

Captured from the live new site (moreska.eu, Croatian locale), the old site (korcula-moreska.com),
the admin dashboard and a QR ticket. Backgrounds are from the moreška photo library in `/public`.
