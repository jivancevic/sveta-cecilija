'use client'

import { useCallback, useState } from 'react'
import { chromeIntentUrl } from '@/lib/app/platform'
import { APP_STRINGS } from '@/lib/app/strings'

// The way into Chrome, in one implementation (#668, shared by #684).
//
// Two surfaces hand somebody the same route — the install guide's Android
// section, and Početna's reinstall card — and they hand it over the same way:
// an `intent://` link that opens Chrome and nothing else, with a copy button
// beside it, because a browser that does not understand the scheme does
// nothing at all, silently. `moreskant-app.md` asks for exactly this ("there
// is no second set of install copy anywhere in `/app`") and the first cut of
// #684 had two, with two spellings of the copy failure.
//
// The address is `/app/install`, never `/app`: Chrome is a different browser
// with no session in it, so `/app` there is the login screen and nobody
// installs from a login screen. `/app/install` is one of the two `/app` pages
// deliberately outside the access decision, which is the property this needs.
//
// The look is named rather than passed in, because there are two surfaces and
// they are built out of different kits: the guide predates the design system's
// Button and wears `app__button`, the card is a `Card` full of `ui-btn`s. A
// third caller would rather add a name here than invent a fourth spelling.

const S = APP_STRINGS.install

const LOOKS = {
  guide: { actions: 'app__hint-actions', button: 'app__button app__button--small' },
  card: { actions: 'ui-btns', button: 'ui-btn ui-btn--ghost' },
} as const

export interface ChromeRouteProps {
  look: keyof typeof LOOKS
  /** How this surface draws a line of its own text under the two controls. */
  renderNote: (text: string) => React.ReactNode
  /** Anything else belonging in the same row of controls, such as "Kasnije". */
  children?: React.ReactNode
}

export function ChromeRoute({ look, renderNote, children }: ChromeRouteProps) {
  /** `null` while nothing has been copied; the sentence to show once it has. */
  const [note, setNote] = useState<string | null>(null)

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/app/install`)
      setNote(S.chromeCopied)
    } catch {
      // A blocked clipboard is not a dead end: the address is short and the
      // reader is holding the phone it is on.
      setNote(S.failed)
    }
  }, [])

  const chromeUrl = chromeIntentUrl(`${window.location.origin}/app/install`)
  const { actions, button } = LOOKS[look]

  return (
    <>
      {note !== null && renderNote(note)}
      <div className={actions}>
        {/* A plain anchor, deliberately: `intent://` is Android's, Next's Link
            would try to route it, and a browser that does not understand it
            must simply do nothing rather than throw. */}
        {chromeUrl && (
          <a className={button} href={chromeUrl}>
            {S.chromeOpen}
          </a>
        )}
        <button
          type="button"
          className={button}
          onClick={() => {
            void copy()
          }}
        >
          {S.chromeCopy}
        </button>
        {children}
      </div>
    </>
  )
}
