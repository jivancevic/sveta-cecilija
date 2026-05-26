'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import type { Dictionary } from '@/lib/i18n';

declare global {
  interface Window {
    dataLayer?: unknown[];
    fbq?: ((...args: unknown[]) => void) & {
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[];
      push?: unknown;
      loaded?: boolean;
      version?: string;
    };
    _fbq?: unknown;
  }
}

const STORAGE_KEY = 'moreska_cookie_consent';

// Must push the `arguments` object (not an Array) — gtag.js treats Array
// pushes as data and silently ignores them as commands. See:
// https://developers.google.com/tag-platform/security/guidance/consent-mode-v2
// eslint-disable-next-line prefer-rest-params, @typescript-eslint/no-explicit-any
function gtag(...args: any[]) {
  void args;
  window.dataLayer = window.dataLayer ?? [];
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
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

function updateConsentGranted() {
  gtag('consent', 'update', {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted',
  });
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

function injectMetaPixel() {
  const id = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  if (!id || document.querySelector('script[data-fbq]')) return;
  // Standard Meta Pixel base code, adapted to TS. We attach the stub onto
  // window.fbq so subsequent calls queue until fbevents.js loads.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const w = window as any;
  if (!w.fbq) {
    const n: any = function (...args: unknown[]) {
      n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
    };
    w.fbq = n;
    if (!w._fbq) w._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
  }
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  script.dataset.fbq = '1';
  document.head.appendChild(script);
  w.fbq('init', id);
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

interface Props {
  t: Dictionary['cookieBanner'];
}

export default function CookieConsent({ t }: Props) {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // Fire denied-by-default consent state immediately on mount, before any tag injection.
    initConsentDefaults();

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      const timer = setTimeout(() => setVisible(true), 900);
      return () => clearTimeout(timer);
    }
    if (stored === 'accepted') {
      updateConsentGranted();
      injectGA();
      injectMetaPixel();
    }
  }, []);

  // Fire Meta Pixel PageView on initial load + route changes (only once fbq is loaded).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(STORAGE_KEY) !== 'accepted') return;
    if (typeof window.fbq !== 'function') return;
    window.fbq('track', 'PageView');
  }, [pathname]);

  function accept() {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    updateConsentGranted();
    injectGA();
    injectMetaPixel();
    // Manually fire the first PageView once the pixel is in place — the
    // pathname-change effect above only runs on route transitions.
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      window.fbq('track', 'PageView');
    }
    setVisible(false);
  }

  function decline() {
    localStorage.setItem(STORAGE_KEY, 'declined');
    setVisible(false);
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
