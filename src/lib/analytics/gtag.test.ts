// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { gtag } from './gtag';

describe('gtag', () => {
  beforeEach(() => {
    (window as Window & { dataLayer?: unknown[] }).dataLayer = [];
  });

  it('pushes an arguments object, NOT a literal Array (gtag.js ignores Array pushes)', () => {
    gtag('event', 'purchase', { value: 10, currency: 'EUR', transaction_id: 'pi_test' });

    const dataLayer = (window as Window & { dataLayer?: unknown[] }).dataLayer!;
    expect(dataLayer).toHaveLength(1);

    const pushed = dataLayer[0] as { [k: number]: unknown; length: number };
    // The regression guard: a raw `dataLayer.push([...])` would make this true
    // and silently drop the conversion from GA4 + Google Ads.
    expect(Array.isArray(pushed)).toBe(false);
    // ...but it must still be an array-like command tuple gtag.js can read.
    expect(pushed.length).toBe(3);
    expect(pushed[0]).toBe('event');
    expect(pushed[1]).toBe('purchase');
    expect((pushed[2] as { value: number }).value).toBe(10);
    expect((pushed[2] as { transaction_id: string }).transaction_id).toBe('pi_test');
  });

  it('initialises window.dataLayer if absent', () => {
    delete (window as Window & { dataLayer?: unknown[] }).dataLayer;
    gtag('config', 'G-TEST');
    expect((window as Window & { dataLayer?: unknown[] }).dataLayer).toHaveLength(1);
  });
});
