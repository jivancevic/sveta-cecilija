import { NextResponse } from 'next/server'
import { getPayload, type Where } from 'payload'
import config from '@payload-config'
import { handleForgot, type ForgotAccount } from '@/lib/app/forgot'
import { appRequestMeta } from '@/lib/app/request-guard'
import { sendMoreskantEmail } from '@/lib/email/send-moreskant-email'

// POST /api/app/forgot — "Zaboravljena lozinka" (#424).
//
// Wiring only; the rules are in `src/lib/app/forgot.ts`, including the one that
// matters most: **always 200**, whether the account exists, does not, or has no
// email. A different answer per case would turn this public URL into a list of
// who has a login.
//
// The lookup is ours rather than Payload's, because `forgotPassword` silently
// returns null for an unknown account and never tells us the address to mail;
// we need the email to send our own Croatian letter, so we read the row first
// and then ask Payload for a token targeted by username.
//
// The one-hour expiration passed below is honoured only because the Users auth
// config sets no `forgotPassword.expiration` — Payload reads
// `collectionConfig.auth?.forgotPassword?.expiration ?? expiration ?? 3600000`,
// so a collection value would win over the argument. See the note on Users.auth.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const payload = await getPayload({ config })
  const body = await req.json().catch(() => null)

  const result = await handleForgot(body, {
    request: appRequestMeta(req, process.env.NEXT_PUBLIC_BASE_URL),
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL ?? '',

    findAccount: async (identifier): Promise<ForgotAccount | null> => {
      const where: Where = identifier.email
        ? { email: { equals: identifier.email } }
        : { username: { equals: identifier.username ?? '' } }
      const found = await payload.find({
        collection: 'users',
        where,
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const row = found.docs[0] as unknown as Record<string, unknown> | undefined
      if (!row) return null
      return {
        id: row.id as string | number,
        username: typeof row.username === 'string' ? row.username : null,
        email: typeof row.email === 'string' ? row.email : null,
        name: typeof row.name === 'string' ? row.name : null,
      }
    },

    issueResetToken: async (target, expirationMs) => {
      const token = await payload.forgotPassword({
        collection: 'users',
        // See the invite route: the operation reads `username` too (ADR-0011),
        // the generated types narrow it to the email pair.
        data: target as Parameters<typeof payload.forgotPassword>[0]['data'],
        disableEmail: true,
        expiration: expirationMs,
      })
      return typeof token === 'string' ? token : null
    },

    sendReset: (mail) =>
      sendMoreskantEmail(
        { kind: 'reset', ...mail },
        { fetch, brevoApiKey: process.env.BREVO_API_KEY ?? '' },
      ),
  })

  return NextResponse.json(result.body, { status: result.status })
}
