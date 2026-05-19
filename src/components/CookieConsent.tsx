'use client';

import { useState, useEffect } from 'react';
import type { Dictionary } from '@/lib/i18n';

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

const STORAGE_KEY = 'moreska_cookie_consent';

interface Props {
  t: Dictionary['cookieBanner'];
  locale: string;
}

export default function CookieConsent({ t, locale }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      const timer = setTimeout(() => setVisible(true), 900);
      return () => clearTimeout(timer);
    }
    if (stored === 'accepted') injectGA();
  }, []);

  function accept() {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    injectGA();
    setVisible(false);
  }

  function decline() {
    localStorage.setItem(STORAGE_KEY, 'declined');
    setVisible(false);
  }

  function injectGA() {
    const id = process.env.NEXT_PUBLIC_GA_ID;
    if (!id || document.querySelector('script[data-ga]')) return;
    window.dataLayer = window.dataLayer ?? [];
    const script = document.createElement('script');
    script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    script.async = true;
    script.dataset.ga = '1';
    document.head.appendChild(script);
    function gtag(...args: unknown[]) { window.dataLayer!.push(args); }
    gtag('js', new Date());
    gtag('config', id);
  }

  return (
    <div className={`cookie-banner${visible ? ' cookie-banner--visible' : ''}`} role="dialog" aria-label="Cookie consent">
      <div className="cookie-banner__inner">
        <p className="cookie-banner__text">
          {t.body}{' '}
          <a href={`/${locale}/cookie-policy`} className="cookie-banner__link">{t.learnMore}</a>
        </p>
        <div className="cookie-banner__actions">
          <button className="btn btn--ghost btn--small" onClick={decline}>{t.decline}</button>
          <button className="btn btn--primary btn--small" onClick={accept}>{t.accept}</button>
        </div>
      </div>
    </div>
  );
}
