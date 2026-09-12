import Link from 'next/link'
import { APP_STRINGS } from '@/lib/app/strings'
import { LogoutButton } from './LogoutButton'

// "Nemate pristup" (#419, story 37), shared by the three tab pages (#457).
//
// A wrong bookmark should explain itself rather than show a blank screen, and
// the explanation is the same wherever the bookmark pointed — so it is one
// component rather than one copy per page. It carries NO tab bar: a bar offering
// two more doors to the same refusal would only invite tapping them.

export function DeniedPage() {
  return (
    <main className="app__panel">
      <h1>{APP_STRINGS.denied.title}</h1>
      <p>{APP_STRINGS.denied.body}</p>
      <p>
        <Link className="app__link" href="/admin">
          {APP_STRINGS.denied.adminLink}
        </Link>
      </p>
      <LogoutButton className="app__button" />
    </main>
  )
}
