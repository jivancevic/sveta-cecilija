import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // camera=(self): the /admin/scan door scanner needs getUserMedia. `()` (empty
  // allowlist) disables the camera even same-origin — Chrome enforces this and
  // rejects getUserMedia ("Camera unavailable"); iOS Safari historically
  // ignored it, which masked the bug. (self) is the tightest value that still
  // lets our own origin open the camera; third-party iframes stay blocked, and
  // mic/geolocation remain fully disabled.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
]

// Staging (dev.moreska.eu) emits a blanket noindex on every response so search
// engines cannot index it even if a URL leaks. Read at build/start time;
// NEXT_PUBLIC_ENV is 'staging' only on the dev Coolify app (unset in prod).
const stagingHeaders =
  process.env.NEXT_PUBLIC_ENV === 'staging'
    ? [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]
    : []

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [...securityHeaders, ...stagingHeaders] }]
  },
}

export default withPayload(nextConfig)
