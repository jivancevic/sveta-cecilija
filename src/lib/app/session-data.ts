import { createLocalReq, getFieldsToSign, jwtSign, type getPayload } from 'payload'
import { addSessionToUser, generatePayloadCookie } from 'payload/shared'

// Opening a session for an account whose password nobody knows (#463).
//
// This is the piece that makes an invitation the thing that AUTHENTICATES.
// Until #463 the only way into `/app` from a link was the password form,
// which runs Payload's `resetPassword`: that stores a hash and opens a session
// in one go, so a dancer had to invent a password before they could see the
// app. A dancer who never wants one should not have to, and "pošalji mi link za
// prijavu" must not silently replace a password somebody DOES use.
//
// So the link opens a session and touches nothing else. Every piece of that is
// public Payload API, and it is exactly what `resetPassword` does after it has
// written the hash:
//
//   1. `addSessionToUser` writes a `sid` into `users.sessions` (the collection
//      runs with Payload's default `useSessions`, so a JWT whose `sid` is not
//      in that array is refused — which is also what makes `/api/app/logout` an
//      actual sign-out rather than a dropped cookie);
//   2. `getFieldsToSign` + `jwtSign` mint the same token `payload.login` mints
//      for the login form, signed with the same secret and carrying the same
//      30-day `tokenExpiration`;
//   3. `generatePayloadCookie` wraps it in the cookie Payload itself builds,
//      the one `/admin` and `/app/login` already set.
//
// Nothing here re-implements a crypto decision: the day Payload changes how a
// session is stored, these three helpers change with it.

type PayloadClient = Awaited<ReturnType<typeof getPayload>>

/** A login as the sign-in rules read it. Never a spread: no hash, no sessions. */
export interface AppSessionUser {
  id: string | number
  email: string | null
  username: string | null
  permissions: readonly unknown[]
  shared: boolean
}

function toSessionUser(row: Record<string, unknown> | null | undefined): AppSessionUser | null {
  if (!row || row.id == null) return null
  return {
    id: row.id as string | number,
    email: typeof row.email === 'string' ? row.email : null,
    username: typeof row.username === 'string' ? row.username : null,
    permissions: Array.isArray(row.permissions) ? (row.permissions as unknown[]) : [],
    shared: row.shared === true,
  }
}

/**
 * The account a live reset token belongs to, or null.
 *
 * The same two columns Payload's own `resetPassword` reads, with the same
 * expiry comparison, through `payload.db` rather than the local API: these are
 * auth fields, hidden from an ordinary `find`, and reading them is the whole
 * job. An expired token and an unknown one are both null, and the caller says
 * one sentence for both — for the person holding the link they are the same
 * situation.
 */
export async function findUserByResetToken(
  payload: PayloadClient,
  token: string,
): Promise<AppSessionUser | null> {
  const req = await createLocalReq({}, payload)
  const row = (await payload.db.findOne({
    collection: 'users',
    req,
    where: {
      and: [
        { resetPasswordToken: { equals: token } },
        { resetPasswordExpiration: { greater_than: new Date().toISOString() } },
      ],
    },
  })) as unknown as Record<string, unknown> | null
  return toSessionUser(row)
}

/**
 * Mint a session for this account and return the `Set-Cookie` value.
 *
 * Deliberately NOT tied to how the caller proved who they are: a sign-in link
 * and a voditelj approving a join claim are two different proofs that end in
 * the same session, and each of those rules lives with its own route.
 */
export async function openAppSession(
  payload: PayloadClient,
  userId: string | number,
): Promise<string> {
  const req = await createLocalReq({}, payload)
  const collectionConfig = payload.collections.users.config

  // The RAW row, because `addSessionToUser` appends to `user.sessions` and
  // writes the whole document back; a projection would drop the other sessions
  // and sign every other device out.
  const user = (await payload.db.findOne({
    collection: 'users',
    req,
    where: { id: { equals: userId } },
  })) as unknown as (Record<string, unknown> & { id: string | number }) | null
  if (!user) throw new Error(`openAppSession: no user ${userId}`)

  const { sid } = await addSessionToUser({
    collectionConfig,
    payload,
    req,
    user: user as never,
  })

  const fieldsToSign = getFieldsToSign({
    collectionConfig,
    email: typeof user.email === 'string' ? user.email : '',
    sid,
    user: user as never,
  })

  const { token } = await jwtSign({
    fieldsToSign,
    secret: payload.secret,
    tokenExpiration: collectionConfig.auth.tokenExpiration,
  })

  return generatePayloadCookie({
    collectionAuthConfig: collectionConfig.auth,
    cookiePrefix: payload.config.cookiePrefix,
    token,
  })
}
