// Brand font system (Option 1, picked by the team 2026-06) — bound to the three
// CSS variables the whole design keys off:
//   --font-bodoni        → titles / headlines  (Labrada)
//   --font-inter         → body text           (Labrada)
//   --font-ibm-plex-mono → small accents / tags (Neue Haas Grotesk Display)
//
// NOTE: next/font/local statically parses these calls — `path` MUST be a plain
// string literal (no template strings / variables). The .dockerignore re-includes
// assets/fonts/brand so these resolve during the Docker `npm run build`.
import localFont from 'next/font/local';

/* Titles / headlines — Labrada (replaces Bodoni Moda SC) */
export const bodoni = localFont({
  src: [
    { path: '../../../assets/fonts/brand/Labrada-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../../../assets/fonts/brand/Labrada-Medium.ttf', weight: '500', style: 'normal' },
    { path: '../../../assets/fonts/brand/Labrada-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: '../../../assets/fonts/brand/Labrada-Bold.ttf', weight: '700', style: 'normal' },
    { path: '../../../assets/fonts/brand/Labrada-Italic.ttf', weight: '400', style: 'italic' },
    { path: '../../../assets/fonts/brand/Labrada-SemiBoldItalic.ttf', weight: '600', style: 'italic' },
  ],
  variable: '--font-bodoni',
  display: 'swap',
});

/* Body text — Labrada (replaces Inter) */
export const inter = localFont({
  src: [
    { path: '../../../assets/fonts/brand/Labrada-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../../../assets/fonts/brand/Labrada-Medium.ttf', weight: '500', style: 'normal' },
    { path: '../../../assets/fonts/brand/Labrada-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: '../../../assets/fonts/brand/Labrada-Bold.ttf', weight: '700', style: 'normal' },
    { path: '../../../assets/fonts/brand/Labrada-Italic.ttf', weight: '400', style: 'italic' },
  ],
  variable: '--font-inter',
  display: 'swap',
});

/* Small accents / tags — Neue Haas Grotesk Display (replaces IBM Plex Mono) */
export const ibmPlexMono = localFont({
  src: [
    { path: '../../../assets/fonts/brand/NeueHaasDisplayRoman.ttf', weight: '400', style: 'normal' },
    { path: '../../../assets/fonts/brand/NeueHaasDisplayMediu.ttf', weight: '500', style: 'normal' },
    { path: '../../../assets/fonts/brand/NeueHaasDisplayBold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});
