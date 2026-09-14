'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ChevronRight } from 'lucide-react'
import type { AppNotification } from '@/lib/app/notifications-store'
import { notificationTimeLabel } from '@/lib/app/notification-view'
import { APP_STRINGS } from '@/lib/app/strings'
import { Card, List, Note, Section } from '../ui'

// The rows of the Sandučić obavijesti, and the one action over them (#496,
// reskinned #569).
//
// A client island because two things need the browser: the tap has to mark the
// row read BEFORE it follows the row's url, and "Označi sve pročitanim" has to
// leave the reader on this screen with the bell already at zero. The rows
// themselves are server data, handed down as a prop.
//
// **"Označi sve pročitanim" is quiet text on the right of the section heading**
// (#569, Q48), where it used to be a button of its own above the list. It is
// not a thing anybody came here to do: it is the way out of a list you have
// already read, so it sits where a section's count sits and reads like one.
//
// A row is a BUTTON, not a link, and that is deliberate: its job is a write
// followed by a navigation, and a link that did the write in an onClick would
// race the navigation and lose it about as often as it won. The cost is no
// middle-click, which on a notification nobody wants.
//
// The mark is optimistic in ONE direction only: the dot goes as soon as the
// POST is sent, and a failure still navigates. The row is already open by then,
// and an inbox that refused to let go of a person because a mark did not land
// would be worse than a count that is one too high until the next tap.

const S = APP_STRINGS.notifications

export function NotificationList({
  rows,
  nowMs,
}: {
  rows: AppNotification[]
  /**
   * The server's clock, handed down rather than read here (#496 review).
   *
   * `Date.now()` during render is impure and would make the server's "danas u
   * 09:30" and the browser's disagree on a phone whose clock is off. The page
   * is `force-dynamic`, so this is as fresh as the rows it labels.
   */
  nowMs: number
}) {
  const router = useRouter()
  const [read, setRead] = useState<Set<string>>(new Set())
  const [failed, setFailed] = useState(false)
  const [clearing, startClearing] = useTransition()

  const unread = rows.filter((row) => row.readAt === null && !read.has(row.id)).length

  async function open(row: AppNotification) {
    setRead((prev) => new Set(prev).add(row.id))
    try {
      await fetch(`/api/app/notifications/${row.id}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    } catch {
      // Swallowed on purpose: the reader is on their way to the row's url.
    }
    router.push(row.url)
  }

  function markAll() {
    setFailed(false)
    startClearing(async () => {
      try {
        const res = await fetch('/api/app/notifications/read-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
        if (!res.ok) throw new Error(String(res.status))
        setRead(new Set(rows.map((row) => row.id)))
        // The bell lives in the shell, which is server-rendered: only a refresh
        // moves its number.
        router.refresh()
      } catch {
        setFailed(true)
      }
    })
  }

  if (rows.length === 0) {
    return (
      <Card className="app__empty">
        <h2>{S.emptyTitle}</h2>
        <p>{S.emptyBody}</p>
      </Card>
    )
  }

  return (
    <section className="app__more-group">
      <Section
        title={S.section}
        aside={
          unread > 0 ? (
            <button
              type="button"
              className="app__quiet-action"
              onClick={markAll}
              disabled={clearing}
            >
              {clearing ? S.marking : S.markAll}
            </button>
          ) : null
        }
      />

      {failed && <Note>{S.markAllFailed}</Note>}

      <List>
        {rows.map((row) => {
          const isUnread = row.readAt === null && !read.has(row.id)
          return (
            <button
              key={row.id}
              type="button"
              className={`ui-row app__notif-row${isUnread ? ' app__notif-row--unread' : ''}`}
              onClick={() => void open(row)}
            >
              <span className="app__notif-dot">
                {isUnread && <span className="app__sr-only">{S.unread}</span>}
              </span>
              <span className="ui-row__body">
                <b>{row.title}</b>
                <span>{row.body}</span>
                <span className="app__notif-time">
                  {notificationTimeLabel(row.createdAt, nowMs)}
                </span>
              </span>
              <span className="app__row-chev" aria-hidden="true">
                <ChevronRight size={20} strokeWidth={1.75} />
              </span>
            </button>
          )
        })}
      </List>
    </section>
  )
}
