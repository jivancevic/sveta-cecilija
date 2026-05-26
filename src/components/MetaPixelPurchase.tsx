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
 * (in which case `window.fbq` was never installed by CookieConsent).
 */
export default function MetaPixelPurchase({ value, currency = 'EUR', orderId }: Props) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof window.fbq !== 'function') return;
    window.fbq('track', 'Purchase', {
      value,
      currency,
      ...(orderId !== undefined ? { order_id: String(orderId) } : {}),
    });
  }, [value, currency, orderId]);

  return null;
}
