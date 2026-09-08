// The consent screen's rules (#438, stories 56-59), pure and shared.
//
// `/app/authorize` renders the request and `POST /api/app/authorize` acts on
// it, and both have to agree about what a valid request IS — otherwise a page
// that renders a button hands its values to a route that refuses them, or
// worse, the other way round. So the validation is one function and both call
// it, and the route re-validates rather than trusting the hidden fields the
// page rendered (a form's values are the browser's, not ours).
//
// What the page does NOT decide is who may consent: that is the `/app` access
// decision (`moreska` → voditelj), resolved by the caller and passed in as a
// boolean, because a dancer scripting the roster is exactly what story 58
// refuses.

import { rejectAppRequest, type AppRequestMeta } from '@/lib/app/request-guard'
import { APP_STRINGS } from '@/lib/app/strings'
import { grantedScope, isAllowedRedirectUri, mcpClientId } from './oauth'

/** The OAuth parameters a valid `/app/authorize` request carries. */
export interface AuthorizeRequest {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
  codeChallengeMethod: 'S256'
  resource: string | null
  scope: string | null
}

function one(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}

/**
 * Validate an authorization request, from a query string or from a form body.
 *
 * Null means "do not render a consent button": the client is not ours, the
 * redirect is not on the allow-list, PKCE is missing or not S256, or the
 * response type is something this server does not do. Every one of those is a
 * caller bug rather than a user's mistake, so they share one sentence.
 *
 * `response_type` is checked leniently — an absent one is read as `code`,
 * because it is the only type advertised and some clients omit it — while the
 * REDIRECT is checked without mercy: an unlisted redirect_uri is the one
 * mistake that would hand an authorization code to a stranger.
 */
export function parseAuthorizeRequest(
  params: Record<string, unknown>,
): AuthorizeRequest | null {
  const responseType = one(params.response_type) || 'code'
  const clientId = one(params.client_id)
  const redirectUri = one(params.redirect_uri)
  const codeChallenge = one(params.code_challenge)
  const codeChallengeMethod = one(params.code_challenge_method)

  if (responseType !== 'code') return null
  if (!clientId || clientId !== mcpClientId()) return null
  if (!redirectUri || !isAllowedRedirectUri(redirectUri)) return null
  if (codeChallengeMethod !== 'S256') return null
  if (!codeChallenge) return null

  return {
    clientId,
    redirectUri,
    state: one(params.state),
    codeChallenge,
    codeChallengeMethod: 'S256',
    resource: one(params.resource) || null,
    scope: one(params.scope) || null,
  }
}

/** The callback URL for a decision, code or refusal. */
export function callbackUrl(
  request: AuthorizeRequest,
  outcome: { code: string } | { error: string },
): string {
  const url = new URL(request.redirectUri)
  if (request.state) url.searchParams.set('state', request.state)
  if ('code' in outcome) url.searchParams.set('code', outcome.code)
  else url.searchParams.set('error', outcome.error)
  return url.toString()
}

export interface ConsentDeps {
  request: AppRequestMeta
  /** The signed-in account's id, or null when there is no session. */
  userId: string | null
  /** True when that account holds `moreska` (the `/app` voditelj decision). */
  isVoditelj: boolean
  /** `issueAuthorizationCode` bound to the store. */
  issueCode: (params: {
    clientId: string
    userId: string
    redirectUri: string
    codeChallenge: string
    codeChallengeMethod: string
    resource: string | null
    scope: string | null
  }) => Promise<string>
  /** This deployment's MCP resource URL, bound to the code when the client sent none. */
  resourceUrl: string
}

export interface ConsentResult {
  status: number
  body: { redirect: string } | { error: string }
}

/**
 * `POST /api/app/authorize` — the consent decision.
 *
 * It goes through the `/app` cross-site guard like every other
 * cookie-authenticated `/app` POST: it is a state-changing request made with
 * the session cookie, and issuing an authorization code from a cross-site form
 * would be exactly the attack that guard exists for.
 *
 * A refusal ("Odbij") is not an error: it answers 200 with a redirect carrying
 * `error=access_denied`, which is what the OAuth client is waiting for. Only a
 * request that is not ours at all refuses locally.
 */
export async function handleConsent(
  body: Record<string, unknown> | null | undefined,
  deps: ConsentDeps,
): Promise<ConsentResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) return { status: rejection.status, body: { error: APP_STRINGS.authorize.failed } }

  if (!deps.userId) return { status: 401, body: { error: APP_STRINGS.authorize.deniedBody } }
  if (!deps.isVoditelj) return { status: 403, body: { error: APP_STRINGS.authorize.deniedBody } }

  const request = parseAuthorizeRequest(body ?? {})
  if (!request) return { status: 400, body: { error: APP_STRINGS.authorize.invalidRequest } }

  if (String(body?.decision ?? '') !== 'allow') {
    return { status: 200, body: { redirect: callbackUrl(request, { error: 'access_denied' }) } }
  }

  const code = await deps.issueCode({
    clientId: request.clientId,
    userId: deps.userId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    codeChallengeMethod: request.codeChallengeMethod,
    // The token is bound to OUR resource when the client named none, so an
    // access token can never be replayed against a different audience.
    resource: request.resource ?? deps.resourceUrl,
    scope: grantedScope(request.scope),
  })

  return { status: 200, body: { redirect: callbackUrl(request, { code }) } }
}
