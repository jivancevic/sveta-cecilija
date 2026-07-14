'use client';

import { useEffect, useRef } from 'react';
import { gtag, runWhenGaConfigured } from '@/lib/analytics/gtag';

interface Props {
  transactionId: string;
  value: number; // EUR
  quantity: number;
}

/**
 * Fires a single GA4 `purchase` event for the given transaction.
 *
 * Covers both GA4 reporting and Google Ads conversion attribution
 * (the GA4 -> Ads link maps this event to the `moreska.eu (web) purchase`
 * conversion — no separate AW-* config call needed).
 *
 * Dedups per `transactionId` per page lifetime so a buyer reload does not
 * double-count. `transaction_id` also lets GA4 + Ads dedup server-side.
 *
 * Waits for GA to be configured before firing — see runWhenGaConfigured(). This
 * component's effect runs before CookieConsent (in the layout) injects/configs
 * GA, so firing immediately would queue the event ahead of `gtag('config', …)`
 * and gtag would silently drop it (observed live: it never reached GA4/Ads). If
 * consent was declined GA is never configured and we correctly never fire.
 */
export default function PurchaseEvent({ transactionId, value, quantity }: Props) {
  const firedRef = useRef<string | null>(null);

  useEffect(() => {
    if (firedRef.current === transactionId) return;

    return runWhenGaConfigured(() => {
      if (firedRef.current === transactionId) return;
      firedRef.current = transactionId;
      gtag('event', 'purchase', {
        value,
        currency: 'EUR',
        transaction_id: transactionId,
        items: [{ item_name: 'Ticket', quantity }],
      });
    });
  }, [transactionId, value, quantity]);

  return null;
}
