declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/**
 * Single source of truth for pushing gtag commands onto the GA/Ads dataLayer.
 *
 * CRITICAL: this MUST push the `arguments` object, never a literal Array.
 * gtag.js only processes queued commands that are `arguments` objects — a
 * plain `dataLayer.push(['event', 'purchase', {...}])` is silently treated as
 * inert data and the event never reaches GA4 or Google Ads. This has regressed
 * before (a raw Array push in PurchaseEvent dropped every purchase conversion);
 * keeping a single helper + its test is the guard against it happening again.
 *
 * https://developers.google.com/tag-platform/security/guidance/consent-mode-v2
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function gtag(...args: any[]): void {
  void args;
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer ?? [];
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
}
