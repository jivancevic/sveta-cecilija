'use client'

import Link from 'next/link'
import { APP_STRINGS } from '@/lib/app/strings'

// The one control above the list (#510).
//
// A plain GET `<form>`, the shape Narudžbe and Upiti use: with JavaScript off
// it still searches, and the search is an ADDRESS, so a reload keeps it and the
// back button undoes it. One box rather than a filter row, because there are
// eighteen accounts and the only question anybody asks of them is "which row is
// this person".

const S = APP_STRINGS.users

export function UsersSearch({ q }: { q: string }) {
  return (
    <form className="app__users-search" action="/app/users" method="get">
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
          button: it goes where it says it goes. */}
      {q.trim() !== '' && (
        <Link className="app__users-clear" href="/app/users">
          {S.clear}
        </Link>
      )}
    </form>
  )
}
