// PROTOTYPE — font option exploration (designer brief, Tereza, 2026-06).
// Throwaway: lets the team compare two type systems on the real homepage at
// /prototype/option1 and /prototype/option2. Delete once a winner is picked
// and folded into src/app/(frontend)/layout.tsx + globals.css.
//
// The whole design is driven by three CSS variables, so each option just
// remaps them via next/font/local:
//   --font-bodoni        → titles / headlines
//   --font-inter         → body text
//   --font-ibm-plex-mono → small accents / tags (was IBM Plex Mono)
//
// NOTE: next/font/local statically parses these calls — `path` MUST be a
// plain string literal (no template strings / variables), hence the repetition.
import localFont from 'next/font/local';

/* ───────────── OPTION 1 — Primary ─────────────
   Labrada SemiBold (titles) · Labrada Regular (body) · Neue Haas Grotesk (accents) */

export const o1Title = localFont({
  src: [
    { path: '../../../../assets/fonts/brand/Labrada-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../../../../assets/fonts/brand/Labrada-Medium.ttf', weight: '500', style: 'normal' },
    { path: '../../../../assets/fonts/brand/Labrada-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: '../../../../assets/fonts/brand/Labrada-Bold.ttf', weight: '700', style: 'normal' },
    { path: '../../../../assets/fonts/brand/Labrada-Italic.ttf', weight: '400', style: 'italic' },
    { path: '../../../../assets/fonts/brand/Labrada-SemiBoldItalic.ttf', weight: '600', style: 'italic' },
  ],
  variable: '--font-bodoni',
  display: 'swap',
});

export const o1Body = localFont({
  src: [
    { path: '../../../../assets/fonts/brand/Labrada-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../../../../assets/fonts/brand/Labrada-Medium.ttf', weight: '500', style: 'normal' },
    { path: '../../../../assets/fonts/brand/Labrada-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: '../../../../assets/fonts/brand/Labrada-Bold.ttf', weight: '700', style: 'normal' },
    { path: '../../../../assets/fonts/brand/Labrada-Italic.ttf', weight: '400', style: 'italic' },
  ],
  variable: '--font-inter',
  display: 'swap',
});

export const o1Accent = localFont({
  src: [
    { path: '../../../../assets/fonts/brand/NeueHaasDisplayRoman.ttf', weight: '400', style: 'normal' },
    { path: '../../../../assets/fonts/brand/NeueHaasDisplayMediu.ttf', weight: '500', style: 'normal' },
    { path: '../../../../assets/fonts/brand/NeueHaasDisplayBold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

/* ───────────── OPTION 2 — Secondary ─────────────
   Holise (titles) · Neue Haas Grotesk (body) · Neue Haas Grotesk Mono (accents) */

export const o2Title = localFont({
  src: [{ path: '../../../../assets/fonts/brand/Holise.otf', weight: '400', style: 'normal' }],
  variable: '--font-bodoni',
  display: 'swap',
});

export const o2Body = localFont({
  src: [
    { path: '../../../../assets/fonts/brand/NeueHaasDisplayRoman.ttf', weight: '400', style: 'normal' },
    { path: '../../../../assets/fonts/brand/NeueHaasDisplayMediu.ttf', weight: '500', style: 'normal' },
    { path: '../../../../assets/fonts/brand/NeueHaasDisplayBold.ttf', weight: '700', style: 'normal' },
    { path: '../../../../assets/fonts/brand/NeueHaasDisplayRomanItalic.ttf', weight: '400', style: 'italic' },
  ],
  variable: '--font-inter',
  display: 'swap',
});

export const o2Accent = localFont({
  src: [
    { path: '../../../../assets/fonts/brand/NeueHaasGroteskTextMono-55Roman_trial.otf', weight: '400', style: 'normal' },
    { path: '../../../../assets/fonts/brand/NeueHaasGroteskTextMono-65Medium_trial.otf', weight: '500', style: 'normal' },
    { path: '../../../../assets/fonts/brand/NeueHaasGroteskTextMono-75Bold_trial.otf', weight: '700', style: 'normal' },
  ],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

export type PrototypeOption = 'option1' | 'option2';

export const PROTOTYPE_FONTS: Record<
  PrototypeOption,
  { label: string; titles: string; body: string; accents: string; classes: string[] }
> = {
  option1: {
    label: 'Primary',
    titles: 'Labrada SemiBold',
    body: 'Labrada Regular',
    accents: 'Neue Haas Grotesk',
    classes: [o1Title.variable, o1Body.variable, o1Accent.variable],
  },
  option2: {
    label: 'Secondary',
    titles: 'Holise',
    body: 'Neue Haas Grotesk',
    accents: 'Neue Haas Grotesk Mono',
    classes: [o2Title.variable, o2Body.variable, o2Accent.variable],
  },
};
