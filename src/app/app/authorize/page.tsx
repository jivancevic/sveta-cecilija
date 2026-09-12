import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { APP_STRINGS } from '@/lib/app/strings'
import { resolveAppViewer } from '@/lib/app/viewer'
import { authorizeReturnTo, mcpResourceUrl } from '@/lib/mcp/oauth'
import { parseAuthorizeRequest } from '@/lib/mcp/authorize'
import { LogoutButton } from '../LogoutButton'
import { ConsentButtons } from './ConsentButtons'

// `/app/authorize` — the OAuth consent screen (#438, stories 56-58).
//
// A voditelj adds `https://moreska.eu/api/mcp` to the Claude app, the connector
// discovers this page and sends them here. Because it lives in the `/app` route
// group it is already behind the same session cookie as the rest of the app, so
// a voditelj with `/app` open on their phone sees one sentence and one button
// and never types a password (story 57).
//
// Three cases, in order:
//  - **no session** → `/app/login?next=<this url, parameters and all>`, so the
//    flow resumes rather than restarting from an empty query;
//  - **signed in without `moreska`** → the "Nemate pristup" page, because a
//    dancer must not be able to script the roster (story 58). It is deliberately
//    the same page a dancer meets anywhere else in the app;
//  - **a valid request from a voditelj** → the consent buttons.
//
// The request itself is validated by the shared `parseAuthorizeRequest`, the
// same function the POST route re-runs on what the browser sends back.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `${APP_STRINGS.authorize.title} · ${APP_STRINGS.name}`,
  robots: { index: false, follow: false },
}

/**
 * The consent screen's own refusal. No Backoffice link: after #473 nothing in
 * Cecilija offers `/admin` except to a `dev` holder, and a connector refused
 * here is refused whatever else the account can open.
 */
function Refused({ title, body }: { title: string; body: string }) {
  return (
    <main className="app__panel">
      <h1>{title}</h1>
      <p>{body}</p>
      <LogoutButton className="app__button" />
    </main>
  )
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const viewer = await resolveAppViewer()

  if (!viewer.signedIn) {
    // The whole query rides along, so the consent flow survives the login. The
    // destination is a fixed same-origin path (`authorizeReturnTo`), never a
    // value from the query, so this cannot be an open redirect.
    redirect(`/app/login?next=${encodeURIComponent(authorizeReturnTo(params))}`)
  }

  if (!viewer.voditelj) {
    return (
      <Refused
        title={APP_STRINGS.authorize.deniedTitle}
        body={APP_STRINGS.authorize.deniedBody}
      />
    )
  }

  const request = parseAuthorizeRequest(params, mcpResourceUrl())
  if (!request) {
    return (
      <Refused
        title={APP_STRINGS.authorize.title}
        body={APP_STRINGS.authorize.invalidRequest}
      />
    )
  }

  const me = viewer.me

  return (
    <main className="app__panel">
      <h1>{APP_STRINGS.authorize.title}</h1>
      <p>{APP_STRINGS.authorize.intro}</p>
      {me?.nickname && (
        <p className="app__aside">
          {APP_STRINGS.authorize.signedInAs} <strong>{me.nickname}</strong>
        </p>
      )}
      <ConsentButtons
        params={{
          client_id: request.clientId,
          redirect_uri: request.redirectUri,
          state: request.state,
          code_challenge: request.codeChallenge,
          code_challenge_method: request.codeChallengeMethod,
          resource: request.resource ?? '',
          scope: request.scope ?? '',
        }}
      />
    </main>
  )
}
