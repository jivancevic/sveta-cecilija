'use client';

import { useEffect } from 'react';

interface Props {
  value: number;
  currency?: string;
  orderId?: string | number;
}

/**
 * Fires the Meta Pixel `Purchase` standard event once the pixel is loaded.
 * Safe to render unconditionally — it no-ops if the visitor declined cookies
 * (in which case `window.fbq` is never installed by CookieConsent).
 *
 * `window.fbq` is installed by CookieConsent, which lives in the layout — its
 * mount effect can run AFTER this page-level component's effect, so fbq may not
 * exist on the first attempt. A one-shot guard would then drop the Purchase
 * permanently (observed: only PageView fired, never Purchase). Poll briefly
 * until fbq is ready instead.
 */
export default function MetaPixelPurchase({ value, currency = 'EUR', orderId }: Props) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let done = false;
    const fire = () => {
      if (done || typeof window.fbq !== 'function') return false;
      window.fbq('track', 'Purchase', {
        value,
        currency,
        ...(orderId !== undefined ? { order_id: String(orderId) } : {}),
      });
      done = true;
      return true;
    };

    if (fire()) return;

    const interval = setInterval(() => {
      if (fire()) clearInterval(interval);
    }, 200);
    const timeout = setTimeout(() => clearInterval(interval), 8000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [value, currency, orderId]);

  return null;
}
