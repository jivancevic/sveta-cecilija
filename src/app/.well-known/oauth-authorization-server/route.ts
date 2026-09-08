import { NextResponse } from 'next/server'
import { SUPPORTED_SCOPES, issuerUrl } from '@/lib/mcp/oauth'

// RFC 8414 Authorization Server Metadata (#438).
//
// This is the document the Claude app fetches after the 401 from `/api/mcp`
// points it at the protected-resource metadata: it tells the connector where to
// send the user (`/app/authorize`) and where to redeem the code
// (`/api/oauth/token`).
//
// Three absences are deliberate:
//  - **no `registration_endpoint`** — there is one pre-registered client
//    (`MCP_CLIENT_ID`), and dynamic client registration is out of scope (#430);
//  - **no `refresh_token` grant** — the token lives a year (story 59);
//  - **no `plain` challenge method** — PKCE S256 or nothing.
//
// It reads only env, so it is cheap and public; the CORS headers are what let
// the connector fetch it from its own origin.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export function GET() {
  const issuer = issuerUrl()
  return NextResponse.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/app/authorize`,
      token_endpoint: `${issuer}/api/oauth/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      // `mcp` only. The MCP route additionally REQUIRES a `moreska` scope, but
      // that one is not advertised and cannot be asked for: it is stamped on
      // the token at verification time from the live permission set and never
      // stored, so it is a permission wearing a scope's clothes rather than
      // something a client may request (`moreskant-app.md`).
      scopes_supported: [...SUPPORTED_SCOPES],
    },
    { headers: CORS },
  )
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}
