// PaymentIntent creation with a graceful payment-method-configuration fallback.
//
// We pin a curated PMC (Card + Apple/Google Pay) via STRIPE_PMC_ID to avoid the
// legacy WooCommerce account default (EU bank methods, no wallets). But PMC ids
// are MODE-SPECIFIC: the live PMC set in prod does not exist in test mode, so a
// test-key environment (dev.moreska.eu) that inherits the live id makes Stripe
// reject the whole create with `resource_missing`. Rather than break checkout at
// the Pay step, we detect that specific failure and retry WITHOUT the PMC,
// landing on the account default (the same as leaving STRIPE_PMC_ID unset).
//
// Any other Stripe error (card declined, bad amount, auth) is rethrown untouched.

/** Minimal shape of the Stripe PaymentIntent fields we consume. */
export interface CreatedPaymentIntent {
  id: string
  client_secret: string | null
}

/** Injected creator — `body` is the full PaymentIntent create params. */
export type CreatePaymentIntentFn = (body: Record<string, unknown>) => Promise<CreatedPaymentIntent>

/**
 * True for Stripe's "No such payment_method_configuration: pmc_…" error, i.e. a
 * pinned PMC id that doesn't exist in the active Stripe mode. Stripe reports it
 * as `resource_missing` on the `payment_method_configuration` param.
 */
export function isMissingPmcError(err: unknown): boolean {
  const e = err as { code?: string; param?: string; message?: string } | null
  if (!e) return false
  return (
    e.code === 'resource_missing' &&
    (e.param === 'payment_method_configuration' ||
      /payment_method_configuration/.test(e.message ?? ''))
  )
}

/**
 * Create a PaymentIntent, pinning `pmcId` when provided. If the pinned PMC is
 * not valid in the active Stripe mode, fall back to the account default instead
 * of failing checkout.
 */
export async function createPaymentIntentWithPmcFallback(
  create: CreatePaymentIntentFn,
  base: Record<string, unknown>,
  pmcId: string | undefined,
  log: (msg: string) => void = console.warn,
): Promise<{ id: string; clientSecret: string }> {
  const toResult = (pi: CreatedPaymentIntent) => ({ id: pi.id, clientSecret: pi.client_secret ?? '' })

  if (!pmcId) return toResult(await create(base))

  try {
    return toResult(await create({ ...base, payment_method_configuration: pmcId }))
  } catch (err) {
    if (!isMissingPmcError(err)) throw err
    log(
      `[checkout] STRIPE_PMC_ID "${pmcId}" not found in the active Stripe mode; ` +
        `falling back to the account default payment-method configuration.`,
    )
    return toResult(await create(base))
  }
}
