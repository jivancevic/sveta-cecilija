// Moreškant identity: the rules that turn a Member row into a dancer profile
// (ADR-0024 phase 3, #420). Glossary: CONTEXT.md → Moreškant, Nadimak, Dance
// role, Primary role.
//
// A Member is a moreškant only when `isMoreskant` is ticked. Until then it is
// what ADR-0019 made it — a comp-attribution name — and none of the rules below
// apply, which is why the 14 production rows keep saving untouched.
//
// This module is pure (no IO, no Payload, no SQL), the same shape as
// `show-performance.ts`: the collection's `beforeValidate` hook is only the
// wiring, and every rule is unit-tested directly. Messages are Croatian because
// the only person who ever sees them is a voditelj, whose admin chrome is
// Croatian by default (see `admin-i18n.ts`).

/** The six dance roles (ADR-0024). `bili` is the "white" army, which wears red. */
export const DANCE_ROLES = [
  'crni',
  'bili',
  'crni_kralj',
  'otmanovic',
  'bili_kralj',
  'bula',
] as const

export type DanceRole = (typeof DANCE_ROLES)[number]

/**
 * Special roles and the plain army role each one presupposes: a king or an
 * otmanović is a dancer of that army first.
 */
export const ROLE_REQUIRES: Partial<Record<DanceRole, DanceRole>> = {
  crni_kralj: 'crni',
  otmanovic: 'crni',
  bili_kralj: 'bili',
}

/**
 * The army each dance role belongs to; a **bula is in neither** (glossary:
 * *Army count*).
 *
 * The single home of that mapping. It was written out three times before #432
 * — the answer rules' default army, the army count and the lineup suggestion —
 * and three copies of "which army is an otmanović in" is exactly the drift the
 * permission vocabulary rule guards against. `null` is not "unknown": it is
 * "neither army", the bula's whole point.
 */
export const ARMY_OF_ROLE: Record<DanceRole, 'crni' | 'bili' | null> = {
  crni: 'crni',
  crni_kralj: 'crni',
  otmanovic: 'crni',
  bili: 'bili',
  bili_kralj: 'bili',
  bula: null,
}

/** Croatian labels for the admin select and for `/app` (#421). */
export const DANCE_ROLE_LABELS: Record<DanceRole, string> = {
  crni: 'Crni',
  bili: 'Bili',
  crni_kralj: 'Crni kralj',
  otmanovic: 'Otmanović',
  bili_kralj: 'Bili kralj',
  bula: 'Bula',
}

const KNOWN = new Set<string>(DANCE_ROLES)

/** Narrows an arbitrary value to a known dance role. */
export function isDanceRole(value: unknown): value is DanceRole {
  return typeof value === 'string' && KNOWN.has(value)
}

/** Thrown by {@link validateAndNormaliseMoreskant}; the collection hook re-wraps it as a 400. */
export class MoreskantProfileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoreskantProfileError'
  }
}

/** The subset of a Members document this module reasons about. */
export interface MoreskantShape {
  isMoreskant?: unknown
  is_moreskant?: unknown
  nickname?: unknown
  mobile?: unknown
  email?: unknown
  roles?: unknown
  primaryRole?: unknown
  [key: string]: unknown
}

/**
 * True when a row (Payload doc or raw pg row) is flagged as a moreškant.
 *
 * Anything other than a literal `true` is "no": a missing column, a NULL, a
 * string. The safe direction — a row that is not a dancer must never be treated
 * as one by `/app`.
 */
export function isMoreskantRow(row: MoreskantShape): boolean {
  const raw = 'isMoreskant' in row ? row.isMoreskant : row.is_moreskant
  return raw === true
}

/**
 * The comparison key for nickname uniqueness: trimmed and lower-cased, so
 * "Cici", " cici " and "CICI" are one nickname. Empty when there is nothing to
 * compare.
 */
export function nicknameKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function trimmed(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim()
  return t === '' ? undefined : t
}

export interface MoreskantValidationOptions {
  /**
   * Nicknames held by the OTHER moreškanti (this row excluded). The Members
   * hook loads them; blank entries are ignored.
   */
  otherNicknames?: readonly unknown[]
}

/**
 * Validate a moreškant profile and normalise its text fields.
 *
 * Rules, all skipped unless `isMoreskant` is true (#420):
 * - a nickname is required and unique among moreškanti, case-insensitively;
 * - at least one dance role, every one of them from the vocabulary;
 * - a primary role, from the vocabulary and contained in the roles;
 * - `crni_kralj` / `otmanovic` require `crni`, `bili_kralj` requires `bili`.
 *
 * Returns a NEW object with `nickname` / `mobile` trimmed and `email` trimmed +
 * lower-cased; the input is never mutated. Throws {@link MoreskantProfileError}
 * with a Croatian, admin-readable message.
 */
export function validateAndNormaliseMoreskant<T extends MoreskantShape>(
  data: T,
  opts: MoreskantValidationOptions = {},
): T {
  if (!isMoreskantRow(data)) return { ...data }

  const out = { ...data }

  const nickname = trimmed(out.nickname)
  if (!nickname) {
    throw new MoreskantProfileError('Moreškant mora imati nadimak.')
  }
  out.nickname = nickname

  const mobile = trimmed(out.mobile)
  if (mobile !== undefined) out.mobile = mobile
  const email = trimmed(out.email)
  if (email !== undefined) out.email = email.toLowerCase()

  const taken = new Set(
    (opts.otherNicknames ?? []).map(nicknameKey).filter((k) => k !== ''),
  )
  if (taken.has(nicknameKey(nickname))) {
    throw new MoreskantProfileError(
      `Nadimak "${nickname}" već koristi drugi moreškant. Nadimci moraju biti jedinstveni.`,
    )
  }

  const roles = Array.isArray(out.roles) ? out.roles : []
  if (roles.length === 0) {
    throw new MoreskantProfileError('Moreškant mora imati barem jednu plesnu ulogu.')
  }
  const unknownRole = roles.find((r) => !isDanceRole(r))
  if (unknownRole !== undefined) {
    throw new MoreskantProfileError(
      `Nepoznata plesna uloga "${String(unknownRole)}". Dopuštene su: ${DANCE_ROLES.join(', ')}.`,
    )
  }
  const held = new Set(roles as DanceRole[])

  const primaryRole = out.primaryRole
  if (primaryRole == null || primaryRole === '') {
    throw new MoreskantProfileError('Moreškant mora imati glavnu ulogu.')
  }
  if (!isDanceRole(primaryRole)) {
    throw new MoreskantProfileError(
      `Nepoznata glavna uloga "${String(primaryRole)}". Dopuštene su: ${DANCE_ROLES.join(', ')}.`,
    )
  }
  if (!held.has(primaryRole)) {
    throw new MoreskantProfileError(
      `Glavna uloga "${DANCE_ROLE_LABELS[primaryRole]}" mora biti među plesnim ulogama moreškanta.`,
    )
  }

  for (const role of held) {
    const requires = ROLE_REQUIRES[role]
    if (requires && !held.has(requires)) {
      throw new MoreskantProfileError(
        `Uloga "${DANCE_ROLE_LABELS[role]}" traži i ulogu "${DANCE_ROLE_LABELS[requires]}".`,
      )
    }
  }

  return out
}
