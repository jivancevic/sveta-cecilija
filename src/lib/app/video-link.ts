// The *Snimka* — one video link per evening (#692).
//
// `shows.videoUrl` holds a FINISHED URL, never an id, and that is the decision
// this file exists to enforce. Two columns (`videoId` for YouTube, `videoUrl`
// for everything else) were the obvious alternative and were refused: they make
// every screen ask which of the two is filled and they admit an impossible row
// where both are. So normalisation happens HERE, at the write boundary, and
// what reaches the database is already the thing a screen links to. "Has this
// evening got a video" is then `hasVideo()` — the absence of nothing — and no
// screen parses a URL.
//
// Two shapes go in and two come out:
//
//   - A YouTube VIDEO in any shape the Share button or the address bar
//     produces becomes exactly `https://www.youtube.com/watch?v=<id>`. The
//     `?si=` token Share appends is a per-sharer tracking parameter, and it was
//     the reason to normalise at all: without this, Dora's token would be
//     stored, pushed to seventy-six phones and clicked by all of them.
//   - Anything else that is an `https://` URL is kept EXACTLY as pasted. That
//     deliberately includes a YouTube channel or playlist page: those are
//     YouTube and are not a video, so there is no id to canonicalise and
//     nothing to drop.
//
// `http://` is refused rather than upgraded. A PWA that loads mixed content
// gets a console warning and, for some resources, nothing at all, and silently
// rewriting somebody's link is a worse answer than telling them to fix it.
//
// Pure over a string, so it is table-tested without a database.

/** What a canonical YouTube watch URL starts with. The `<id>` follows. */
export const YOUTUBE_WATCH_PREFIX = 'https://www.youtube.com/watch?v='

/**
 * Longer than any YouTube URL and long enough for a signed Drive link, short
 * enough that a mis-paste of a whole e-mail does not become a database row.
 */
export const MAX_VIDEO_URL_LENGTH = 500

/**
 * `{ ok: true, url: null }` is "there is no video", which is a legitimate save:
 * it is how a link is cleared when a video comes down off YouTube. `ok: false`
 * is "that was not a link", which the route turns into a 400.
 */
export type VideoLinkRead = { ok: true; url: string | null } | { ok: false }

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
])

/** `youtu.be/<id>`, what the Share button hands out. */
const YOUTUBE_SHORT_HOSTS = new Set(['youtu.be', 'www.youtube-nocookie.com'])

/** A YouTube video id is eleven of these, and has been for the platform's life. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/** The paths that carry the id in the path rather than in `?v=`. */
const ID_IN_PATH = new Set(['live', 'shorts', 'embed', 'v'])

/**
 * The video id in a YouTube URL, or null when the URL is not a YouTube VIDEO.
 *
 * Null is not an error: a channel page, a playlist page and a search result all
 * land here, and all three are kept as plain links by the caller.
 */
function youtubeVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase()
  const segments = url.pathname.split('/').filter(Boolean)

  if (YOUTUBE_SHORT_HOSTS.has(host)) {
    const id = segments[0] ?? ''
    return VIDEO_ID.test(id) ? id : null
  }

  if (!YOUTUBE_HOSTS.has(host)) return null

  if (segments.length === 1 && segments[0] === 'watch') {
    const id = url.searchParams.get('v') ?? ''
    return VIDEO_ID.test(id) ? id : null
  }

  if (segments.length >= 2 && ID_IN_PATH.has(segments[0]!)) {
    const id = segments[1]!
    return VIDEO_ID.test(id) ? id : null
  }

  return null
}

/**
 * Read what somebody pasted into the video field.
 *
 * The only caller that matters is the save route; the sole reason this is not
 * inline there is that the five YouTube shapes deserve a table test.
 */
export function readVideoLink(value: unknown): VideoLinkRead {
  if (value == null) return { ok: true, url: null }
  if (typeof value !== 'string') return { ok: false }

  const raw = value.trim()
  if (raw === '') return { ok: true, url: null }
  if (raw.length > MAX_VIDEO_URL_LENGTH) return { ok: false }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    // Not a URL at all: "Video je na youtubeu", or a bare host with no scheme.
    return { ok: false }
  }

  // `https:` only. This also throws out `javascript:` and `data:`, which is the
  // second reason the check is a whitelist of one rather than a blacklist.
  if (url.protocol !== 'https:') return { ok: false }

  const id = youtubeVideoId(url)
  return { ok: true, url: id ? `${YOUTUBE_WATCH_PREFIX}${id}` : raw }
}

/**
 * Does this evening have a video.
 *
 * The ONE check a screen performs, and the reason the column holds a finished
 * URL: nothing downstream parses, branches on a host, or asks which of two
 * columns was filled. A whitespace-only column reads as no video, because a row
 * hand-edited in the Backoffice must not be able to draw a link to nowhere.
 */
export function hasVideo(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}
