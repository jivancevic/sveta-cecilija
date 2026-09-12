import { describe, it, expect } from 'vitest'
import { appSubdomainRedirects, APP_SUBDOMAIN_HOST } from './app-subdomain'

describe('appSubdomainRedirects', () => {
  const rules = appSubdomainRedirects()

  it('only ever fires on the vanity host', () => {
    for (const rule of rules) {
      expect(rule.has).toEqual([{ type: 'host', value: APP_SUBDOMAIN_HOST }])
    }
  })

  it('is a 301, not the 308 that `permanent: true` would emit', () => {
    expect(rules.every((rule) => rule.statusCode === 301)).toBe(true)
  })

  it('sends the bare host and any path under the canonical /app', () => {
    const catchAll = rules.find((rule) => rule.source === '/:path*')
    expect(catchAll?.destination).toBe('https://moreska.eu/app/:path*')
  })

  it('does not double the /app segment for links already carrying it', () => {
    const [first] = rules
    expect(first.source).toBe('/app/:path*')
    expect(first.destination).toBe('https://moreska.eu/app/:path*')
  })

  it('puts the /app rule before the catch-all, since Next takes the first match', () => {
    expect(rules.findIndex((rule) => rule.source === '/app/:path*')).toBeLessThan(
      rules.findIndex((rule) => rule.source === '/:path*'),
    )
  })
})
