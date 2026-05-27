'use client';

import { useEffect } from 'react';
import type { Locale } from '@/proxy';

interface Props {
  locale: Locale;
  className?: string;
}

export default function LangSwitcher({ locale, className }: Props) {
  useEffect(() => {
    const saved = sessionStorage.getItem('moreska_scroll');
    if (saved) {
      requestAnimationFrame(() => window.scrollTo(0, parseInt(saved, 10)));
      sessionStorage.removeItem('moreska_scroll');
    }
  }, []);

  function switchTo(target: Locale) {
    if (target === locale) return;
    sessionStorage.setItem('moreska_scroll', String(window.scrollY));
    document.cookie = `moreska_locale=${target}; path=/; max-age=${365 * 24 * 3600}; samesite=lax`;
    window.location.reload();
  }

  return (
    <span className={className ?? 'nav__lang'}>
      <button
        onClick={() => switchTo('hr')}
        className={locale === 'hr' ? 'active' : undefined}
        aria-label="HR — Switch to Croatian"
      >
        HR
      </button>
      {' · '}
      <button
        onClick={() => switchTo('en')}
        className={locale === 'en' ? 'active' : undefined}
        aria-label="EN — Switch to English"
      >
        EN
      </button>
    </span>
  );
}
