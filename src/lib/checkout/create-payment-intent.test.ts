import { describe, it, expect, vi } from 'vitest'
import {
  createPaymentIntentWithPmcFallback,
  isMissingPmcError,
} from './create-payment-intent'

const pi = { id: 'pi_1', client_secret: 'pi_1_secret' }

// Shape of Stripe's "No such payment_method_configuration: pmc_…" error.
const missingPmc = Object.assign(new Error('No such payment_method_configuration: pmc_live'), {
  code: 'resource_missing',
  param: 'payment_method_configuration',
})

describe('isMissingPmcError', () => {
  it('matches a resource_missing on payment_method_configuration', () => {
    expect(isMissingPmcError(missingPmc)).toBe(true)
  })

  it('matches by message even without the param field', () => {
    expect(
      isMissingPmcError({ code: 'resource_missing', message: 'No such payment_method_configuration: pmc_x' }),
    ).toBe(true)
  })

  it('does not match unrelated Stripe errors', () => {
    expect(isMissingPmcError({ code: 'card_declined', message: 'Your card was declined' })).toBe(false)
    expect(isMissingPmcError({ code: 'resource_missing', param: 'customer' })).toBe(false)
    expect(isMissingPmcError(null)).toBe(false)
  })
})

describe('createPaymentIntentWithPmcFallback', () => {
  it('passes the pinned PMC when set and it works', async () => {
    const create = vi.fn().mockResolvedValue(pi)
    const out = await createPaymentIntentWithPmcFallback(create, { amount: 2000 }, 'pmc_live')
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({ amount: 2000, payment_method_configuration: 'pmc_live' })
    expect(out).toEqual({ id: 'pi_1', clientSecret: 'pi_1_secret' })
  })

  it('omits the PMC entirely when none is configured', async () => {
    const create = vi.fn().mockResolvedValue(pi)
    await createPaymentIntentWithPmcFallback(create, { amount: 2000 }, undefined)
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({ amount: 2000 })
  })

  it('falls back to the account default when the pinned PMC is missing in this mode', async () => {
    const log = vi.fn()
    const create = vi
      .fn()
      .mockRejectedValueOnce(missingPmc) // first try, with PMC
      .mockResolvedValueOnce(pi) // retry, without PMC
    const out = await createPaymentIntentWithPmcFallback(create, { amount: 2000 }, 'pmc_live', log)
    expect(create).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenNthCalledWith(1, { amount: 2000, payment_method_configuration: 'pmc_live' })
    expect(create).toHaveBeenNthCalledWith(2, { amount: 2000 })
    expect(out).toEqual({ id: 'pi_1', clientSecret: 'pi_1_secret' })
    expect(log).toHaveBeenCalledOnce()
  })

  it('rethrows non-PMC errors without retrying', async () => {
    const create = vi.fn().mockRejectedValue(
      Object.assign(new Error('Your card was declined'), { code: 'card_declined' }),
    )
    await expect(
      createPaymentIntentWithPmcFallback(create, { amount: 2000 }, 'pmc_live'),
    ).rejects.toThrow(/declined/)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('normalises a null client_secret to an empty string', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'pi_2', client_secret: null })
    const out = await createPaymentIntentWithPmcFallback(create, {}, undefined)
    expect(out).toEqual({ id: 'pi_2', clientSecret: '' })
  })
})
