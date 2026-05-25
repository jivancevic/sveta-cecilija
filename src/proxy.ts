import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const locales = ['en', 'hr'] as const;
export type Locale = (typeof locales)[number];
const defaultLocale: Locale = 'en';

// SEO: cookieless requests (Googlebot) must resolve to 'en'. Indexing is EN-only
// by decision — see CONTEXT.md "URL structure". Any Accept-Language that doesn't
// resolve to 'hr' (including missing/empty) falls through to defaultLocale = 'en'.
export function resolveLocale({
  cookie,
  acceptLanguage,
}: {
  cookie: string | undefined;
  acceptLanguage: string | null | undefined;
}): Locale {
  if (locales.includes(cookie as Locale)) return cookie as Locale;
  const lang = acceptLanguage?.split(',')[0]?.split('-')[0]?.toLowerCase();
  return locales.includes(lang as Locale) ? (lang as Locale) : defaultLocale;
}

export function proxy(request: NextRequest) {
  const cookieLocale = request.cookies.get('moreska_locale')?.value;
  const locale: Locale = resolveLocale({
    cookie: cookieLocale,
    acceptLanguage: request.headers.get('accept-language'),
  });

  // Forward locale to server components via request header
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-locale', locale);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Set cookie on first visit so subsequent requests skip detection
  if (!locales.includes(cookieLocale as Locale)) {
    response.cookies.set('moreska_locale', locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next|.*\\..*|favicon\\.ico|admin|api).*)'],
};
