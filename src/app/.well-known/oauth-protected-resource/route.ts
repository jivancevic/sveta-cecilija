import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from 'mcp-handler'
import { issuerUrl, mcpResourceUrl } from '@/lib/mcp/oauth'

// RFC 9728 Protected Resource Metadata (#438).
//
// The first document in the dance: an unauthenticated call to `/api/mcp`
// answers 401 with a `WWW-Authenticate` header naming THIS path, the connector
// fetches it, learns which authorization server to talk to, and goes there.
//
// `resource` is the exact public URL of the MCP endpoint (`/api/mcp/mcp` — see
// `mcpResourceUrl`), and `authServerUrls` is the bare origin, because that is
// where `/.well-known/oauth-authorization-server` lives.
//
// The handler is built LAZILY, on the first request: both values read env, and
// a fail-fast at module scope would run during `next build`, where those
// variables are deliberately absent (the Dockerfile passes throwaway ones).

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let handler: ((req: Request) => Response) | null = null

export function GET(req: Request) {
  if (!handler) {
    handler = protectedResourceHandler({
      authServerUrls: [issuerUrl()],
      resourceUrl: mcpResourceUrl(),
    })
  }
  return handler(req)
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
