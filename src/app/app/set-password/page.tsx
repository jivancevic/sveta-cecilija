import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { accessMember } from '@/lib/app/access'
import { APP_STRINGS } from '@/lib/app/strings'
import { resolveAppViewer } from '@/lib/app/viewer'
import { AppShell } from '../AppShell'
import { DeniedPage } from '../DeniedPage'
import { SetPasswordForm } from './SetPasswordForm'

// /app/set-password — "Postavi lozinku", a row in Više (#424, rewritten #463).
//
// It was the landing page of both account mails until #463: the link carried a
// token, the form spent it, and the session came out the other side. The link
// now opens the session itself (`/app/prijava`), so what is left is an optional
// convenience for a dancer who would rather type a password than wait for a
// message, reached from Više and from nowhere else.
//
// It therefore takes no `?token=` and is behind the ordinary access decision. A
// dead invitation from before this deploy lands here signed out and is sent to
// `/app/login`, which is the right ending for a link of that age anyway.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `${APP_STRINGS.setPassword.title} · ${APP_STRINGS.name}`,
  robots: { index: false, follow: false },
}

export default async function SetPasswordPage() {
  const viewer = await resolveAppViewer()
  if (!viewer.signedIn) redirect('/app/login')
  if (viewer.access.kind === 'denied') return <DeniedPage />

  return (
    <AppShell me={accessMember(viewer.access)}>
      <Link className="app__back" href="/app/vise">
        ‹ {APP_STRINGS.tabs.more}
      </Link>
      <h2 className="app__page-title">{APP_STRINGS.setPassword.title}</h2>
      <p className="app__comp-intro">{APP_STRINGS.setPassword.intro}</p>
      <SetPasswordForm />
    </AppShell>
  )
}
