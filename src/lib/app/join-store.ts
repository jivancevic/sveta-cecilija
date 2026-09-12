import { createHash, randomBytes, randomInt } from 'crypto'
import { poolQuery as poolQueryOf, type PoolQuery } from '@/lib/db/pool-query'
import {
  JOIN_CODE_TTL_MS,
  makeJoinCode,
  normalizeJoinCode,
  type JoinClaim,
  type JoinCode,
} from './join'

// The SQL behind the rehearsal join code (#463).
//
// `app_join_codes` and `app_join_claims` are RAW tables
// (db/schema/migrate-zz-db-join.sql), not Payload collections, so this module is
// their only reader and writer: plain parameterised `pool.query` against the
// pool Payload already owns, exactly as `src/lib/push/store.ts` and the OAuth
// store do.
//
// The pool is passed in as a one-method view rather than a Payload instance, so
// every function here is callable from a route and from a probe script without
// dragging the CMS along.

export type JoinQuery = PoolQuery

/** The pool Payload holds open, typed down to the one method we use. */
export const poolQuery: (payload: unknown) => JoinQuery = poolQueryOf

/**
 * A claim secret as the database holds it: SHA-256 hex, never the plaintext.
 *
 * The same rule the OAuth store follows, and for a stronger reason here: an
 * approved claim's secret opens a SESSION, so a readable backup would be a
 * bundle of sign-ins. The plaintext exists in one place, the httpOnly cookie on
 * the dancer's own phone.
 */
export function hashJoinSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

/** A device credential: 32 random bytes, hex. Never guessed, never derived. */
export function makeJoinSecret(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Three digits, 100-999, for the dancer's screen and the voditelj's eye.
 *
 * Not a credential: the server never checks it, so it needs no entropy budget.
 * It needs to be sayable across a room and different from the number the other
 * phone is showing, which three digits are.
 */
export function makeJoinPairing(): string {
  return String(100 + randomInt(900))
}

/** A fresh code off the unambiguous alphabet, drawn with the CSPRNG. */
export function freshJoinCode(): string {
  return makeJoinCode((max) => randomInt(max))
}

/**
 * Rotate: kill every live code, then issue one.
 *
 * Killing first is the whole point of a rotation — a voditelj presses "Novi
 * kod" precisely because the old QR is on somebody's camera roll — and it is
 * why the two statements are not worth a transaction: the window between them
 * is a window in which NO code works, which is the safe side to fail on.
 */
export async function rotateJoinCode(
  query: JoinQuery,
  createdBy: string | number,
  now = Date.now(),
): Promise<JoinCode> {
  await query(`UPDATE app_join_codes SET expires_at = now() WHERE expires_at > now()`, [])
  const code = freshJoinCode()
  const expiresAt = new Date(now + JOIN_CODE_TTL_MS)
  await query(
    `INSERT INTO app_join_codes (code, created_by, expires_at) VALUES ($1, $2, $3)`,
    [code, Number(createdBy), expiresAt.toISOString()],
  )
  return { code, expiresAt }
}

/** The code a voditelj's screen shows, or null when none is live. */
export async function currentJoinCode(query: JoinQuery): Promise<JoinCode | null> {
  const res = await query(
    `SELECT code, expires_at FROM app_join_codes
      WHERE expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1`,
    [],
  )
  const row = res.rows[0]
  if (!row) return null
  return { code: String(row.code), expiresAt: row.expires_at as Date }
}

/** One code by its value, live or not; the rules decide what that means. */
export async function findJoinCode(query: JoinQuery, code: string): Promise<JoinCode | null> {
  const res = await query(`SELECT code, expires_at FROM app_join_codes WHERE code = $1`, [
    normalizeJoinCode(code),
  ])
  const row = res.rows[0]
  if (!row) return null
  return { code: String(row.code), expiresAt: row.expires_at as Date }
}

/**
 * Write a claim. False when the partial unique index refused it, which means
 * this Member already has one pending: the index is the rule, not a handler.
 *
 * The UPDATE first is **load-bearing, not tidying** (#463 review). Nothing else
 * ever writes `expired`, so without it a claim nobody answered stays `pending`
 * for good: the voditelj's list hides it (it filters on `expires_at`), a
 * decision on it is refused, and the index then refuses the dancer's next tap
 * as well. The dancer would be locked out of the join flow permanently, and a
 * stranger with a live code could do that to the whole roster in one pass by
 * claiming every name and waiting two hours.
 */
export async function insertJoinClaim(
  query: JoinQuery,
  row: { memberId: string | number; code: string; secret: string; pairing: string; expiresAtMs: number },
): Promise<boolean> {
  await query(
    `UPDATE app_join_claims
        SET status = 'expired'
      WHERE member_id = $1 AND status = 'pending' AND expires_at <= now()`,
    [Number(row.memberId)],
  )
  const res = await query(
    `INSERT INTO app_join_claims (member_id, code, secret_hash, pairing, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      Number(row.memberId),
      normalizeJoinCode(row.code),
      hashJoinSecret(row.secret),
      row.pairing,
      new Date(row.expiresAtMs).toISOString(),
    ],
  )
  return (res.rowCount ?? 0) > 0
}

function toClaim(row: Record<string, unknown>): JoinClaim {
  return {
    id: Number(row.id),
    memberId: Number(row.member_id),
    status: String(row.status),
    userId: row.user_id == null ? null : Number(row.user_id),
    pairing: typeof row.pairing === 'string' ? row.pairing : null,
    expiresAt: row.expires_at as Date,
  }
}

/** The claim behind a device's cookie. Looked up by hash, never by plaintext. */
export async function findClaimBySecret(
  query: JoinQuery,
  secret: string,
): Promise<JoinClaim | null> {
  const res = await query(
    `SELECT id, member_id, status, user_id, pairing, expires_at
       FROM app_join_claims WHERE secret_hash = $1`,
    [hashJoinSecret(secret)],
  )
  const row = res.rows[0]
  return row ? toClaim(row) : null
}

/** One claim by id, for the voditelj's decision. */
export async function findClaimById(query: JoinQuery, id: string): Promise<JoinClaim | null> {
  const numeric = Number(id)
  if (!Number.isFinite(numeric)) return null
  const res = await query(
    `SELECT id, member_id, status, user_id, pairing, expires_at FROM app_join_claims WHERE id = $1`,
    [numeric],
  )
  const row = res.rows[0]
  return row ? toClaim(row) : null
}

/** One line of the voditelj's pending list. Names only, like the public page. */
export interface PendingClaim {
  id: string
  memberId: string
  name: string
  nickname: string | null
  /** The three digits on the waiting dancer's own screen (#463 review). */
  pairing: string | null
  createdAt: Date
}

/**
 * Everything still waiting, newest last, joined to the Member for the name.
 *
 * Expired rows are left out by the `expires_at` test rather than swept by a
 * job. They ARE marked `expired` eventually, but lazily and by whoever trips
 * over them first (the dancer's next claim, or a voditelj's late tap), because
 * a `pending` row past its expiry still counts against the partial unique index
 * and would otherwise lock that Member out for good (#463 review).
 */
export async function pendingJoinClaims(query: JoinQuery): Promise<PendingClaim[]> {
  const res = await query(
    `SELECT c.id, c.member_id, c.created_at, c.pairing, m.name, m.nickname
       FROM app_join_claims c
       JOIN members m ON m.id = c.member_id
      WHERE c.status = 'pending' AND c.expires_at > now()
      ORDER BY c.created_at ASC`,
    [],
  )
  return res.rows.map((row) => ({
    id: String(row.id),
    memberId: String(row.member_id),
    name: typeof row.name === 'string' ? row.name : '',
    nickname: typeof row.nickname === 'string' ? row.nickname : null,
    pairing: typeof row.pairing === 'string' ? row.pairing : null,
    createdAt: row.created_at as Date,
  }))
}

/**
 * Take the decision, atomically, before anything is created (#463 review).
 *
 * False means somebody else got there first. Without this the whole decision
 * was check-then-act: two voditelji (or two tabs) could both read `pending`,
 * both find no login for the Member and both CREATE one, leaving two accounts
 * for one dancer with only the second losing its UPDATE. There is deliberately
 * no unique index on `users.member` to catch that (`link-self.ts`), so the
 * claim row is where the race has to be settled: the same `INSERT … ON CONFLICT`
 * shape the dispute guard and the push claim use, spelled as an UPDATE.
 */
export async function claimJoinDecision(
  query: JoinQuery,
  claimId: string | number,
  deciderId: string | number,
): Promise<boolean> {
  const res = await query(
    `UPDATE app_join_claims
        SET status = 'approving', decided_by = $2
      WHERE id = $1 AND status = 'pending'
      RETURNING id`,
    [Number(claimId), Number(deciderId)],
  )
  return (res.rowCount ?? 0) > 0
}

/** Hand the claim back when the login could not be opened after all. */
export async function releaseJoinDecision(
  query: JoinQuery,
  claimId: string | number,
): Promise<void> {
  await query(
    `UPDATE app_join_claims SET status = 'pending', decided_by = NULL
      WHERE id = $1 AND status = 'approving'`,
    [Number(claimId)],
  )
}

/** The voditelj said yes: record which login the claim ended in. */
export async function approveJoinClaim(
  query: JoinQuery,
  claimId: string | number,
  userId: string | number,
  deciderId: string | number,
): Promise<void> {
  await query(
    `UPDATE app_join_claims
        SET status = 'approved', user_id = $2, decided_by = $3, decided_at = now()
      WHERE id = $1 AND status = 'approving'`,
    [Number(claimId), Number(userId), Number(deciderId)],
  )
}

/** The voditelj said no. The row stays, so the phone can be told. */
export async function rejectJoinClaim(
  query: JoinQuery,
  claimId: string | number,
  deciderId: string | number,
): Promise<void> {
  await query(
    `UPDATE app_join_claims
        SET status = 'rejected', decided_by = $2, decided_at = now()
      WHERE id = $1 AND status = 'pending'`,
    [Number(claimId), Number(deciderId)],
  )
}

/** Mark a claim nobody answered in time, so it stops blocking the Member. */
export async function expireJoinClaim(query: JoinQuery, claimId: string | number): Promise<void> {
  await query(
    `UPDATE app_join_claims SET status = 'expired' WHERE id = $1 AND status = 'pending'`,
    [Number(claimId)],
  )
}

/**
 * Spend the claim. **False means somebody already spent it**, and the caller
 * must then open nothing (#463 review): the poll on the dancer's phone is a
 * plain `setInterval` that does not wait for its own last request, so on a bad
 * connection in a hall two of them overlap, and "one approval, one session"
 * only holds if this reports whether the row was actually still `approved`.
 */
export async function markJoinClaimUsed(
  query: JoinQuery,
  claimId: string | number,
): Promise<boolean> {
  const res = await query(
    `UPDATE app_join_claims SET status = 'used'
      WHERE id = $1 AND status = 'approved'
      RETURNING id`,
    [Number(claimId)],
  )
  return (res.rowCount ?? 0) > 0
}
