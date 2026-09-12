// The SQL behind the OAuth server (#438).
//
// `oauth_codes` and `oauth_tokens` are RAW tables
// (`db/schema/migrate-zz-d-oauth.sql`), not Payload collections: nobody edits a
// credential in `/admin`, and a token row is a secret rather than a document —
// the same reasoning `push_subscriptions` and `marketing_optouts` carry. This
// module is their only reader and writer.
//
// The rules live in `oauth.ts` over the {@link OAuthStore} seam; here there are
// only four statements. Two of them are worth a sentence:
//
//  - **`takeCode` is a `DELETE … RETURNING`**, not a SELECT followed by a
//    DELETE. Single use is then a property of the statement rather than of the
//    caller: two redemptions of one code race inside Postgres and exactly one
//    of them gets the row back.
//  - **Expired rows are swept opportunistically** on every code insert. There is
//    no cron for it, because the table is tiny and a code lives five minutes;
//    the sweep only exists so an abandoned flow does not accumulate forever.

import { poolQuery, type PoolQuery } from '@/lib/db/pool-query'
import type { OAuthCodeRow, OAuthStore, OAuthTokenRow } from './oauth'

export type { PoolQuery }

/** Epoch ms from a `timestamptz` however node-postgres felt like returning it. */
function msOf(value: unknown): number {
  if (value instanceof Date) return value.getTime()
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

function text(value: unknown): string | null {
  return value == null ? null : String(value)
}

export function createOAuthStore(query: PoolQuery): OAuthStore {
  return {
    insertCode: async (codeHash, row: OAuthCodeRow) => {
      await query(`DELETE FROM oauth_codes WHERE expires_at < now()`)
      await query(
        `INSERT INTO oauth_codes
           (code_hash, client_id, user_id, redirect_uri, code_challenge,
            code_challenge_method, resource, scope, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9 / 1000.0))`,
        [
          codeHash,
          row.clientId,
          Number(row.userId),
          row.redirectUri,
          row.codeChallenge,
          row.codeChallengeMethod,
          row.resource,
          row.scope,
          row.expiresAt,
        ],
      )
    },

    takeCode: async (codeHash) => {
      const res = await query(
        `DELETE FROM oauth_codes WHERE code_hash = $1
         RETURNING client_id, user_id, redirect_uri, code_challenge,
                   code_challenge_method, resource, scope, expires_at`,
        [codeHash],
      )
      const r = res.rows[0]
      if (!r) return null
      return {
        clientId: String(r.client_id),
        userId: String(r.user_id),
        redirectUri: String(r.redirect_uri),
        codeChallenge: String(r.code_challenge),
        codeChallengeMethod: String(r.code_challenge_method),
        resource: text(r.resource),
        scope: text(r.scope),
        expiresAt: msOf(r.expires_at),
      }
    },

    insertToken: async (tokenHash, row) => {
      await query(
        `INSERT INTO oauth_tokens
           (access_token_hash, client_id, user_id, resource, scope, expires_at)
         VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0))
         ON CONFLICT (access_token_hash) DO NOTHING`,
        [tokenHash, row.clientId, Number(row.userId), row.resource, row.scope, row.expiresAt],
      )
    },

    findToken: async (tokenHash): Promise<OAuthTokenRow | null> => {
      const res = await query(
        `SELECT id, client_id, user_id, resource, scope, expires_at
           FROM oauth_tokens WHERE access_token_hash = $1`,
        [tokenHash],
      )
      const r = res.rows[0]
      if (!r) return null
      return {
        id: String(r.id),
        clientId: String(r.client_id),
        userId: String(r.user_id),
        resource: text(r.resource),
        scope: text(r.scope),
        expiresAt: msOf(r.expires_at),
      }
    },
  }
}

/** The store bound to the pool Payload already holds open. */
export function oauthStoreFor(payload: unknown): OAuthStore {
  return createOAuthStore(poolQuery(payload))
}
