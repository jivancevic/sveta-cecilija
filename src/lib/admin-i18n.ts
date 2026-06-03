// Admin-panel localization foundation (issue #234, ADR-0015).
//
// Payload's own chrome (sidebar, tables, forms) is localized natively once
// `i18n.supportedLanguages` lists `en` + `hr` in payload.config.ts. The active
// chrome language is driven by the `payload-lng` cookie (set by the native
// account-settings language selector) → Accept-Language → fallbackLanguage.
//
// This module is the *custom* side of that story: the role-based default a new
// login is seeded with, and the small HR/EN string map the custom dashboard
// renders from. Every later dashboard slice reuses `adminT` so its copy tracks
// the same active language as the Payload chrome.

export type AdminLang = 'en' | 'hr'

// The languages we ship in the admin. Mirror this in `i18n.supportedLanguages`.
export const ADMIN_LANGS: readonly AdminLang[] = ['en', 'hr'] as const

// Role-based default language for a freshly created / first-logging-in user.
// The secretary (`admin`), shared door account (`tehnika`) and reseller
// (`partner`) work in Croatian; only the developer (`superadmin`) defaults to
// English. Unknown/missing roles get Croatian — the safe default for the
// Croatian-speaking staff this panel is built for.
export function defaultLanguageForRole(role: string | null | undefined): AdminLang {
  return role === 'superadmin' ? 'en' : 'hr'
}

// Narrow an arbitrary string (cookie value, header) to a supported admin
// language, or null if it isn't one of ours.
export function normalizeAdminLang(value: string | null | undefined): AdminLang | null {
  return value === 'en' || value === 'hr' ? value : null
}

// Resolve the active admin language for the custom dashboard. An explicit saved
// choice (the `payload-lng` cookie, written by the native selector) always wins;
// otherwise fall back to the role-based default. This mirrors how Payload's own
// chrome resolves language, so switching in account settings flips both.
export function resolveAdminLang({
  cookieLang,
  role,
}: {
  cookieLang?: string | null
  role?: string | null
}): AdminLang {
  return normalizeAdminLang(cookieLang) ?? defaultLanguageForRole(role)
}

// Cookie that drives the Payload admin chrome language. Payload derives it from
// `${cookiePrefix || 'payload'}-lng`; we don't set a custom cookiePrefix, so it
// is `payload-lng`. Kept here as the single source of truth for the name.
export const ADMIN_LANG_COOKIE = 'payload-lng'

// Decide what (if anything) to seed the language cookie to on login. A valid
// saved choice is left untouched (it always wins); only when no usable choice is
// present do we seed the role-based default. Returns null = leave the cookie be.
// The afterLogin hook does the actual cookie write; this keeps the decision pure
// and unit-testable.
export function seedAdminLangCookie({
  existing,
  role,
}: {
  existing?: string | null
  role?: string | null
}): AdminLang | null {
  if (normalizeAdminLang(existing)) return null
  return defaultLanguageForRole(role)
}

// HR/EN copy for the custom dashboard. Keep the two maps structurally identical
// (a test enforces it) — add a key to both whenever a dashboard string needs to
// localize. Keys stay stable; only the values differ per language.
export const dashboardStrings = {
  en: {
    dashboard: 'Dashboard',
    doorScan: 'Door scan',
    partnerDashboard: 'Partner dashboard',
    signedInAs: 'Signed in as',
    mtdThisMonth: 'This month',
    mtdTicketsSold: 'Tickets sold',
    mtdOwed: 'You owe HGD',
    mtdCommission: 'Your commission',
    mtdNetOfCancelled: 'net of cancelled',
    mtdLiveNote: 'Live so far this month. Same-day stornos still adjust it.',
  },
  hr: {
    dashboard: 'Nadzorna ploča',
    doorScan: 'Skeniranje na ulazu',
    partnerDashboard: 'Partnerska ploča',
    signedInAs: 'Prijavljeni kao',
    mtdThisMonth: 'Ovaj mjesec',
    mtdTicketsSold: 'Prodanih ulaznica',
    mtdOwed: 'Za platiti HGD-u',
    mtdCommission: 'Vaša provizija',
    mtdNetOfCancelled: 'bez storniranih',
    mtdLiveNote: 'Uživo za tekući mjesec. Storno isti dan još može promijeniti iznos.',
  },
} as const

export type DashboardStringKey = keyof (typeof dashboardStrings)['en']

// Look up a dashboard string for the active language, falling back to the
// English copy if the key is somehow absent in the target language.
export function adminT(
  lang: AdminLang,
  key: DashboardStringKey,
  strings: typeof dashboardStrings = dashboardStrings,
): string {
  return strings[lang][key] ?? strings.en[key]
}
