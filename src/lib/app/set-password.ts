// Setting a password (#424, rewritten in #463).
//
// It used to be the last step of both account mails: the link led here, the
// form ran Payload's `resetPassword`, and that call both stored the hash and
// opened the session. Which means the password was never what signed anybody
// in — it was a toll on the way to a session the token had already earned.
//
// Since #463 the link opens the session itself (`token-login.ts`), and this is
// what is left: an action a signed-in dancer may take in Više whenever they
// want to stop waiting for a message, or never. So it takes no token, sets no
// cookie, and asks for no current password — there frequently is none to type,
// and the caller is already holding a live session on this device, which is
// strictly more than a password proves.
//
// Pure + DI; the route (`src/app/api/app/set-password/route.ts`) is the wiring
// and the permission chokepoint.

import { APP_STRINGS } from './strings'
import { rejectAppRequest, type AppRequestMeta } from './request-guard'

/**
 * The shortest password `/app` accepts.
 *
 * The Users collection sets no minimum (Payload enforces only "not empty"), so
 * the rule has to live somewhere; eight characters is the floor `/app` puts on
 * a dancer's own choice. It is deliberately not a complexity rule: a phone
 * keyboard and a required symbol produce written-down passwords.
 */
export const MIN_PASSWORD_LENGTH = 8

export interface SetPasswordInput {
  password?: unknown
  repeat?: unknown
}

export interface SetPasswordResult {
  status: number
  body: { ok: true; message: string } | { error: string }
}

export interface SetPasswordDeps {
  request: AppRequestMeta
  /** The signed-in caller, as the route's guard resolved them. */
  caller: { id: string | number; shared?: unknown }
  /** `payload.update` on the caller's own row with `{ password }`. */
  setPassword: (userId: string | number, password: string) => Promise<void>
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * POST /api/app/set-password.
 *
 * 403/415 cross-site or non-JSON, 403 for a shared login, 400 for a short or
 * mismatched password, 200 otherwise. The session is untouched: Payload's
 * update adds no session and revokes none, so the other devices of the same
 * dancer stay signed in, which is what somebody setting a password on a phone
 * expects of their tablet.
 */
export async function handleSetPassword(
  input: SetPasswordInput | null | undefined,
  deps: SetPasswordDeps,
): Promise<SetPasswordResult> {
  const rejection = rejectAppRequest(deps.request)
  if (rejection) {
    return { status: rejection.status, body: { error: APP_STRINGS.setPassword.unexpected } }
  }

  // A shared login may not rotate its own password (ADR-0022, and the same rule
  // `Users.access.update` enforces in `/admin`): one volunteer changing it locks
  // out everybody else who holds it. This route runs `overrideAccess: true`, so
  // the collection rule does not reach it and the check has to be here.
  if (deps.caller.shared === true) {
    return { status: 403, body: { error: APP_STRINGS.setPassword.sharedAccount } }
  }

  // A password is used verbatim, spaces included: only its length is judged.
  const password = str(input?.password)
  const repeat = str(input?.repeat)
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { status: 400, body: { error: APP_STRINGS.setPassword.tooShort } }
  }
  if (password !== repeat) {
    return { status: 400, body: { error: APP_STRINGS.setPassword.mismatch } }
  }

  try {
    await deps.setPassword(deps.caller.id, password)
  } catch {
    return { status: 500, body: { error: APP_STRINGS.setPassword.unexpected } }
  }

  return { status: 200, body: { ok: true, message: APP_STRINGS.setPassword.saved } }
}
