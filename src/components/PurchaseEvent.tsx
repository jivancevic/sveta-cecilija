'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

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
 * Safe to render even when Consent Mode v2 has `ad_storage`/`analytics_storage`
 * denied — gtag buffers the event and discards it if consent never arrives.
 */
export default function PurchaseEvent({ transactionId, value, quantity }: Props) {
  const firedRef = useRef<string | null>(null);

  useEffect(() => {
    if (firedRef.current === transactionId) return;
    firedRef.current = transactionId;

    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push([
      'event',
      'purchase',
      {
        value,
        currency: 'EUR',
        transaction_id: transactionId,
        items: [{ item_name: 'Ticket', quantity }],
      },
    ]);
  }, [transactionId, value, quantity]);

  return null;
}
