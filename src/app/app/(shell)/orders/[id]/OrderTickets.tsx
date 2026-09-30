'use client'

import { APP_STRINGS } from '@/lib/app/strings'
import { Button, Card, Chip, List, ListRow } from '../../../ui'
import { useCompVoid } from '../../../use-comp-void'

// The Ulaznice panel of one order: what each ticket is, whether it counts,
// whether it is in. The words are decided on the server (`ticketView`); this
// component exists for the one thing the server cannot draw, a comp ticket's
// trash (#701).
//
// `voidable` is decided on the server too: true only on a comp order, for a
// `tickets` holder, on an active ticket nobody has scanned — a scanned comp is
// somebody who came in, and the route refuses it regardless. Every other row is
// the same row it was before this became a client component.

const G = APP_STRINGS.gratis

export interface OrderTicketItem {
  id: string
  /** "Odrasla 2" — what the confirmation names. */
  label: string
  type: string
  state: string
  scan: string
  cancelled: boolean
  voidable: boolean
}

export function OrderTickets({ orderId, tickets }: { orderId: string; tickets: OrderTicketItem[] }) {
  const { target, busy, error, done, ask, close, confirm } = useCompVoid<{
    orderId: string
    ticketId: string
    label: string
  }>()

  return (
    <>
      {done && <p className="app__done">{done}</p>}
      <List>
        {tickets.map((t) => (
          <ListRow
            key={t.id}
            className={t.cancelled ? 'app__ticket--void' : undefined}
            title={t.type}
            meta={t.scan}
            trail={
              <span className="app__ticket-trail">
                <Chip tone={t.cancelled ? 'warn' : 'plain'}>{t.state}</Chip>
                {t.voidable && (
                  <button
                    type="button"
                    className="app__icon-button app__icon-button--warn"
                    onClick={() => ask({ orderId, ticketId: t.id, label: t.label })}
                    title={G.cancelTicket}
                    aria-label={G.cancelTicket}
                  >
                    <TrashIcon />
                  </button>
                )}
              </span>
            }
          />
        ))}
      </List>

      {target && (
        <Card className="app__confirm" role="group" aria-label={G.confirmTicketTitle}>
          <b>{G.confirmTicketTitle}</b>
          <p>{G.confirmTicketBody(target.label)}</p>
          {error && <p className="app__error">{error}</p>}
          <div className="ui-btns">
            <Button variant="destructive" disabled={busy} onClick={() => void confirm()}>
              {busy ? G.cancelling : G.confirm}
            </Button>
            <Button variant="link" disabled={busy} onClick={close}>
              {G.cancel}
            </Button>
          </div>
        </Card>
      )}
    </>
  )
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </svg>
  )
}
