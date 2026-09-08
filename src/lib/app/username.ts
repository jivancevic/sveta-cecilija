// The username a moreškant's login gets, derived from their nickname (#424).
//
// A dancer logs in with "cici", not with an email they may not remember
// (ADR-0011 hybrid login). The nickname is the name the whole app already shows
// them by, so it is the obvious identifier — once it is reduced to something a
// login field accepts: ASCII, lowercase, no spaces.
//
// Croatian diacritics are transliterated the way Croatian itself does it when
// it has to go ASCII (č ć → c, š → s, ž → z, đ → dj), NOT dropped: "Đuro" is
// "djuro", never "uro". Everything else goes through Unicode NFD so an accented
// Latin letter loses its mark rather than the whole letter.
//
// Pure, so the whole table lives in username.test.ts.

/** Croatian letters Unicode decomposition does not handle (đ has no base + mark). */
const HARD_MAP: Record<string, string> = {
  đ: 'dj',
  Đ: 'dj',
  ð: 'dj',
}

/** The name a login falls back to when a nickname reduces to nothing at all. */
export const USERNAME_FALLBACK = 'moreskant'

/**
 * "Cici" → `cici`, "Đuro Mali" → `djuro-mali`, "Žuti #3" → `zuti-3`.
 *
 * Anything that is not a lowercase ASCII letter or a digit becomes a single
 * dash; leading and trailing dashes are trimmed. An empty or symbol-only
 * nickname yields {@link USERNAME_FALLBACK} rather than an empty username,
 * because a login without an identifier cannot exist.
 */
export function usernameFromNickname(nickname: string | null | undefined): string {
  const source = typeof nickname === 'string' ? nickname : ''
  const mapped = [...source].map((ch) => HARD_MAP[ch] ?? ch).join('')
  const ascii = mapped
    .normalize('NFD')
    // Combining marks: the accent of an already-decomposed letter.
    .replace(/[\u0300-\u036f]/g, '')
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || USERNAME_FALLBACK
}

/**
 * The first free username in the `cici`, `cici2`, `cici3`, … series.
 *
 * The suffix carries no dash on purpose: it reads as one word in a login field,
 * and `cici2` cannot collide with a nickname that really is "Cici 2" (that one
 * slugs to `cici-2`). `isTaken` is async because the answer is a query.
 */
export async function allocateUsername(
  nickname: string | null | undefined,
  isTaken: (candidate: string) => Promise<boolean>,
  limit = 50,
): Promise<string> {
  const base = usernameFromNickname(nickname)
  for (let n = 1; n <= limit; n++) {
    const candidate = n === 1 ? base : `${base}${n}`
    if (!(await isTaken(candidate))) return candidate
  }
  // 50 dancers sharing one nickname is not a real case; a unique suffix beats
  // throwing at a voditelj who only wanted to send an email.
  return `${base}${Date.now()}`
}
