import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { getPayload } from 'payload'
import { z } from 'zod'
import config from '@payload-config'
import { can, type PermissionUser } from '@/lib/access/permissions'
import { DANCE_ROLES } from '@/lib/moreskant-profile'
import { issuerUrl, mcpResourceUrl, sha256, verifyAccessToken } from '@/lib/mcp/oauth'
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

// The MCP server (#438, ADR-0024): `/api/mcp/mcp`, Streamable HTTP.
//
// A voditelj adds `https://moreska.eu/api/mcp` to the Claude app; the connector
// appends the transport segment itself, which is what the `[transport]` folder
// is (an `mcp-handler` convention — `basePath` derives the endpoints from it).
//
// THIS FILE IS WIRING. Every rule lives in `@/lib/mcp/tools.ts`, pure over a
// DI'd store, and every query in `@/lib/mcp/store.ts`. What belongs here, and
// nowhere else, are the three gates:
//
//  1. **`verifyToken`** — bearer → identity, then a FRESH read of the account.
//     A token is not a permission: `moreska` is re-checked on every call, so a
//     voditelj whose permission is taken away in `/admin` loses the connector
//     on their next sentence, without anybody hunting for a token row. Returning
//     `undefined` is the 401, and `withMcpAuth` attaches the
//     `WWW-Authenticate` header pointing at the resource metadata.
//  2. **The rate limit**, per token (`mcp-rate-limit.ts`): a model in a loop is
//     the realistic load here, not an attacker.
//  3. **Nothing else.** There is no tool that confirms a lineup, sends an
//     alarm, answers attendance or issues a comp (#430, story 63).
//
// SSE is disabled: the legacy transport needs Redis, and the Claude app speaks
// Streamable HTTP.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** What `verifyToken` hangs on `AuthInfo.extra` for the tools to read. */
interface McpIdentity {
  userId: string
  tokenKey: string
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
          'Upisuje POSTAVU izvedbe iz popisa nadimaka i uloga (npr. s fotografije papirnatog popisa). Nadimci se uspoređuju točno, bez obzira na velika slova i dijakritike; nadimak koji se ne prepozna vraća se u "unmatched" i NE pogađa se najbliži. Postava se uvijek upisuje kao NEPOTVRĐENA, a potvrđenu postavu odbija (prvo Otključaj u aplikaciji). Zamjenjuje cijelu postavu, ne dopunjuje je.',
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
  { serverInfo: { name: 'moreskant-mcp', version: '1.0.0' } },
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
 * permission set.
 */
const verifyToken = async (
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined
  const payload = await getPayload({ config })
  const verified = await verifyAccessToken(oauthStoreFor(payload), bearerToken)
  if (!verified) return undefined

  const user = await payload
    .findByID({ collection: 'users', id: verified.userId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!can(user as PermissionUser, 'moreska')) return undefined

  return {
    token: bearerToken,
    clientId: verified.clientId,
    scopes: verified.scopes,
    expiresAt: verified.expiresAt,
    resource: new URL(verified.resource ?? mcpResourceUrl()),
    extra: { userId: verified.userId, tokenKey: sha256(bearerToken) } satisfies McpIdentity,
  }
}

// Lazy, for the same reason the metadata route is: `issuerUrl()` fail-fasts on
// a missing env var, and that must happen on a request rather than during the
// build's route collection.
let authHandler: ((req: Request) => Promise<Response>) | null = null

function route(req: Request): Promise<Response> {
  // The rate limit runs BEFORE the handler and keys on the raw bearer token's
  // hash: a throttled caller must not cost a database round trip, and an
  // authenticated caller deserves an honest 429 rather than a silent success.
  const auth = req.headers.get('authorization')
  const bearer = auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (bearer && !mcpRateLimiter.allow(sha256(bearer))) {
    return Promise.resolve(
      new Response(JSON.stringify({ error: 'Previše zahtjeva. Pokušaj za koju minutu.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
      }),
    )
  }

  if (!authHandler) {
    // `withMcpAuth` builds the resource-metadata URL as `${resourceUrl}${path}`,
    // so `resourceUrl` MUST be the bare origin — passing the full `/api/mcp/mcp`
    // URL would point the header at `…/api/mcp/mcp/.well-known/…`, which is a
    // 404. The metadata document itself still reports the full MCP URL as its
    // `resource` (see the well-known route).
    authHandler = withMcpAuth(handler, verifyToken, {
      required: true,
      resourceMetadataPath: '/.well-known/oauth-protected-resource',
      resourceUrl: issuerUrl(),
    })
  }
  return authHandler(req)
}

export { route as GET, route as POST, route as DELETE }
