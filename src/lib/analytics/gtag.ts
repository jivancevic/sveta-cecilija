declare global {
  interface Window {
    dataLayer?: unknown[];
    google_tag_manager?: Record<string, unknown>;
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

/**
 * True once GA has been configured, i.e. `gtag('config', gaId)` has run —
 * `window.google_tag_manager[gaId]` only appears at that point.
 *
 * With no `gaId` we can't detect readiness, so we report ready (fire immediately)
 * rather than block forever.
 */
export function isGaConfigured(gaId: string | undefined): boolean {
  if (typeof window === 'undefined') return false;
  if (!gaId) return true;
  return !!window.google_tag_manager?.[gaId];
}

/**
 * Invokes `cb` as soon as GA is configured (see {@link isGaConfigured}), polling
 * until then and giving up after `timeoutMs`. Returns a cleanup that cancels any
 * pending poll.
 *
 * WHY THIS EXISTS: GA is injected + configured by CookieConsent in the layout,
 * but the components that fire conversion events (e.g. PurchaseEvent) live in the
 * page — React runs their mount effects BEFORE the layout's. Pushing a `purchase`
 * event at that moment queues it onto `dataLayer` ahead of `gtag('config', …)`,
 * and gtag processes it with no configured destination and silently drops it.
 * Waiting for config guarantees the event is queued after it.
 */
export function runWhenGaConfigured(
  cb: () => void,
  {
    gaId = process.env.NEXT_PUBLIC_GA_ID,
    pollMs = 200,
    timeoutMs = 8000,
  }: { gaId?: string; pollMs?: number; timeoutMs?: number } = {},
): () => void {
  if (typeof window === 'undefined') return () => {};

  let done = false;
  const run = () => {
    if (done) return true;
    if (!isGaConfigured(gaId)) return false;
    done = true;
    cb();
    return true;
  };

  if (run()) return () => {};

  const interval = setInterval(() => {
    if (run()) clearInterval(interval);
  }, pollMs);
  const timeout = setTimeout(() => {
    done = true;
    clearInterval(interval);
  }, timeoutMs);

  return () => {
    done = true;
    clearInterval(interval);
    clearTimeout(timeout);
  };
}
