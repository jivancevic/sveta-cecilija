import { Play } from 'lucide-react'
import { APP_STRINGS } from '@/lib/app/strings'

// The ▶︎ beside a past evening's meta line (#692).
//
// Deliberately NOT an emoji. Cecilija's emoji carry learned meanings — 📲 🔔 🔑
// on Članovi, ⚫🔴 the armies, 🔥 the Niz — and 🎬 would be a sixth glyph to
// memorise; a play mark needs no learning. Drawn as the same lucide icon every
// other mark on these screens is, rather than as the literal character, so it
// inherits the icon sizing and the theme's colour instead of whatever the
// system font decides ▶︎ looks like today.
//
// It carries an accessible NAME rather than being appended to the meta string,
// which is the reason the row types carry `hasVideo` as a boolean: a glyph
// stuffed into a plain string is read out as a glyph, and a reader on a screen
// reader would hear the character instead of "ima video".
//
// It is a mark and not a link. The row it sits on already opens the evening,
// and the video is watched from there — a second tap target inside a 72px row
// is how a thumb opens the wrong thing.

export function VideoMark() {
  return (
    <Play className="app__video-mark" size={13} aria-label={APP_STRINGS.video.mark} role="img" />
  )
}

/**
 * A meta line with the mark on the end, or the meta line untouched.
 *
 * Three lists ask this — Moreška's past rows, Izvedbe's, and the season
 * profile's — and the separator belongs in ONE place. Each of them builds its
 * meta by joining with " · ", so the mark joins the same way rather than three
 * screens each deciding whether there is a dot in front of it.
 */
export function MetaWithVideo({
  meta,
  hasVideo,
}: {
  meta: React.ReactNode
  hasVideo: boolean
}) {
  if (!hasVideo) return <>{meta}</>
  return (
    <>
      {meta}
      {' · '}
      <VideoMark />
    </>
  )
}
