# ADR-0001: Remove locale slugs from URLs

**Status:** Accepted  
**Date:** 2026-05-20

## Context

The site uses Next.js `[locale]` folder routing, producing URLs like `/en/tickets` and `/hr/tickets`. The goal is clean URLs (`/tickets`) with automatic language detection.

## Decision

Remove the `[locale]` dynamic segment entirely. Language is resolved from `accept-language` headers on first visit and stored in a `moreska_locale` cookie. All pages move from `src/app/[locale]/` to `src/app/`. The middleware (proxy) reads the cookie and falls back to header detection.

## Alternatives considered

**Keep locale slugs, redirect root** — `/tickets` redirects to `/hr/tickets` or `/en/tickets`. Preserves bilingual SEO indexing. Rejected because the site targets tourists (English organic search) and the added complexity wasn't worth it for Croatian-language SEO.

## Consequences

- Croatian-language URLs are no longer separately indexable by search engines. Acceptable given the audience (tourists searching in English).
- Language switching reloads the same URL (scroll position restored via `sessionStorage`), which is a better UX than redirecting to a different path.
- All internal `href` links must be updated to drop the `/${locale}` prefix.
