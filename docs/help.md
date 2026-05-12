Four fonts, two
  sources:

  Google Fonts
  (loaded via
  next/font/google):
  
  Font: Newsreader
  Variable:
  --font-newsreader
  Used for: Section
    headlines, hero
    name, nav
    wordmark, pull
    quotes,
  editorial
     text
  ──────────────────
  ─
  Font: IBM Plex 
  Mono
  Variable: --font-i
  bm-plex-mono
  Used for: Date
  tags,
    pills,
    performance
    codes, section
    numbers
  ──────────────────
  ─
  Font: Inter
  Variable:
  --font-inter
  Used for: Body
  text
    baseline
    (homepage +
  inner
     pages)

  Self-hosted (via
  @font-face, public
  /Vinque-Rg.otf):

  Font: Vinque
  Variable:
  --font-vinque
  Used for: Buttons,
  ├───────────────┼──────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ IBM Plex Mono │ --font-ibm-plex-mono │ Date tags, pills, performance codes, section numbers                    │
  ├───────────────┼──────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ Inter         │ --font-inter         │ Body text baseline (homepage + inner pages)                             │
  └───────────────┴──────────────────────┴─────────────────────────────────────────────────────────────────────────┘

  Self-hosted (via @font-face, public/Vinque-Rg.otf):

  ┌────────┬───────────────┬──────────────────────────────────────────────────────────────────────────────┐
  │  Font  │   Variable    │                                   Used for                                   │
  ├────────┼───────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ Vinque │ --font-vinque │ Buttons, Services section headings/titles, Contact heading, the .serif class │
  └────────┴───────────────┴──────────────────────────────────────────────────────────────────────────────┘

  Vinque is the primary brand serif — it falls back to Newsreader if the OTF fails to load.