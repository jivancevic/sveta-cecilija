import { describe, expect, it } from 'vitest'
import { hasVideo, readVideoLink, YOUTUBE_WATCH_PREFIX } from './video-link'

const canonical = (id: string) => `${YOUTUBE_WATCH_PREFIX}${id}`

const ID = 'aBcD1234_-x'

describe('readVideoLink — the empty answer', () => {
  it('reads an absent, null or blank value as "no video"', () => {
    for (const value of [undefined, null, '', '   ', '\n\t']) {
      expect(readVideoLink(value)).toEqual({ ok: true, url: null })
    }
  })

  it('refuses a value that is not text at all', () => {
    for (const value of [7, true, {}, [], () => {}]) {
      expect(readVideoLink(value)).toEqual({ ok: false })
    }
  })
})

describe('readVideoLink — a YouTube video becomes one canonical URL', () => {
  it('normalises every shape the Share button and the address bar produce', () => {
    const shapes = [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://music.youtube.com/watch?v=${ID}`,
    ]
    for (const shape of shapes) {
      expect(readVideoLink(shape)).toEqual({ ok: true, url: canonical(ID) })
    }
  })

  it('drops the Share token and the timestamp, which is the whole point', () => {
    expect(readVideoLink(`https://youtu.be/${ID}?si=AbCdEf-1234&t=42`)).toEqual({
      ok: true,
      url: canonical(ID),
    })
    expect(readVideoLink(`https://www.youtube.com/watch?v=${ID}&t=42s&si=xyz`)).toEqual({
      ok: true,
      url: canonical(ID),
    })
    expect(readVideoLink(`https://www.youtube.com/live/${ID}?si=xyz&feature=share`)).toEqual({
      ok: true,
      url: canonical(ID),
    })
  })

  it('drops a playlist a watch link happened to be opened from', () => {
    expect(readVideoLink(`https://www.youtube.com/watch?v=${ID}&list=PL123&index=4`)).toEqual({
      ok: true,
      url: canonical(ID),
    })
  })

  it('normalises an already canonical URL to itself, so a re-save is a no-op', () => {
    expect(readVideoLink(canonical(ID))).toEqual({ ok: true, url: canonical(ID) })
  })

  it('trims what was pasted with whitespace around it', () => {
    expect(readVideoLink(`  https://youtu.be/${ID}  `)).toEqual({ ok: true, url: canonical(ID) })
  })
})

describe('readVideoLink — anything else that is a link is kept as pasted', () => {
  it('keeps a non-YouTube https link untouched, query string and all', () => {
    const url = 'https://drive.google.com/file/d/1AbC/view?usp=sharing'
    expect(readVideoLink(url)).toEqual({ ok: true, url })
  })

  it('keeps a YouTube page that is not a video as a plain link', () => {
    // A channel and a playlist are YouTube and are not a video, so there is no
    // id to canonicalise and nothing to drop. Q9: "if it is not a YT video,
    // then a plain link."
    const channel = 'https://www.youtube.com/@hgdsvetacecilija'
    const playlist = 'https://www.youtube.com/playlist?list=PL123'
    expect(readVideoLink(channel)).toEqual({ ok: true, url: channel })
    expect(readVideoLink(playlist)).toEqual({ ok: true, url: playlist })
  })

  it('does not mistake an 11-character-looking path on another host for a video', () => {
    const url = 'https://vimeo.com/aBcD1234_-x'
    expect(readVideoLink(url)).toEqual({ ok: true, url })
  })
})

describe('readVideoLink — what it refuses', () => {
  it('refuses http, because a PWA must not load mixed content', () => {
    expect(readVideoLink(`http://www.youtube.com/watch?v=${ID}`)).toEqual({ ok: false })
    expect(readVideoLink('http://example.com/a.mp4')).toEqual({ ok: false })
  })

  it('refuses a scheme that is not http(s) at all', () => {
    expect(readVideoLink('javascript:alert(1)')).toEqual({ ok: false })
    expect(readVideoLink('data:text/html,<p>hi')).toEqual({ ok: false })
    expect(readVideoLink('ftp://example.com/a.mp4')).toEqual({ ok: false })
  })

  it('refuses text that is not a link, which is what a mis-paste looks like', () => {
    expect(readVideoLink('Video je na youtubeu')).toEqual({ ok: false })
    expect(readVideoLink('youtube.com/watch?v=abc')).toEqual({ ok: false })
    expect(readVideoLink('www.youtube.com')).toEqual({ ok: false })
  })

  it('refuses a link longer than the column is meant to hold', () => {
    expect(readVideoLink(`https://example.com/${'a'.repeat(1000)}`)).toEqual({ ok: false })
  })
})

describe('hasVideo is the absence of nothing', () => {
  it('is the one check a screen performs', () => {
    expect(hasVideo(canonical(ID))).toBe(true)
    expect(hasVideo('https://drive.google.com/x')).toBe(true)
    expect(hasVideo(null)).toBe(false)
    expect(hasVideo(undefined)).toBe(false)
    expect(hasVideo('')).toBe(false)
    expect(hasVideo('   ')).toBe(false)
  })
})
