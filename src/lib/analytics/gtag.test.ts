// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gtag, isGaConfigured, runWhenGaConfigured } from './gtag';

type W = Window & {
  dataLayer?: unknown[];
  google_tag_manager?: Record<string, unknown>;
};

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

describe('runWhenGaConfigured', () => {
  const GA_ID = 'G-TEST';

  beforeEach(() => {
    vi.useFakeTimers();
    delete (window as W).google_tag_manager;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does NOT fire while GA is unconfigured (the effect-order race that dropped purchases)', () => {
    const cb = vi.fn();
    runWhenGaConfigured(cb, { gaId: GA_ID });

    // GA config hasn't run yet — firing now would queue the event ahead of
    // gtag('config', …) and gtag would silently drop it.
    vi.advanceTimersByTime(2000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('fires exactly once as soon as GA becomes configured', () => {
    const cb = vi.fn();
    runWhenGaConfigured(cb, { gaId: GA_ID });

    expect(cb).not.toHaveBeenCalled();
    // gtag('config', GA_ID) runs -> google_tag_manager[GA_ID] appears.
    (window as W).google_tag_manager = { [GA_ID]: {} };
    vi.advanceTimersByTime(200);
    expect(cb).toHaveBeenCalledTimes(1);

    // No double-fire on subsequent polls.
    vi.advanceTimersByTime(2000);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('fires synchronously when GA is already configured', () => {
    (window as W).google_tag_manager = { [GA_ID]: {} };
    const cb = vi.fn();
    runWhenGaConfigured(cb, { gaId: GA_ID });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('gives up after the timeout and never fires (e.g. consent declined, GA never injected)', () => {
    const cb = vi.fn();
    runWhenGaConfigured(cb, { gaId: GA_ID, timeoutMs: 8000 });

    vi.advanceTimersByTime(8000);
    // GA becomes configured only AFTER we gave up — must not fire late.
    (window as W).google_tag_manager = { [GA_ID]: {} };
    vi.advanceTimersByTime(2000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('cleanup cancels a pending poll', () => {
    const cb = vi.fn();
    const cleanup = runWhenGaConfigured(cb, { gaId: GA_ID });

    cleanup();
    (window as W).google_tag_manager = { [GA_ID]: {} };
    vi.advanceTimersByTime(2000);
    expect(cb).not.toHaveBeenCalled();
  });

  it('isGaConfigured reports ready immediately when no GA id is set', () => {
    expect(isGaConfigured(undefined)).toBe(true);
    expect(isGaConfigured(GA_ID)).toBe(false);
    (window as W).google_tag_manager = { [GA_ID]: {} };
    expect(isGaConfigured(GA_ID)).toBe(true);
  });
});
