import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const locales = ['en', 'hr'] as const;
export type Locale = (typeof locales)[number];
const defaultLocale: Locale = 'en';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (!pathnameHasLocale) {
    const locale =
      (request.headers
        .get('accept-language')
        ?.split(',')[0]
        ?.split('-')[0]
        ?.toLowerCase() as Locale | undefined) ?? defaultLocale;

    const resolved = locales.includes(locale) ? locale : defaultLocale;
    return NextResponse.redirect(new URL(`/${resolved}${pathname}`, request.url));
  }
}

export const config = {
  matcher: ['/((?!_next|.*\\..*|favicon\\.ico).*)'],
};
