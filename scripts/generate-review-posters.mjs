// Generates two A4 "leave a review" posters for the Summer Cinema (Ljetno kino)
// exit: one pointing at Google, one at Tripadvisor. Each QR is a *write-a-review*
// deep link (verified 2026-06-08), so a visitor scans and lands straight on the
// review form. Platform-branded for instant recognition (Google multicolour
// wordmark + gold stars; Tripadvisor green band + bubbles), with the HGD identity
// (Cecilija logo + name + moreska.eu) anchored in the footer of both.
//
// Brand kit (gold rule, logo, IBM Plex Mono labels) mirrors render-tickets-pdf.tsx.
//
// Run: `node scripts/generate-review-posters.mjs`
// Output: ~/Desktop/google-review-poster.pdf and ~/Desktop/tripadvisor-review-poster.pdf
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import React from 'react'
import QRCode from 'qrcode'
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Svg,
  Polygon,
  Circle,
  Text,
  View,
  renderToFile,
} from '@react-pdf/renderer'

const h = React.createElement
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FONT_DIR = path.join(ROOT, 'assets', 'fonts', 'email')
const LOGO_PATH = path.join(ROOT, 'assets', 'images', 'cecilija-logo.png')
const DESKTOP = path.join(os.homedir(), 'Desktop')

// --- HGD brand tokens (mirror render-tickets-pdf.tsx) ---
const INK = '#1A140C'
const GOLD = '#B8881A'
const MUTED = '#6B5E45'
const PAPER = '#FFFFFF'

// --- Platform palettes ---
const GOOGLE = {
  blue: '#4285F4',
  red: '#EA4335',
  yellow: '#FBBC05',
  green: '#34A853',
  star: '#FBBC05',
}
const TA = {
  green: '#00AA6C', // Tripadvisor brand green
  bubble: '#FFFFFF',
}

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
  page: {
    backgroundColor: PAPER,
    color: INK,
    fontFamily: 'Inter',
    paddingTop: 56,
    paddingBottom: 44,
    paddingHorizontal: 56,
    flexDirection: 'column',
    alignItems: 'center',
  },
  // top brand zone
  brandZone: { alignItems: 'center', marginBottom: 8 },
  greenBand: {
    backgroundColor: TA.green,
    borderRadius: 14,
    paddingVertical: 22,
    paddingHorizontal: 30,
    alignItems: 'center',
    width: '100%',
  },
  wordmarkRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  gLetter: { fontFamily: 'Helvetica-Bold', fontSize: 52, letterSpacing: -1 },
  taWordmark: { fontFamily: 'Helvetica-Bold', fontSize: 40, color: '#FFFFFF', letterSpacing: -0.5 },
  glyphRow: { marginTop: 14 },
  // headline block
  headline: {
    fontFamily: 'BodoniModaSC',
    fontSize: 40,
    color: INK,
    textAlign: 'center',
    marginTop: 30,
  },
  subhead: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 17,
    color: MUTED,
    textAlign: 'center',
    marginTop: 10,
    letterSpacing: 0.3,
  },
  // QR
  qrCard: {
    marginTop: 26,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: '#E3DDD0',
    backgroundColor: '#FFFFFF',
  },
  qr: { width: 230, height: 230 },
  scanPill: {
    marginTop: 22,
    paddingVertical: 9,
    paddingHorizontal: 22,
    borderRadius: 999,
    color: '#FFFFFF',
    fontFamily: 'Helvetica-Bold',
    fontSize: 14,
    letterSpacing: 1.2,
  },
  hint: {
    marginTop: 12,
    fontFamily: 'Inter',
    fontSize: 11,
    color: MUTED,
    textAlign: 'center',
  },
  // footer (HGD identity)
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 56,
    right: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: GOLD,
    paddingTop: 12,
  },
  footLogo: { width: 22, height: 28, marginRight: 10 },
  footTextWrap: { flexDirection: 'column' },
  footOrg: { fontFamily: 'IBMPlexMono', fontSize: 8.5, letterSpacing: 2, color: INK },
  footSub: { fontFamily: 'IBMPlexMono', fontSize: 7.5, letterSpacing: 1, color: MUTED, marginTop: 2 },
})

// 5-point star polygon points.
function starPoints(cx, cy, outer, inner) {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
}

// Row of 5 filled stars (Google).
function starsRow(color, key) {
  const n = 5
  const gap = 40
  const out = 16
  const w = (n - 1) * gap + out * 2 + 8
  const cy = out + 2
  return h(
    Svg,
    { key, width: w, height: out * 2 + 6, viewBox: `0 0 ${w} ${out * 2 + 6}` },
    Array.from({ length: n }, (_, i) =>
      h(Polygon, {
        key: i,
        points: starPoints(out + 4 + i * gap, cy, out, out * 0.42),
        fill: color,
      }),
    ),
  )
}

// Row of 5 filled circles (Tripadvisor "bubbles").
function bubblesRow(color, key) {
  const n = 5
  const gap = 34
  const r = 11
  const w = (n - 1) * gap + r * 2 + 8
  return h(
    Svg,
    { key, width: w, height: r * 2 + 4, viewBox: `0 0 ${w} ${r * 2 + 4}` },
    Array.from({ length: n }, (_, i) =>
      h(Circle, { key: i, cx: r + 2 + i * gap, cy: r + 2, r, fill: color }),
    ),
  )
}

// Google multicolour wordmark, one Text per letter.
function googleWordmark(key) {
  const letters = [
    ['G', GOOGLE.blue],
    ['o', GOOGLE.red],
    ['o', GOOGLE.yellow],
    ['g', GOOGLE.blue],
    ['l', GOOGLE.green],
    ['e', GOOGLE.red],
  ]
  return h(
    View,
    { key, style: s.wordmarkRow },
    letters.map(([ch, color], i) => h(Text, { key: i, style: [s.gLetter, { color }] }, ch)),
  )
}

async function qrDataUri(url) {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 600,
    color: { dark: '#000000', light: '#FFFFFF' },
  })
}

function Footer() {
  return h(View, { style: s.footer }, [
    h(Image, { key: 'l', style: s.footLogo, src: LOGO_PATH }),
    h(View, { key: 't', style: s.footTextWrap }, [
      h(Text, { key: 'o', style: s.footOrg }, 'HGD SVETA CECILIJA'),
      h(Text, { key: 's', style: s.footSub }, 'MOREŠKA SWORD DANCE · KORČULA · moreska.eu'),
    ]),
  ])
}

function Poster({ platform, qrUri }) {
  const isGoogle = platform === 'google'
  const accent = isGoogle ? GOOGLE.blue : TA.green
  const brandZone = isGoogle
    ? h(View, { key: 'bz', style: s.brandZone }, [
        googleWordmark('wm'),
        h(View, { style: s.glyphRow, key: 'g' }, starsRow(GOOGLE.star, 'st')),
      ])
    : h(View, { key: 'bz', style: s.greenBand }, [
        h(Text, { key: 'wm', style: s.taWordmark }, 'Tripadvisor'),
        h(View, { style: s.glyphRow, key: 'g' }, bubblesRow(TA.bubble, 'bu')),
      ])

  return h(
    Page,
    { size: 'A4', style: s.page },
    [
      brandZone,
      h(Text, { key: 'hl', style: s.headline }, 'Loved the show?'),
      h(
        Text,
        { key: 'sh', style: s.subhead },
        isGoogle ? 'Leave us a review on Google' : 'Leave us a review on Tripadvisor',
      ),
      h(View, { key: 'qr', style: s.qrCard }, h(Image, { style: s.qr, src: qrUri })),
      h(Text, { key: 'pill', style: [s.scanPill, { backgroundColor: accent }] }, 'SCAN TO REVIEW'),
      h(
        Text,
        { key: 'hint', style: s.hint },
        'Point your phone camera at the code. It takes 30 seconds.',
      ),
      h(Footer, { key: 'ft' }),
    ],
  )
}

const URLS = {
  google: 'https://search.google.com/local/writereview?placeid=ChIJ1WfXALdRShMRDwNPzjZgj2I',
  tripadvisor:
    'https://www.tripadvisor.com/UserReviewEdit-g1007309-d1898279-Moreska_Sword_Dance-Korcula_Town_Korcula_Island_Dubrovnik_Neretva_County_Dalmatia.html',
}

async function main() {
  for (const platform of ['google', 'tripadvisor']) {
    const qrUri = await qrDataUri(URLS[platform])
    const doc = h(Document, null, h(Poster, { platform, qrUri }))
    const out = path.join(DESKTOP, `${platform}-review-poster.pdf`)
    await renderToFile(doc, out)
    console.log(`✓ ${out}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
