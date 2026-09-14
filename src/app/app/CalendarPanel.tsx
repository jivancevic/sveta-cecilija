'use client'

import { useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'
import { Button, Card, Note } from './ui'

// The "Kalendar" panel, under the inbox since #569 (#433, story 42).
//
// It prints no heading of its own (#457): the screen already puts "Kalendar
// izvedbi" above it, and a second title under the first read as two panels.
//
// One URL and a copy button. The URL is rendered as TEXT rather than as a link:
// tapping an `https://` link opens the feed in the browser, which downloads a
// file nobody wants, while what a dancer actually needs is the string in their
// clipboard to paste into Google or Apple Calendar.
//
// `navigator.clipboard` needs a secure context and a user gesture, and it can
// still be refused (an old iOS, a locked-down browser). The failure is not
// silent: the fallback message tells the reader to select the line and copy it
// by hand, which is what they would have done anyway.

export function CalendarPanel({ url }: { url: string }) {
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function copy() {
    setMessage(null)
    setError(null)
    try {
      await navigator.clipboard.writeText(url)
      setMessage(APP_STRINGS.calendar.copied)
    } catch {
      setError(APP_STRINGS.calendar.copyFailed)
    }
  }

  return (
    <Card className="app__calendar">
      <p className="app__calendar-body">{APP_STRINGS.calendar.body}</p>
      <code className="app__calendar-url">{url}</code>
      <Button variant="ghost" onClick={copy}>
        {APP_STRINGS.calendar.copy}
      </Button>
      {message && <Note>{message}</Note>}
      {error && <Note>{error}</Note>}
    </Card>
  )
}
