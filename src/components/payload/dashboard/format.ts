// Shared formatting + brand-accent helpers for the secretary dashboard (#238).
//
// Visual language (ADR-0015): Payload-native surfaces (dark-mode-safe theme
// tokens) with restrained gold + Bodoni accents on the hero/figure NUMBERS only,
// not a full reskin. These helpers keep that contract in one place so every
// dashboard component renders figures the same way.

import type React from 'react'
import type { AdminLang } from '@/lib/admin-i18n'
import { VENUE_LABEL, type Venue } from '@/lib/venues'

// Bodoni Moda SC is loaded for the public site via next/font (--font-bodoni).
// Inside Payload chrome that variable isn't guaranteed, so fall back to a serif
// stack — the accent still reads as "the figures are special" in either case.
export const ACCENT_FONT = 'var(--font-bodoni), "Bodoni Moda SC", "Bodoni Moda", Georgia, serif'

// Brand gold, dark-mode safe (it's a fixed brand colour, legible on both the
// light and dark Payload elevations the figures sit on).
export const GOLD = '#b08d3e'

// Channel-mix palette (#242): anchored on the brand gold (online — the primary
// channel), with two muted earth tones drawn from the stone/heritage palette for
// the supporting channels. All three are fixed brand colours chosen to stay
// legible on both the light and dark Payload elevations (no theme token needed),
// and distinct enough to read apart without relying on the legend alone.
export const CHANNEL_COLORS = {
  online: GOLD, // brand gold
  inPerson: '#4a6670', // slate teal
  partner: '#8c5a3c', // terracotta bronze
} as const

/** Style for a hero/figure number: gold + Bodoni accent. Numbers only. */
export function accentNumberStyle(fontSize: number | string): React.CSSProperties {
  return {
    fontFamily: ACCENT_FONT,
    color: GOLD,
    fontSize,
    fontWeight: 600,
    lineHeight: 1.05,
    letterSpacing: 0.2,
  }
}

/** EUR from integer cents, e.g. 12345 -> "€123.45". */
export function eur(cents: number): string {
  return `€${(cents / 100).toLocaleString('en-IE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Buyer/secretary-facing venue name for the active admin language. */
export function venueLabel(venue: Venue, lang: AdminLang): string {
  return VENUE_LABEL[lang][venue] ?? venue
}

/** Parse a date-only YYYY-MM-DD string to a UTC Date, or null if malformed. */
function parseShowDate(iso: string): Date | null {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d))
}

/** "Sun, 12 Jul 2026" (en) / "ned, 12. srp 2026." (hr) from a YYYY-MM-DD string. */
export function formatShowDate(iso: string, lang: AdminLang): string {
  const dt = parseShowDate(iso)
  if (!dt) return iso
  return dt.toLocaleDateString(lang === 'hr' ? 'hr-HR' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Compact axis label "12 Jul" (en) / "12. srp" (hr) from a YYYY-MM-DD string. */
export function shortShowDate(iso: string, lang: AdminLang): string {
  const dt = parseShowDate(iso)
  if (!dt) return iso
  return dt.toLocaleDateString(lang === 'hr' ? 'hr-HR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

/** Shared uppercase section label for dashboard chart/band headers. */
export const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--theme-elevation-500)',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  marginBottom: 12,
}
