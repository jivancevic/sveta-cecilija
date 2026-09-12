// The liveness report behind `GET /api/health` (ADR-0026).
//
// Deliberately NOT a readiness check, and the distinction is the whole point.
// The container's `CMD` is `bootstrap-db.mjs && server.js`: a failed schema
// bootstrap means `server.js` never starts and nothing answers this route at
// all. So plain liveness already catches the failure mode the health check
// exists for, and Coolify can gate a deploy on it.
//
// Making DB reachability *fail* the check would buy nothing and cost something
// real: a brief Postgres blip while the app is perfectly healthy would have
// Coolify restart a container that restarting cannot fix, which is how a
// transient becomes a restart loop. `dbOk` is therefore reported and never
// decides the status code — it is there for a human reading the body and for an
// uptime monitor that wants more than "the port is open".
//
// `commit` is the deployed revision (Coolify injects `SOURCE_COMMIT` into the
// container at runtime, so it needs no build ARG). The repo is public, so the
// sha is not a secret, and it turns "did prod actually pick up my merge" into
// one curl instead of a Coolify deploy log. Nothing else goes in the body: no
// database name, no version, no env dump.

export interface HealthReport {
  /** Always true. If this response was produced, the server is alive. */
  ok: true
  /** Deployed revision, short sha, or null outside a Coolify deploy. */
  commit: string | null
  /** Informational only — never decides the status code. */
  dbOk: boolean
}

export interface HealthDeps {
  /** Raw `SOURCE_COMMIT`, or whatever the environment offers. */
  commit?: string | null
  /** Probe the database. May throw or hang; both are treated as `dbOk: false`. */
  probeDb: () => Promise<unknown>
  /** How long the probe gets before it is called a failure. Default 2000ms. */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 2000

/** Short sha, or null for an empty/absent value. */
export function shortCommit(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim()
  return trimmed === '' ? null : trimmed.slice(0, 7)
}

export async function buildHealthReport(deps: HealthDeps): Promise<HealthReport> {
  return {
    ok: true,
    commit: shortCommit(deps.commit),
    dbOk: await probeWithin(deps.probeDb, deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  }
}

/**
 * Run the probe under a deadline, swallowing every failure. A hung pool must
 * not hang the health check: an unanswered request reads to Coolify exactly
 * like a dead container, which is the false positive this module exists to
 * avoid.
 */
async function probeWithin(probe: () => Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const deadline = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs)
    })
    const result = await Promise.race([probe().then(() => true), deadline])
    return result === true
  } catch {
    return false
  } finally {
    if (timer) clearTimeout(timer)
  }
}
