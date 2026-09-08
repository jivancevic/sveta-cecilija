// The VAPID keys, read from the environment (#431).
//
// A file of its own, deliberately: `/app`'s page is a SERVER COMPONENT that
// needs the public key to hand to the banner, and importing it from the poster
// would pull the whole `web-push` package (and its crypto dependencies) into
// that page's module graph for the sake of one string.
//
// Runtime env only (CLAUDE.md hard rule), never a build ARG and never a
// committed file:
//   VAPID_PUBLIC_KEY   the application server key, also handed to the browser
//   VAPID_PRIVATE_KEY  the secret half; rotating it invalidates every existing
//                      subscription, so the table has to be emptied with it
//   VAPID_SUBJECT      a `mailto:` the push services can complain to
//
// The public key reaches the client as a prop rather than as a `NEXT_PUBLIC_`
// twin: it is the same value under a second name, and one name means the
// operator cannot set half of a pair and leave the banner subscribing against a
// key the sender does not hold.

export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

/** Null when push is not configured; every caller then degrades to "no push". */
export function vapidConfig(env: NodeJS.ProcessEnv = process.env): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = env.VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey) return null
  return {
    publicKey,
    privateKey,
    // web-push refuses a subject that is neither a URL nor a mailto:, and a
    // deployment without one is otherwise perfectly able to send.
    subject: env.VAPID_SUBJECT?.trim() || 'mailto:info@moreska.eu',
  }
}

/** The public key the banner subscribes with, or null when push is off. */
export function vapidPublicKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return vapidConfig(env)?.publicKey ?? null
}
