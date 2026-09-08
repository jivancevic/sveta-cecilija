import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  OAuthError,
  exchangeAuthorizationCode,
  isAllowedRedirectUri,
  verifyClient,
} from '@/lib/mcp/oauth'
import { oauthStoreFor } from '@/lib/mcp/oauth-store'

// POST /api/oauth/token — the OAuth 2.1 token endpoint (#438).
//
// One grant: `authorization_code` + PKCE S256. There is no refresh grant, by
// decision (#430, story 59): the access token lives a year.
//
// The client is PUBLIC and sends no secret, so the only things that pin it are
// the fixed `client_id` and the PKCE verifier. `verifyClient` is therefore
// identification rather than authentication, and every refusal below is the
// same `invalid_grant` a replayed or tampered code gets — the rules live in
// `@/lib/mcp/oauth`, and this file only parses the form and maps errors.
//
// CORS is open on purpose: the token endpoint is called by the connector, from
// an origin we do not control, with no cookie and no ambient authority. It is
// the same shape Payload's own public endpoints have and the same shape
// Sufler's token route has.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function err(code: string, status = 400) {
  return NextResponse.json({ error: code }, { status, headers: CORS })
}

/** `client_id` from the Basic header or the form body (RFC 6749 §2.3.1). */
function clientId(req: Request, form: URLSearchParams): string | undefined {
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Basic ')) {
    try {
      const [id] = Buffer.from(auth.slice(6), 'base64').toString('utf8').split(':')
      if (id) return id
    } catch {
      // falls through to the form parameter
    }
  }
  return form.get('client_id') ?? undefined
}

export async function POST(req: Request) {
  let form: URLSearchParams
  try {
    form = new URLSearchParams(await req.text())
  } catch {
    return err('invalid_request')
  }

  const id = clientId(req, form)
  if (!id || !verifyClient(id)) return err('invalid_client', 401)

  if (form.get('grant_type') !== 'authorization_code') return err('unsupported_grant_type')

  const code = form.get('code')
  const redirectUri = form.get('redirect_uri')
  const codeVerifier = form.get('code_verifier')
  if (!code || !redirectUri || !codeVerifier) return err('invalid_request')
  // Checked here as well as against the code's own stored value: an unlisted
  // redirect never even reaches the store.
  if (!isAllowedRedirectUri(redirectUri)) return err('invalid_grant')

  try {
    const payload = await getPayload({ config })
    const tokens = await exchangeAuthorizationCode(oauthStoreFor(payload), {
      code,
      redirectUri,
      codeVerifier,
      clientId: id,
    })
    return NextResponse.json(tokens, {
      headers: { ...CORS, 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    })
  } catch (e) {
    if (e instanceof OAuthError) return err(e.code)
    console.error('[oauth] token endpoint failed', e)
    return err('server_error', 500)
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}
