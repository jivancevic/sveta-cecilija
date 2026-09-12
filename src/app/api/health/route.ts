import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { poolQuery } from '@/lib/db/pool-query'
import { buildHealthReport } from '@/lib/health/health'

// GET /api/health — the liveness endpoint Coolify's health check gates a deploy
// on, and the one an external uptime monitor polls (ADR-0026).
//
// Public and unauthenticated by design: a health check that needs a credential
// is a health check the proxy cannot run. The body is deliberately three fields
// wide — see `src/lib/health/health.ts` for why `dbOk` never changes the status
// code and why the commit sha is safe to expose.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const report = await buildHealthReport({
    commit: process.env.SOURCE_COMMIT,
    probeDb: async () => {
      const payload = await getPayload({ config })
      return poolQuery(payload)('SELECT 1')
    },
  })

  return NextResponse.json(report, {
    status: 200,
    headers: { 'cache-control': 'no-store' },
  })
}
