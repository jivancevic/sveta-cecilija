// Environment + connected-database identity for the superadmin dev strip (#244).
// Pure: reads a plain env bag (defaults to process.env) so it's unit-testable
// and has no DB/Payload dependency. This banner is PROTECTIVE — a superadmin
// glances at it before a mutation to confirm they're not about to act on prod.
//
// Classification mirrors how the rest of the app marks environments:
//   - NEXT_PUBLIC_ENV='staging' is set ONLY on dev.moreska.eu (see robots.ts).
//   - NODE_ENV='production' is true on both prod and staging containers.
//   - local dev runs with NODE_ENV!=='production' and no NEXT_PUBLIC_ENV.
// So staging must be checked before production.

export type Environment = 'production' | 'staging' | 'development' | 'unknown'

export interface EnvInfo {
  environment: Environment
  /** The database name parsed from DATABASE_URL, or null if unreadable. */
  databaseName: string | null
  /** NEXT_PUBLIC_BASE_URL, for the banner. */
  baseUrl: string | null
  /** True for environments where a mutation is dangerous (prod). Drives the banner colour. */
  danger: boolean
}

type EnvBag = Record<string, string | undefined>

export function resolveEnvInfo(env: EnvBag = process.env): EnvInfo {
  const environment = classifyEnvironment(env)
  return {
    environment,
    databaseName: parseDatabaseName(env.DATABASE_URL),
    baseUrl: env.NEXT_PUBLIC_BASE_URL ?? null,
    danger: environment === 'production',
  }
}

function classifyEnvironment(env: EnvBag): Environment {
  if (env.NEXT_PUBLIC_ENV === 'staging') return 'staging'
  if (env.NODE_ENV === 'production') return 'production'
  if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test' || env.NODE_ENV == null) {
    return 'development'
  }
  return 'unknown'
}

// Extracts the database name from a postgres connection string without leaking
// credentials. Tolerates a missing/garbage URL (returns null) — the dev strip
// must never throw.
export function parseDatabaseName(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null
  try {
    const path = new URL(databaseUrl).pathname.replace(/^\//, '')
    return path ? decodeURIComponent(path) : null
  } catch {
    return null
  }
}
