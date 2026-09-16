'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { nextSearch } from '@/lib/app/screen-state'
import { APP_STRINGS } from '@/lib/app/strings'

// The one control above the list (#510).
//
// A GET `<form>` whose action is the address it produces: with JavaScript off
// it still searches, and the search is an ADDRESS, so a reload keeps it and a
// link to it is a link to this view. One box rather than a filter row, because
// there are eighteen accounts and the only question anybody asks of them is
// "which row is this person".
//
// **It REPLACES rather than pushes** (#666, ADR-0030 rule 1). It used to submit
// natively, and its own comment used to call "the back button undoes it" a
// feature — which it is not: a search is a filter, and Back is for leaving the
// screen, not for walking back through the three things the reader tried. The
// submit is intercepted for that and for nothing else, so the no-JavaScript
// path is untouched and still pushes, which is the right trade for a fallback
// nobody here actually runs.

const S = APP_STRINGS.users

export function UsersSearch({ q }: { q: string }) {
  const router = useRouter()

  return (
    <form
      className="app__users-search"
      action="/app/users"
      method="get"
      onSubmit={(event) => {
        event.preventDefault()
        const term = new FormData(event.currentTarget).get('q')
        const search = nextSearch('', { q: typeof term === 'string' ? term : '' })
        router.replace(`/app/users${search}`, { scroll: false })
      }}
    >
      <label className="app__users-search-field">
        <span className="app__sr-only">{S.searchLabel}</span>
        <input
          type="search"
          name="q"
          className="app__input"
          defaultValue={q}
          placeholder={S.searchPlaceholder}
          autoComplete="off"
          autoCapitalize="off"
          enterKeyHint="search"
        />
      </label>

      {/* A ghost, not the gold: the loud button on this screen is "Novi
          korisnik", and a search that shouts over it is the wrong emphasis
          (#573). Still a real submit, so the form works with no JavaScript. */}
      <button type="submit" className="ui-btn ui-btn--ghost">
        {S.searchPlaceholder}
      </button>

      {/* A way back to the whole list as an address rather than a reset
          button: it goes where it says it goes. `replace` for the same reason
          the submit does — clearing a search is not a place to come back to. */}
      {q.trim() !== '' && (
        <Link className="app__users-clear" href="/app/users" replace scroll={false}>
          {S.clear}
        </Link>
      )}
    </form>
  )
}
