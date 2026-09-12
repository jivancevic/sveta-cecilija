// The two Moreškant account mails (#424): the invitation and the sign-in link.
//
// One module, because they are one letter with two openings: both carry the
// same `/app/prijava?token=…` link, both are Croatian, both go from
// `info@moreska.eu` — the society's own identity, not the `tickets@` show
// stream, because this is a mail to a member of the society rather than to a
// buyer (ADR-0024; the Brevo daily cap is irrelevant at 20 dancers a season).
//
// Layout follows the house rule for HTML mail: centre with `align="center"` and
// fixed-pixel cells, never `width: 100%`, so Outlook and Gmail agree. Copy
// rules: "moreška" lowercase, a dancer is a *moreškant*, no em-dashes.
//
// The Brevo call goes through `postBrevoEmail`, the single transport boundary
// (ADR-0009): that is where the staging kill switch rewrites recipients. Tests
// inject a fake `fetch`, so CI never sends mail.

import { postBrevoEmail } from './post-brevo-email'

/**
 * `invite` is the voditelj opening a login; `signin` is the dancer asking for a
 * way in. It was called `reset` until #463, when the link stopped setting a
 * password and started opening a session (`src/lib/app/token-login.ts`).
 */
export type MoreskantEmailKind = 'invite' | 'signin'

export interface MoreskantEmailInput {
  kind: MoreskantEmailKind
  /** The Member's email; the only place a dancer's address is used. */
  to: string
  /** Nickname (or full name) for the greeting; may be empty. */
  greeting: string
  /** `https://moreska.eu/app/prijava?token=…` */
  link: string
}

export interface MoreskantEmailDeps {
  fetch: typeof fetch
  brevoApiKey: string
}

export const MORESKANT_EMAIL_SUBJECTS: Record<MoreskantEmailKind, string> = {
  invite: 'Pozivnica za Moreškant',
  signin: 'Poveznica za prijavu u Moreškant',
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** "Bok Cici," or a plain "Bok," when the member has no nickname yet. */
function renderGreeting(greeting: string): string {
  const name = greeting.trim()
  return name ? `Bok ${escapeHtml(name)},` : 'Bok,'
}

function renderBody(kind: MoreskantEmailKind): string[] {
  if (kind === 'invite') {
    return [
      'Otvorena ti je prijava za aplikaciju Moreškant, gdje se vidi raspored izvedbi i javlja dolazak.',
      'Klikni na poveznicu i odmah si prijavljen, bez lozinke. Poveznica vrijedi 7 dana.',
    ]
  }
  return [
    'Zatražena je poveznica za prijavu u aplikaciju Moreškant.',
    'Klikni na poveznicu i prijavljujemo te. Poveznica vrijedi 1 sat.',
  ]
}

const CLOSING = 'Ako ovu poruku nisi očekivao, slobodno je zanemari.'

export function renderMoreskantEmailHtml(input: MoreskantEmailInput): string {
  const link = escapeHtml(input.link)
  const paragraphs = renderBody(input.kind)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;">${p}</p>`)
    .join('\n          ')
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
  <tr>
    <td width="560" style="width:560px;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1f1b16;">
      <p style="margin:0 0 14px;font-size:15px;line-height:1.5;">${renderGreeting(input.greeting)}</p>
          ${paragraphs}
      <p style="margin:0 0 14px;font-size:15px;line-height:1.5;">
        <a href="${link}" style="color:#8a6412;">${link}</a>
      </p>
      <p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:#5c554c;">${CLOSING}</p>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#5c554c;">HGD Sveta Cecilija, Korčula</p>
    </td>
  </tr>
</table>`.trim()
}

/**
 * Sends one of the two mails. Failures are logged and **reported**, never
 * thrown: the invitation route has already created the login and minted the
 * token by the time it calls this, so a throw here would read to the caller as
 * "nothing happened" when in fact an account exists.
 *
 * Returns whether the letter actually left. It used to return nothing, which
 * made a Brevo 401 or a rate limit indistinguishable from a delivery: the
 * invitation answered "Pozivnica je poslana" while the log said otherwise, and
 * `APP_STRINGS.invite.sendFailed` was unreachable (#462 review). A caller with
 * nothing to say about it — the "Zaboravljena lozinka" route, which answers the
 * same sentence either way on purpose — can go on ignoring the value.
 */
export async function sendMoreskantEmail(
  input: MoreskantEmailInput,
  deps: MoreskantEmailDeps,
): Promise<boolean> {
  const body = {
    sender: { email: 'info@moreska.eu', name: 'HGD Sveta Cecilija' },
    to: [{ email: input.to, ...(input.greeting ? { name: input.greeting } : {}) }],
    subject: MORESKANT_EMAIL_SUBJECTS[input.kind],
    htmlContent: renderMoreskantEmailHtml(input),
  }
  try {
    const res = await postBrevoEmail(body, {
      fetch: deps.fetch,
      brevoApiKey: deps.brevoApiKey,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(
        `[sendMoreskantEmail] Brevo error kind=${input.kind} status=${res.status} body=${text}`,
      )
      return false
    }
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[sendMoreskantEmail] fetch failed kind=${input.kind} error=${msg}`)
    return false
  }
}
