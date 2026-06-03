# ADR-0015: Admin i18n foundation (Payload en+hr, per-role default, dashboard string map)

**Status:** Accepted
**Date:** 2026-06-04

## Context

The admin panel is used by Croatian-speaking staff: the secretary (`admin`), the
shared door account (`tehnika`), and reseller logins (`partner`). The only
English-first user is the developer (`superadmin`). Until now the whole panel,
including the custom `/admin` dashboard, was English-only.

Payload v3 has built-in admin i18n: list the languages in
`i18n.supportedLanguages` and the entire chrome (sidebar, collection tables,
edit forms, account settings) localizes, and a native language selector appears
in account settings. Croatian (`hr`) ships in `@payloadcms/translations`.

Two things were undecided and are settled here:

1. **How a user's language is chosen and defaulted.** Payload resolves the active
   chrome language from the `payload-lng` cookie → `Accept-Language` header →
   `fallbackLanguage` (see `getRequestLanguage` in Payload). The native account
   selector writes the `payload-lng` cookie. There is **no per-user language
   field** in Payload by default — persistence is the cookie, which is
   per-browser.

2. **How the custom dashboard (which renders its own copy, not Payload strings)
   localizes**, and the pattern every later dashboard slice should reuse.

## Decision

**Restrict `supportedLanguages` to `{ en, hr }`** with `fallbackLanguage: 'en'`.
This localizes the chrome, shows exactly these two in the native selector, and
keeps English as the baseline for the developer.

**Seed the chrome language per role on login, cookie is the source of truth.**
The cookie (`payload-lng`) is the persistence layer (matching how Payload's own
selector works), so "a user's saved choice always wins" falls out for free. A
fresh login has no cookie, so a `Users` `afterLogin` hook seeds it once to the
role-based default — Croatian for `admin`/`tehnika`/`partner`, English for
`superadmin` — and never overwrites an existing valid value. The decision logic
is a pure function (`seedAdminLangCookie`) so it is unit-tested; the hook only
does the cookie write (and no-ops outside a writable request scope, e.g. a seed
script calling `payload.login`).

**The custom dashboard reads the active language and renders from a small HR/EN
string map.** `resolveAdminLang({ cookieLang, role })` mirrors the chrome's
resolution (saved cookie wins, else role default), and `adminT(lang, key)` looks
up copy from `dashboardStrings` (en/hr maps kept structurally identical). This is
the pattern later dashboard slices reuse: read the active language once at the
top of the server component, then `adminT` every visible string.

All of this lives in `src/lib/admin-i18n.ts`; wiring is in `src/payload.config.ts`
(the `i18n` block), `src/collections/Users.ts` (the `afterLogin` hook), and
`src/components/payload/AdminDashboardView.tsx` (the dashboard copy).

## Consequences

- The chrome and the custom dashboard flip together when the user switches
  language in account settings, because both read the same `payload-lng` cookie.
- Persistence is per-browser, not truly per-user. On a **shared browser** where
  e.g. a `superadmin` logs in after an `admin`, the first-seeded `hr` cookie is
  already present so the superadmin sees Croatian until they switch. This is
  inherent to cookie-based persistence (the mechanism the native selector uses)
  and accepted; the developer can switch in one click. Adding a real per-user
  language field was rejected because the native selector would not write to it,
  so it would silently drift from the cookie that actually drives the chrome.
- New dashboard copy must be added to **both** `en` and `hr` maps (a test
  enforces structural parity). Untranslated keys fall back to English at runtime.
