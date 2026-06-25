// Generates the PRINT-READY double-sided QR "leave a review" card handed to
// guests at the Summer Cinema (Ljetno kino) exit (GitHub #43).
//
//   Page 1 (front) → Tripadvisor write-a-review deep link
//   Page 2 (back)  → Google  write-a-review deep link
//
// Business-card trim 85 × 55 mm, 3 mm bleed all round (→ 91 × 61 mm page),
// 4 mm safe inset, corner crop marks. Bilingual EN/HR, brand layer per
// ADR-0003 ("Moreška by HGD Sveta Cecilija"). Brand kit (gold rule, Cecilija
// logo, Bodoni / IBM Plex Mono / Inter) mirrors generate-review-posters.mjs.
//
// NO review incentive copy — that violates Google + Tripadvisor TOS (#43).
//
// Run:    node scripts/generate-review-cards.mjs
// Output: docs/print/qr-review-card/qr-review-card.pdf  (2-page print master)
//         docs/print/qr-review-card/preview-front.* / preview-back.* (if a
//         PDF→PNG converter is available; otherwise generate manually — see
//         the README in that folder).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import QRCode from 'qrcode'
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToFile,
} from '@react-pdf/renderer'

const h = React.createElement
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FONT_DIR = path.join(ROOT, 'assets', 'fonts', 'email')
const LOGO_PATH = path.join(ROOT, 'assets', 'images', 'cecilija-logo.png')
const OUT_DIR = path.join(ROOT, 'docs', 'print', 'qr-review-card')

// ───────────────────────────────────────────────────────────────────────────
// REVIEW URLS — confirm BEFORE the final print run (#43 acceptance criterion:
// "Both QRs tested before print — they resolve to the correct review forms").
//
//   tripadvisor — CONFIRMED. Listing claimed under pr@moreska.eu (#35);
//                 write-review URL decoded from the listing ClientLink and
//                 already shipped in generate-review-posters.mjs.
//   google      — PROVISIONAL. The canonical source is the GBP "Get more
//                 reviews" short link (https://g.page/r/…/review), which only
//                 exists once the profile is configured (#36, still open).
//                 Until #36 pastes that link into #43, this falls back to the
//                 place-id writereview form used by the posters. SWAP THIS for
//                 the g.page/r/…/review link before printing 500 cards.
// ───────────────────────────────────────────────────────────────────────────
const URLS = {
  tripadvisor:
    'https://www.tripadvisor.com/UserReviewEdit-g1007309-d1898279-Moreska_Sword_Dance-Korcula_Town_Korcula_Island_Dubrovnik_Neretva_County_Dalmatia.html',
  // TODO(#36): replace with https://g.page/r/…/review once GBP is verified.
  google: 'https://search.google.com/local/writereview?placeid=ChIJ1WfXALdRShMRDwNPzjZgj2I',
}

// --- HGD brand tokens (mirror generate-review-posters.mjs / globals.css) ---
const INK = '#1A140C'
const GOLD = '#B8881A'
const MUTED = '#6B5E45'
const PAPER = '#FFFFFF'
const HAIRLINE = '#E3DDD0'

// --- Platform palettes ---
const GOOGLE = { blue: '#4285F4', red: '#EA4335', yellow: '#FBBC05', green: '#34A853', star: '#FBBC05' }
const TA = { green: '#00AA6C' }

// --- Print geometry (1 mm = 2.834645669 pt) ---
const MM = 2.834645669
const TRIM_W = 85 * MM
const TRIM_H = 55 * MM
const BLEED = 3 * MM
const SAFE = 4 * MM // inset from trim that copy stays inside
const PAGE_W = TRIM_W + BLEED * 2
const PAGE_H = TRIM_H + BLEED * 2
const PAD = BLEED + SAFE // page-edge → content
const MARK_LEN = BLEED - 1 // crop-mark tick length, sits in the bleed band

Font.register({ family: 'BodoniModaSC', src: path.join(FONT_DIR, 'BodoniModaSC-Regular.ttf') })
Font.register({
  family: 'IBMPlexMono',
  fonts: [
    { src: path.join(FONT_DIR, 'IBMPlexMono-Regular.ttf') },
    { src: path.join(FONT_DIR, 'IBMPlexMono-Bold.ttf'), fontWeight: 700 },
  ],
})
Font.register({ family: 'Inter', src: path.join(FONT_DIR, 'Inter-Regular.ttf') })
Font.registerHyphenationCallback((word) => [word])

const s = StyleSheet.create({
  page: { backgroundColor: PAPER, color: INK, fontFamily: 'Inter', position: 'relative' },
  // content area inside the safe zone: ask row on top, brand strip pinned below
  safe: {
    position: 'absolute',
    top: PAD,
    left: PAD,
    right: PAD,
    bottom: PAD,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  // left column = the ask
  textCol: { flex: 1, flexDirection: 'column', justifyContent: 'center', paddingRight: 12 },
  headline: { fontFamily: 'BodoniModaSC', fontSize: 16, color: INK, lineHeight: 1.04 },
  headlineHr: { fontFamily: 'BodoniModaSC', fontSize: 9, color: MUTED, marginTop: 3, lineHeight: 1.08 },
  ask: { fontFamily: 'Inter', fontSize: 8, color: INK, marginTop: 12, lineHeight: 1.25 },
  askHr: { fontFamily: 'Inter', fontSize: 7.5, color: MUTED, marginTop: 2, lineHeight: 1.25 },
  // right column = platform wordmark + QR + scan prompt
  qrCol: { width: 100, alignItems: 'center', justifyContent: 'center' },
  wordmarkWrap: { justifyContent: 'center', marginBottom: 5 },
  qrFrame: { padding: 4.5, borderWidth: 0.8, borderColor: HAIRLINE, borderRadius: 6, backgroundColor: '#FFFFFF' },
  qr: { width: 68, height: 68 },
  scanPill: {
    marginTop: 5,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 999,
    color: '#FFFFFF',
    fontFamily: 'IBMPlexMono',
    fontWeight: 700,
    fontSize: 5.5,
    letterSpacing: 1,
  },
  // full-width brand strip
  brandRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 0.8, borderTopColor: GOLD, paddingTop: 5 },
  brandLogo: { width: 13, height: 16, marginRight: 7 },
  brandName: { fontFamily: 'IBMPlexMono', fontSize: 6.5, letterSpacing: 0.8, color: INK },
  brandUrl: { fontFamily: 'IBMPlexMono', fontSize: 6.5, letterSpacing: 0.8, color: GOLD },
})

// Platform wordmark shown above the QR: Google multicolour, Tripadvisor green.
function PlatformWordmark({ platform }) {
  if (platform !== 'google') {
    return h(Text, { style: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: TA.green, letterSpacing: -0.3 } }, 'Tripadvisor')
  }
  const letters = [
    ['G', GOOGLE.blue], ['o', GOOGLE.red], ['o', GOOGLE.yellow],
    ['g', GOOGLE.blue], ['l', GOOGLE.green], ['e', GOOGLE.red],
  ]
  return h(
    View,
    { style: { flexDirection: 'row', alignItems: 'flex-end' } },
    letters.map(([ch, color], i) =>
      h(Text, { key: i, style: { fontFamily: 'Helvetica-Bold', fontSize: 13, color, letterSpacing: -0.4 } }, ch),
    ),
  )
}

// Four corner crop marks, drawn as thin rules inside the 3 mm bleed band.
function CropMarks() {
  const t = BLEED // trim offset from page edge
  const m = MARK_LEN
  const wv = 0.4
  const mk = (style, k) => h(View, { key: k, style: { position: 'absolute', backgroundColor: '#000000', ...style } })
  return h(View, { style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } }, [
    // top-left
    mk({ left: t, top: 0, width: wv, height: m }, 'tlv'),
    mk({ left: 0, top: t, width: m, height: wv }, 'tlh'),
    // top-right
    mk({ left: PAGE_W - t - wv, top: 0, width: wv, height: m }, 'trv'),
    mk({ left: PAGE_W - m, top: t, width: m, height: wv }, 'trh'),
    // bottom-left
    mk({ left: t, top: PAGE_H - m, width: wv, height: m }, 'blv'),
    mk({ left: 0, top: PAGE_H - t - wv, width: m, height: wv }, 'blh'),
    // bottom-right
    mk({ left: PAGE_W - t - wv, top: PAGE_H - m, width: wv, height: m }, 'brv'),
    mk({ left: PAGE_W - m, top: PAGE_H - t - wv, width: m, height: wv }, 'brh'),
  ])
}

const COPY = {
  google: {
    headEn: 'Loved the show?',
    headHr: 'Uživali ste u predstavi?',
    askEn: 'Leave us a review on Google →',
    askHr: 'Ostavite recenziju na Googleu →',
    accent: GOOGLE.blue,
  },
  tripadvisor: {
    headEn: 'Loved the show?',
    headHr: 'Uživali ste u predstavi?',
    askEn: 'Leave us a review on Tripadvisor →',
    askHr: 'Ostavite recenziju na Tripadvisoru →',
    accent: TA.green,
  },
}

function Card({ platform, qrUri }) {
  const c = COPY[platform]
  return h(Page, { size: { width: PAGE_W, height: PAGE_H }, style: s.page }, [
    h(CropMarks, { key: 'marks' }),
    h(View, { key: 'safe', style: s.safe }, [
      // ask row: message on the left, platform wordmark + QR on the right
      h(View, { key: 'row', style: s.topRow }, [
        h(View, { key: 'text', style: s.textCol }, [
          h(Text, { key: 'he', style: s.headline }, c.headEn),
          h(Text, { key: 'hh', style: s.headlineHr }, c.headHr),
          h(Text, { key: 'ae', style: s.ask }, c.askEn),
          h(Text, { key: 'ah', style: s.askHr }, c.askHr),
        ]),
        h(View, { key: 'qrcol', style: s.qrCol }, [
          h(View, { key: 'wm', style: s.wordmarkWrap }, h(PlatformWordmark, { platform })),
          h(View, { key: 'frame', style: s.qrFrame }, h(Image, { style: s.qr, src: qrUri })),
          h(Text, { key: 'pill', style: [s.scanPill, { backgroundColor: c.accent }] }, 'SCAN TO REVIEW'),
        ]),
      ]),
      // full-width brand strip
      h(View, { key: 'brand', style: s.brandRow }, [
        h(Image, { key: 'l', style: s.brandLogo, src: LOGO_PATH }),
        h(Text, { key: 'bn', style: s.brandName }, 'MOREŠKA BY HGD SVETA CECILIJA'),
        h(Text, { key: 'sep', style: [s.brandName, { color: GOLD, marginHorizontal: 5 }] }, '·'),
        h(Text, { key: 'bu', style: s.brandUrl }, 'moreska.eu'),
      ]),
    ]),
  ])
}

async function qrDataUri(url) {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H', // high — survives a small print + a scuffed card
    margin: 1,
    width: 600,
    color: { dark: '#000000', light: '#FFFFFF' },
  })
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const taQr = await qrDataUri(URLS.tripadvisor)
  const gQr = await qrDataUri(URLS.google)
  const doc = h(Document, { title: 'Moreška review card', author: 'HGD Sveta Cecilija' }, [
    h(Card, { key: 'front', platform: 'tripadvisor', qrUri: taQr }),
    h(Card, { key: 'back', platform: 'google', qrUri: gQr }),
  ])
  const out = path.join(OUT_DIR, 'qr-review-card.pdf')
  await renderToFile(doc, out)
  console.log(`✓ ${out}`)
  console.log(`  front → Tripadvisor: ${URLS.tripadvisor}`)
  console.log(`  back  → Google:      ${URLS.google}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
