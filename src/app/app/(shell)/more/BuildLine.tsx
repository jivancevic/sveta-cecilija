'use client'

import { useState } from 'react'
import { APP_STRINGS } from '@/lib/app/strings'

// The tappable build line at the foot of Više (#637).
//
// A button rather than a paragraph, because the sha is the one string on this
// screen that somebody has to get to somebody else and it is the worst possible
// string to transcribe: seven characters carrying `0`/`O` and `b`/`6`, which is
// what CONTEXT.md's temporary-password alphabet exists to avoid. So a tap puts
// it on the clipboard, ready for an SMS.
//
// The WHOLE line is copied, not the bare sha. `ad0eb9c` alone in a message reads
// as a typo; "Cecilija · ad0eb9c" says what it is.
//
// `navigator.clipboard` needs a secure context and a user gesture, and it can
// still be refused (an old iOS, a locked-down browser). The failure is not
// silent: the message tells the reader to select the line and copy it by hand,
// which is what they would have done anyway. Same shape as `CalendarPanel`.
//
// Outside a deploy there is no sha, so the line is the app's name alone and
// there is nothing worth copying: it renders as plain text and the tap target
// goes away rather than sitting there copying the word "Cecilija".

export function BuildLine({ line, copyable }: { line: string; copyable: boolean }) {
  const [message, setMessage] = useState<string | null>(null)

  if (!copyable) return <p>{line}</p>

  async function copy() {
    try {
      await navigator.clipboard.writeText(line)
      setMessage(APP_STRINGS.more.buildCopied)
    } catch {
      setMessage(APP_STRINGS.more.buildCopyFailed)
    }
  }

  return (
    <>
      <button
        type="button"
        className="app__build-line"
        onClick={copy}
        aria-label={`${APP_STRINGS.more.buildCopy}: ${line}`}
      >
        {line}
      </button>
      {/* Polite rather than assertive: a confirmation should not interrupt a
          screen reader mid-sentence. */}
      <p className="app__build-copied" aria-live="polite">
        {message}
      </p>
    </>
  )
}
