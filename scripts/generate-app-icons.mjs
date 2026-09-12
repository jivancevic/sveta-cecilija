// Generates Cecilija's app icons from the society logo (#489).
//
// One source of truth: `assets/images/cecilija-logo.png`, the same crest the
// ticket PDFs and the posters use. The icons are BUILT rather than drawn by
// hand so a later logo change is one command, not a hunt through `public/`.
//
// The recipe, and why:
//   - the logo is trimmed first: the source is a portrait PNG with a large
//     transparent skirt, and centring it untrimmed would park the crest in the
//     top half of the icon;
//   - the ground is the app's own `--bg` (#0a0a0a), the same colour as the
//     manifest's `background_color`, so the splash screen and the icon are one
//     surface rather than two blacks;
//   - the gold hairline (#b8881a, the manifest's `theme_color`) is what keeps
//     the icon from reading as a hole on a dark home screen. It is INSET, and
//     it is dropped from the maskable icon, which a launcher crops to a circle;
//   - the maskable icon carries a smaller crest: Android's safe zone is the
//     central 80% circle, so a crest wider than ~60% of the square can lose its
//     wreath to a round or squircle mask.
//
// Requires ImageMagick 7 (`brew install imagemagick`), the same local tool
// `docs/agents/assets.md` already assumes for `cwebp`.
//
// Run: `node scripts/generate-app-icons.mjs`
// Writes: public/cecilija-icon-192.png, -512.png, -maskable-512.png,
//         public/apple-touch-icon.png, src/app/app/apple-icon.png

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = path.join(root, 'assets/images/cecilija-logo.png')

const GROUND = '#0a0a0a'
const GOLD = '#b8881a'

/**
 * The five files, where each goes, and how much of its square the crest fills.
 *
 * `src/app/app/apple-icon.png` is the one that is not in `public/`, and it is
 * the one an iPhone actually installs: iOS reads the `apple-touch-icon` link
 * rather than the manifest's icons, and Next emits that link from the NEAREST
 * segment's `apple-icon.png`. Without a copy under `src/app/app/`, the root
 * `src/app/apple-icon.png` (the public site's) would end up on the dancer's
 * home screen and the rebrand would stop one step short of the only icon the
 * roster ever sees.
 */
const ICONS = [
  { file: 'public/cecilija-icon-192.png', size: 192, crest: 0.76, frame: true },
  { file: 'public/cecilija-icon-512.png', size: 512, crest: 0.76, frame: true },
  { file: 'public/cecilija-icon-maskable-512.png', size: 512, crest: 0.58, frame: false },
  { file: 'public/apple-touch-icon.png', size: 180, crest: 0.76, frame: true },
  { file: 'src/app/app/apple-icon.png', size: 180, crest: 0.76, frame: true },
]

function magick(args) {
  execFileSync('magick', args, { stdio: ['ignore', 'ignore', 'inherit'] })
}

function render({ file, size, crest, frame }) {
  const out = path.join(root, file)
  const crestPx = Math.round(size * crest)

  const args = [
    SOURCE,
    '-trim',
    '+repage',
    // `>` would refuse to grow a small source; the crest is always fitted.
    '-resize',
    `${crestPx}x${crestPx}`,
    '-background',
    GROUND,
    '-gravity',
    'center',
    '-extent',
    `${size}x${size}`,
  ]

  if (frame) {
    // A hairline, not a border: 1px at 192, scaled up with the icon so the two
    // sizes are the same drawing rather than two different weights.
    const inset = Math.max(2, Math.round(size * 0.055))
    const stroke = Math.max(1, Math.round(size * 0.0075))
    const radius = Math.round(size * 0.12)
    const a = inset
    const b = size - inset - 1
    args.push(
      '-fill',
      'none',
      '-stroke',
      GOLD,
      '-strokewidth',
      String(stroke),
      '-draw',
      `roundrectangle ${a},${a} ${b},${b} ${radius},${radius}`,
    )
  }

  args.push('-strip', 'PNG32:' + out)
  magick(args)
  const bytes = fs.statSync(out).size
  console.log(`${file}  ${size}×${size}  ${(bytes / 1024).toFixed(1)} kB`)
}

if (!fs.existsSync(SOURCE)) {
  console.error(`Missing ${SOURCE}. The logo is untracked; see docs/agents/assets.md.`)
  process.exit(1)
}

for (const icon of ICONS) render(icon)
console.log('\nManifest paths live in public/manifest.webmanifest.')
