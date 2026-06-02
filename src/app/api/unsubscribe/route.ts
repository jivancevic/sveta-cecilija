import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { verifyUnsubscribeToken } from '@/lib/marketing/unsubscribe-token'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// One-click marketing unsubscribe.
//
//   GET  /api/unsubscribe?t=<token>  → human clicks the footer link; we record
//        the opt-out and render a friendly bilingual confirmation page.
//   POST /api/unsubscribe?t=<token>  → RFC 8058 List-Unsubscribe-Post one-click
//        from the mail client; we record the opt-out and return 200 text.
//
// Opt-out is keyed by email and persisted in `marketing_optouts`, so it
// applies to every future show's review email — not just the order that
// carried this link. Idempotent: ON CONFLICT DO NOTHING.

type Pool = { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }

async function recordOptOut(email: string, source: string): Promise<void> {
  const payload = await getPayload({ config })
  const pool = (payload.db as unknown as { pool: Pool }).pool
  await pool.query(
    `INSERT INTO marketing_optouts (email, source, opted_out_at)
     VALUES (lower($1), $2, NOW())
     ON CONFLICT (email) DO NOTHING`,
    [email, source],
  )
}

function resolveEmail(req: NextRequest): string | null {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) return null
  const token = req.nextUrl.searchParams.get('t') ?? ''
  return verifyUnsubscribeToken(token, secret)
}

function confirmationHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>Unsubscribed</title>
<style>
  body{margin:0;background:#faf6ef;color:#1a1a1a;font-family:Inter,-apple-system,"Segoe UI",Arial,sans-serif;}
  .card{max-width:520px;margin:8vh auto;background:#fff;border:1px solid #e6dfd1;padding:40px 32px;text-align:center;}
  h1{font-family:"Bodoni Moda SC","Bodoni Moda",Georgia,serif;font-size:26px;margin:0 0 12px;}
  p{font-size:15px;line-height:1.55;margin:0 0 10px;color:#444;}
  .sep{height:1px;background:#e6dfd1;margin:20px 0;}
  a{color:#b48a3c;}
</style></head>
<body><div class="card">
  <h1>You're unsubscribed</h1>
  <p>You will no longer receive post-show review emails from Moreška by HGD Sveta Cecilija. Your ticket confirmations are unaffected.</p>
  <div class="sep"></div>
  <h1>Odjavljeni ste</h1>
  <p>Više nećete primati e-mailove s molbom za recenziju nakon nastupa. Vaše potvrde ulaznica nisu zahvaćene.</p>
  <div class="sep"></div>
  <p><a href="https://moreska.eu">moreska.eu</a></p>
</div></body></html>`
}

export async function GET(req: NextRequest) {
  const email = resolveEmail(req)
  if (!email) {
    return new NextResponse('Invalid or expired unsubscribe link.', {
      status: 400,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
  try {
    await recordOptOut(email, 'review-email-link')
  } catch (err) {
    console.error('[unsubscribe] GET failed', err instanceof Error ? err.message : err)
    return new NextResponse('Something went wrong. Email info@moreska.eu to be removed.', {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
  return new NextResponse(confirmationHtml(), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' },
  })
}

export async function POST(req: NextRequest) {
  const email = resolveEmail(req)
  if (!email) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }
  try {
    await recordOptOut(email, 'review-email-oneclick')
  } catch (err) {
    console.error('[unsubscribe] POST failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
  return new NextResponse('OK', {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
