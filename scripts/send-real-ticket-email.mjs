// One-shot: fires a signed payment_intent.succeeded webhook at the local dev
// server so it triggers a real Brevo email to josip.ivancevic00@gmail.com.
//
// Usage:
//   1) Start the dev server in another terminal: `npm run dev`  (port 3000)
//   2) From repo root: `node --env-file=.env.local scripts/send-real-ticket-email.mjs`
//
// Override PORT or SHOW_ID via env if needed:
//   PORT=3001 SHOW_ID=4 node --env-file=.env.local scripts/send-real-ticket-email.mjs

import crypto from 'node:crypto'

const SECRET = process.env.STRIPE_WEBHOOK_SECRET
if (!SECRET) {
  console.error('Missing STRIPE_WEBHOOK_SECRET — load env with `node --env-file=.env.local …`')
  process.exit(1)
}

const PORT = process.env.PORT ?? '3000'
const SHOW_ID = process.env.SHOW_ID ?? '2'
const URL = `http://localhost:${PORT}/api/stripe/webhook`

const piId = 'pi_realsend_' + Date.now()
const payload = {
  id: 'evt_realsend_' + Date.now(),
  object: 'event',
  type: 'payment_intent.succeeded',
  data: {
    object: {
      id: piId,
      object: 'payment_intent',
      amount_received: 3000, // €30 — 1 adult + 1 child
      metadata: {
        showId: SHOW_ID,
        adults: '1',
        children: '1',
        buyerName: 'Josip (real send test)',
        email: 'josip.ivancevic00@gmail.com',
        locale: 'hr',
      },
    },
  },
}

const raw = JSON.stringify(payload)
const ts = Math.floor(Date.now() / 1000)
const sig = crypto.createHmac('sha256', SECRET).update(`${ts}.${raw}`).digest('hex')

console.log(`POST ${URL}`)
console.log(`paymentIntentId=${piId} showId=${SHOW_ID}`)
const res = await fetch(URL, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'stripe-signature': `t=${ts},v1=${sig}` },
  body: raw,
})
console.log('status:', res.status)
console.log('body:', await res.text())
console.log('')
console.log(`Cleanup later (drops test order + tickets; seats free automatically as the tickets go):`)
console.log(`  PGPASSWORD=postgres psql -h localhost -U postgres -d sveta_cecilija -c "DELETE FROM tickets WHERE order_id IN (SELECT id FROM orders WHERE stripe_payment_intent_id='${piId}'); DELETE FROM orders WHERE stripe_payment_intent_id='${piId}';"`)
