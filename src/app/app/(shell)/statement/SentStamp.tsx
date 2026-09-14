'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'
import { Card, Note, Section, Switch } from '../../ui'

// **Slanje partneru** (#599): the secretary's half of Obračun.
//
// Two things, in the order she does them: mark the month sent, then send it.
//
// **The stamp is a `Switch` and not a button whose label flips.** Marking a
// month sent freezes its figures, so "is this month sent" is a state somebody
// has to be able to READ from across a desk, not infer from what a control
// currently offers to do. The route behind it is a switch too
// (`{ sent: true | false }`), so the undo is the same call and a retry from a
// second device is harmless.
//
// **Cecilija does not send the mail.** It hands over a `mailto:` with the
// subject and the body already written and the PDF one tap away, and the
// secretary attaches it and sends from Gmail — so the reply lands in `info@`,
// where she already reads. Same reasoning as Upiti's Odgovori: an in-app send
// fails silently and nobody finds out for a month.
//
// A month that has not ended cannot be stamped, and the switch says so rather
// than disappearing. The rule itself lives on the route; this is the courtesy
// half, exactly like the sell form's seat check.

const S = APP_STRINGS.statement.sent

export function SentStamp({
  partnerId,
  year,
  month,
  sentAt,
  monthEnded,
  mailHref,
  mailAddress,
  mailFallback,
}: {
  partnerId: string
  year: number
  month: number
  /** ISO instant when the month was stamped, or null while it is live. */
  sentAt: string | null
  monthEnded: boolean
  /** Null when nobody has an address for this partner. */
  mailHref: string | null
  mailAddress: string | null
  mailFallback: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sent = sentAt != null

  async function setSent(next: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/app/statement/sent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId, year, month, sent: next }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(body?.error ?? S.failed)
        return
      }
      // The frozen document is a server read, so the screen re-renders from the
      // server rather than patching a figure it would then have to keep in sync.
      router.refresh()
    } catch {
      setError(S.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="app__statement-send">
      <Section title={S.title} />
      <Card>
        <Switch
          checked={sent}
          busy={busy}
          disabled={!monthEnded && !sent}
          onChange={setSent}
          label={sent ? S.unmark : S.mark}
          note={sent ? stampedLine(sentAt) : monthEnded ? S.idle : S.monthNotOver}
        />

        {sent && <Note className="app__statement-frozen">{S.frozen}</Note>}
        {error && <p className="app__error">{error}</p>}

        <div className="app__statement-mail">
          {mailHref ? (
            <>
              <a className="ui-btn ui-btn--ghost" href={mailHref}>
                {S.mailOpen}
              </a>
              <p className="app__statement-mailnote">
                {S.mailNote}
                {mailFallback && mailAddress ? ` ${S.mailFallback(mailAddress)}` : ''}
              </p>
            </>
          ) : (
            <Note>{S.mailNoAddress}</Note>
          )}
        </div>
      </Card>
    </section>
  )
}

/** "Poslano 3. 9. 2026." — the day, never the minute: nobody files by minute. */
function stampedLine(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return S.stamped(
    d.toLocaleDateString('hr-HR', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      timeZone: 'Europe/Zagreb',
    }),
  )
}
