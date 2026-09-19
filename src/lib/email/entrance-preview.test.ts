// Not an assertion: a throwaway renderer that writes a real ticket PDF and the
// ticket e-mail to ~/Desktop so the entrance line (#674) can be looked at in the
// tools a buyer uses, per CLAUDE.md's outgoing-artifact rule. Skipped unless
// PREVIEW=1, so it never runs in CI.
import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { describe, it } from 'vitest'

import { renderTicketEmail } from './render-ticket-email'
import { renderTicketsPdf } from './render-tickets-pdf'

const STUB_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

describe.runIf(process.env.PREVIEW === '1')('entrance line preview', () => {
  it('writes the PDF and the e-mail to the Desktop', async () => {
    for (const locale of ['en', 'hr'] as const) {
      const pdf = await renderTicketsPdf({
        buyer: { name: 'Susan Smith' },
        show: { date: '2026-09-14', time: '21:00', venue: 'ljetno-kino' },
        tickets: [
          { token: 'tok_1', type: 'adult', ref: 'HS8Z-1' },
          { token: 'tok_2', type: 'adult', ref: 'HS8Z-2' },
        ],
        locale,
        orderRef: 'HS8Z',
      }, { generateQrPng: async () => STUB_PNG })
      writeFileSync(join(homedir(), 'Desktop', `entrance-ticket-${locale}.pdf`), pdf)

      const { html } = await renderTicketEmail({
        buyer: { name: 'Susan Smith' },
        show: { date: '2026-09-14', time: '21:00', venue: 'ljetno-kino' },
        order: { adultCount: 6, childCount: 0, total: 10000 },
        locale,
        orderRef: 'HS8Z',
      })
      writeFileSync(join(homedir(), 'Desktop', `entrance-email-${locale}.html`), html)
    }
  }, 60_000)
})
