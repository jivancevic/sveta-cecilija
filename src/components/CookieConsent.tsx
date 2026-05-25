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
}

function gtag(...args: unknown[]) {
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(args);
}

// Consent Mode v2 default state. Must fire BEFORE any GA/Ads tag loads.
// Idempotent — safe to call multiple times; gtag's consent system dedups.
function initConsentDefaults() {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer ?? [];
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500,
  });
}

export default function CookieConsent({ t }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Fire denied-by-default consent state immediately on mount, before any tag injection.
    initConsentDefaults();

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      const timer = setTimeout(() => setVisible(true), 900);
      return () => clearTimeout(timer);
    }
    if (stored === 'accepted') {
      injectGA();
      updateConsentGranted();
    }
  }, []);

  function updateConsentGranted() {
    gtag('consent', 'update', {
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted',
    });
  }

  function accept() {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    injectGA();
    updateConsentGranted();
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
    gtag('js', new Date());
    gtag('config', id);
  }

  return (
    <div className={`cookie-banner${visible ? ' cookie-banner--visible' : ''}`} role="dialog" aria-label="Cookie consent">
      <div className="cookie-banner__inner">
        <p className="cookie-banner__text">
          {t.body}{' '}
          <a href="/cookie-policy" className="cookie-banner__link">{t.learnMore}</a>
        </p>
        <div className="cookie-banner__actions">
          <button className="btn btn--ghost btn--small" onClick={decline}>{t.decline}</button>
          <button className="btn btn--primary btn--small" onClick={accept}>{t.accept}</button>
        </div>
      </div>
    </div>
  );
}
