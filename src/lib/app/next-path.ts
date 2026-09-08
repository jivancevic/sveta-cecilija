// Where `/app/login` sends a dancer after they sign in (#438).
//
// Until the OAuth consent screen there was one answer, `/app`, and it was
// hard-coded in the form. `/app/authorize` needs a second: a voditelj who taps
// "Connect" in the Claude app arrives with a query full of OAuth parameters, is
// bounced to the login page, and has to come back to THAT url, parameters and
// all, or the flow restarts from nothing.
//
// A `?next=` parameter is a redirect a stranger can write, so this module is
// the whole of the rule and it is deliberately narrow:
//
//   - it must start with `/app` and be either exactly `/app` or `/app/…`, so it
//     can only ever land inside this app;
//   - `//host` and `/\host` are refused, because a browser reads both as
//     protocol-relative and would leave the site;
//   - a `..` SEGMENT is refused (#445 review): `/app/../admin` starts with
//     `/app/` and still resolves to `/admin`, so the prefix test alone is not
//     the rule it looks like;
//   - anything else — an absolute URL, a path elsewhere on the site, a
//     backslash, an empty string — falls back to `/app`.
//
// Pure, so the table lives in `next-path.test.ts` rather than in a browser.

/** The default landing page: the season list. */
export const APP_HOME = '/app'

export function safeAppNextPath(value: unknown): string {
  if (typeof value !== 'string') return APP_HOME
  const path = value.trim()
  if (path === '') return APP_HOME
  // A backslash anywhere is refused rather than normalised: browsers treat it
  // as a slash in enough places that reasoning about "where exactly" is a trap.
  if (path.includes('\\')) return APP_HOME
  if (!path.startsWith('/')) return APP_HOME
  if (path.startsWith('//')) return APP_HOME
  if (path !== APP_HOME && !path.startsWith(`${APP_HOME}/`)) return APP_HOME
  // A `..` segment climbs back out of /app even though the string starts inside
  // it. Checked on the PATH only — the query may legitimately contain dots.
  const [pathname] = path.split('?')
  if (pathname!.split('/').includes('..')) return APP_HOME
  return path
}
