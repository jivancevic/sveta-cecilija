import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { getPayload } from 'payload'
import { z } from 'zod'
import config from '@payload-config'
import { can, type PermissionUser } from '@/lib/access/permissions'
import { DANCE_ROLES } from '@/lib/moreskant-profile'
import {
  issuerUrl,
  mcpResourceUrl,
  verifyAccessToken,
  type VerifiedToken,
} from '@/lib/mcp/oauth'
import { oauthStoreFor } from '@/lib/mcp/oauth-store'
import { createMcpStore, type McpPayload } from '@/lib/mcp/store'
import {
  MCP_CREATABLE_KINDS,
  createPerformances,
  getPerformance,
  listMoreskanti,
  listPerformances,
  setLineup,
} from '@/lib/mcp/tools'
import { mcpRateLimiter } from '@/lib/rate-limit/mcp-rate-limit'
import { MORESKA_SCOPE, bearerToken, isMissingUserError, mcpAuthScopes } from '@/lib/mcp/gate'

// The MCP server (#438, ADR-0024): `/api/mcp/mcp`, Streamable HTTP.
//
// A voditelj adds `https://moreska.eu/api/mcp/mcp` to the Claude app, the FULL
// URL: the connector does not append the transport segment. `[transport]` is an
// `mcp-handler` convention (`basePath` derives the endpoints from it), and the
// bare `/api/mcp` is a 404.
//
// THIS FILE IS WIRING. Every rule lives in `@/lib/mcp/tools.ts`, pure over a
// DI'd store, and every query in `@/lib/mcp/store.ts`. What belongs here, and
// nowhere else, are the three gates:
//
//  1. **`verifyToken`** — bearer → identity, then a FRESH read of the account.
//  2. **The rate limit**, on a token that has already verified.
//  3. **Nothing else.** There is no tool that confirms a lineup, sends an
//     alarm, answers attendance or issues a comp.
//
// Why each of those is shaped the way it is — the 401/403 split, the audience
// binding, the key the limit uses — is in `docs/agents/moreskant-app.md`.
//
// SSE is disabled: the legacy transport needs Redis, and the Claude app speaks
// Streamable HTTP.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** What `verifyToken` hangs on `AuthInfo.extra` for the tools to read. */
interface McpIdentity {
  userId: string
}

type ToolExtra = { authInfo?: { extra?: unknown } }

function identity(extra: ToolExtra): McpIdentity | null {
  const info = extra.authInfo?.extra as McpIdentity | undefined
  return info?.userId ? info : null
}

/** MCP text content from any value. Tools answer with JSON a model can read. */
function jsonText(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

/**
 * The store for this call, bound to the token's user.
 *
 * Built per call rather than once per process: `getPayload` is memoized by
 * Payload itself, and the writes need the user for the collection hooks'
 * `req.user`.
 */
async function storeFor(extra: ToolExtra) {
  const info = identity(extra)
  if (!info) throw new Error('Token nije povezan s korisnikom.')
  const payload = await getPayload({ config })
  const user = await payload
    .findByID({ collection: 'users', id: info.userId, depth: 0, overrideAccess: true })
    .catch(() => null)
  return createMcpStore(payload as unknown as McpPayload, user)
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'list_performances',
      {
        title: 'Popis izvedbi',
        description:
          'Sve izvedbe jedne sezone (kalendarske godine), javne i nejavne: datum, vrijeme, vrsta, mjesto, je li otkazana, je li postava potvrđena i koliko je crnih i bilih javilo dolazak.',
        inputSchema: {
          season: z
            .number()
            .int()
            .optional()
            .describe('Sezona kao godina, npr. 2026. Bez nje: tekuća sezona.'),
        },
      },
      async ({ season }, extra) => jsonText(await listPerformances({ season }, await storeFor(extra))),
    )

    server.registerTool(
      'get_performance',
      {
        title: 'Detalji izvedbe',
        description:
          'Jedna izvedba s odgovorima na prisutnost (nadimak, dolazi/ne dolazi, vojska), popisom onih koji se nisu javili i postavom (uloge i je li potvrđena).',
        inputSchema: { id: z.string().describe('Id izvedbe iz list_performances.') },
      },
      async ({ id }, extra) => jsonText(await getPerformance({ id }, await storeFor(extra))),
    )

    server.registerTool(
      'list_moreskanti',
      {
        title: 'Popis moreškanata',
        description:
          'Svi moreškanti: id, nadimak, ime, je li aktivan, plesne uloge, glavna uloga i ima li prijavu u aplikaciju. Bez mobitela i e-mailova.',
      },
      async (extra) => jsonText(await listMoreskanti(await storeFor(extra))),
    )

    server.registerTool(
      'set_lineup',
      {
        title: 'Upiši postavu',
        description:
          'Upisuje POSTAVU izvedbe iz popisa nadimaka i uloga (npr. s fotografije papirnatog popisa). Nadimci se uspoređuju točno, bez obzira na velika slova i dijakritike; nadimak koji se ne prepozna vraća se u "unmatched", a nadimak koji odgovara dvojici moreškanata u "ambiguous". Najbliži se NIKAD ne pogađa. Postava se uvijek upisuje kao NEPOTVRĐENA, a potvrđenu postavu odbija (prvo Otključaj u aplikaciji). Zamjenjuje cijelu postavu, ne dopunjuje je.',
        inputSchema: {
          performanceId: z.string().describe('Id izvedbe.'),
          entries: z
            .array(
              z.object({
                nickname: z.string().describe('Nadimak moreškanta, npr. "Ćići".'),
                role: z.enum(DANCE_ROLES).describe('Plesna uloga.'),
              }),
            )
            .describe('Cijela postava: svaki moreškant točno jednom.'),
        },
      },
      async ({ performanceId, entries }, extra) =>
        jsonText(await setLineup({ performanceId, entries }, await storeFor(extra))),
    )

    server.registerTool(
      'create_performances',
      {
        title: 'Unesi izvedbe',
        description:
          'Unosi više NEJAVNIH izvedbi odjednom (brodovi, koncerti, ostalo). Redovne izvedbe se ovdje ne unose: one prodaju karte i unose se u administraciji. Ako je i jedan redak neispravan, ne upisuje se nijedan. Moreškanti dobiju jednu skupnu obavijest.',
        inputSchema: {
          rows: z
            .array(
              z.object({
                date: z.string().describe('Datum, YYYY-MM-DD.'),
                time: z.string().describe('Vrijeme, HH:MM (Europe/Zagreb).'),
                kind: z.enum(MCP_CREATABLE_KINDS).describe('Vrsta izvedbe.'),
                location: z.string().describe('Mjesto, slobodan tekst, npr. "Le Ponant, luka".'),
                client: z.string().optional().describe('Naručitelj, ako postoji.'),
                note: z.string().optional().describe('Poruka voditelja moreškantima.'),
              }),
            )
            .describe('Izvedbe koje treba unijeti.'),
        },
      },
      async ({ rows }, extra) => jsonText(await createPerformances({ rows }, await storeFor(extra))),
    )
  },
  { serverInfo: { name: 'cecilija-mcp', version: '1.0.0' } },
  {
    basePath: '/api/mcp',
    verboseLogs: process.env.NODE_ENV !== 'production',
    // Streamable HTTP only; the legacy SSE transport needs Redis.
    disableSse: true,
  },
)


/**
 * Bearer token → `AuthInfo`, or `undefined` for a 401.
 *
 * The second half is the one that matters: the token's user is re-read and
 * `moreska` re-checked on EVERY call. A token is a credential, not a captured
 * permission set — a permission taken away in `/admin` bites the next sentence
 * the voditelj types into Claude, with no token row touched.
 */
/**
 * One token verification per REQUEST, shared by the rate limit and by
 * `verifyToken` (#445 review).
 *
 * The rate limit has to run on the token's ROW ID and therefore AFTER the
 * lookup, but `withMcpAuth` does the lookup itself a moment later. Memoizing on
 * the request object — a WeakMap, so nothing is retained — buys the correct
 * ordering without a second indexed SELECT per call.
 */
const verifiedPerRequest = new WeakMap<Request, Promise<VerifiedToken | undefined>>()

function verifyOnce(req: Request, bearer: string): Promise<VerifiedToken | undefined> {
  const cached = verifiedPerRequest.get(req)
  if (cached) return cached
  const promise = (async () => {
    if (!bearer) return undefined
    const payload = await getPayload({ config })
    // The audience is compared, not merely stored: a token minted for another
    // resource is not a token for this one (RFC 8707).
    return verifyAccessToken(oauthStoreFor(payload), bearer, Date.now, mcpResourceUrl())
  })()
  verifiedPerRequest.set(req, promise)
  return promise
}

const verifyToken = async (
  req: Request,
  bearer?: string,
): Promise<AuthInfo | undefined> => {
  if (!bearer) return undefined
  const verified = await verifyOnce(req, bearer)
  if (!verified) return undefined

  const payload = await getPayload({ config })
  let user: unknown = null
  try {
    user = await payload.findByID({
      collection: 'users',
      id: verified.userId,
      depth: 0,
      overrideAccess: true,
    })
  } catch (err) {
    // A deleted account is "no user"; anything else is rethrown rather than
    // read as a permission decision (`gate.ts`).
    if (!isMissingUserError(err)) throw err
  }

  return {
    token: bearer,
    clientId: verified.clientId,
    scopes: mcpAuthScopes(verified.scopes, can(user as PermissionUser, 'moreska')),
    expiresAt: verified.expiresAt,
    // Safe to construct: `verifyAccessToken` has already refused any token whose
    // stored resource is not exactly this string, so no caller-supplied value
    // ever reaches `new URL()`.
    resource: new URL(mcpResourceUrl()),
    extra: { userId: verified.userId } satisfies McpIdentity,
  }
}

// Lazy, for the same reason the metadata route is: `issuerUrl()` fail-fasts on
// a missing env var, and that must happen on a request rather than during the
// build's route collection.
let authHandler: ((req: Request) => Promise<Response>) | null = null

async function route(req: Request): Promise<Response> {
  // The rate limit runs only on a token that VERIFIED, keyed on its row id: a
  // key derived from an unverified bearer would let a loop of random strings
  // mint one key per request. An unknown bearer therefore adds nothing at all
  // and falls straight through to the 401 below.
  const bearer = bearerToken(req.headers.get('authorization'))
  const verified = await verifyOnce(req, bearer)
  if (verified && !mcpRateLimiter.allow(verified.tokenId)) {
    return new Response(JSON.stringify({ error: 'Previše zahtjeva. Pokušaj za koju minutu.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
    })
  }

  if (!authHandler) {
    // `withMcpAuth` builds the resource-metadata URL as `${resourceUrl}${path}`,
    // so `resourceUrl` MUST be the bare origin — passing the full `/api/mcp/mcp`
    // URL would point the header at `…/api/mcp/mcp/.well-known/…`, which is a
    // 404. The metadata document itself still reports the full MCP URL as its
    // `resource` (see the well-known route).
    authHandler = withMcpAuth(handler, verifyToken, {
      required: true,
      requiredScopes: [MORESKA_SCOPE],
      resourceMetadataPath: '/.well-known/oauth-protected-resource',
      resourceUrl: issuerUrl(),
    })
  }
  return authHandler(req)
}

export { route as GET, route as POST, route as DELETE }
