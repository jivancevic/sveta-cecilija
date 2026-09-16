// Which skin Cecilija wears, and where that choice is kept (#569, decision Q21).
//
// T1 (#562) shipped both skins as tokens — light on `.app`, night on
// `.app[data-theme="dark"]` — and left the switch to this ticket. So most of
// what follows is about ONE attribute on the `.app` root and the three words a
// person may choose between. #670 added a second write, on `<html>`, for a
// reader that is not our CSS at all: see `ROOT_SCHEME_STYLE_KEY`.
//
// **Three states, not two.** "Kao sustav" is the default, because a phone that
// is already in night mode should not hand a dancer a white screen at the door
// on their first open. The other two are a deliberate override: a volunteer
// working a lit foyer with the phone in "always dark" wants the paper skin, and
// a system setting cannot know that.
//
// **Per device, never per account.** Which skin to wear is a fact of the phone
// in the hand — its brightness, where it is being read, whether it is the
// dancer's own — and a shared login (`tehnika` on a wall, `member` in an
// office) has no single answer at all. So `localStorage`, one key, and nothing
// on `Users`.
//
// **The choice is applied before the first paint**, by `THEME_BOOT_SCRIPT`
// inline in the route group's layout. A React effect would run after hydration,
// which on a slow phone is a white flash and then a dark screen. That script
// and the component that writes the key read the same three exports, so the
// boot and the switch cannot disagree about what a stored value means.
//
// Pure: no `window`, no `document`. The browser work lives in `ThemeSwitch`.

/** The one localStorage key. Per device, per browser profile, per origin. */
export const THEME_STORAGE_KEY = 'cecilija.theme'

/** The attribute the tokens key off, on `.app` (the `<body>`). */
export const THEME_ATTRIBUTE = 'data-theme'

/**
 * The CSSOM key for `color-scheme`, which is the one property Android reads to
 * decide whether to repaint the page in its own dark theme (#670).
 *
 * A style KEY, not an attribute name and not the CSS spelling: `THEME_ATTRIBUTE`
 * above goes through `setAttribute` and is written as it appears in HTML, this
 * one is an `element.style` property and is therefore camelCase. It has to sit
 * on the root, which is the one element `data-theme` is deliberately NOT on.
 */
export const ROOT_SCHEME_STYLE_KEY = 'colorScheme'

/**
 * What to write there for a resolved skin, and the word `only` is the whole
 * point (#670).
 *
 * Chrome's Auto Dark Theme documents exactly two opt-outs, and both spell it
 * `only light`: a bare `color-scheme: light` declares which scheme the page
 * uses without refusing the repaint, so it would have left the bug in place
 * while looking like a fix. `only dark` is the same statement for the night
 * skin — a page that says it is dark is not auto-darkened either, but saying it
 * the same way in both directions means the rule has no second case to forget.
 *
 * https://developer.chrome.com/blog/auto-dark-theme
 */
export function rootColorScheme(resolved: ResolvedTheme): string {
  return `only ${resolved}`
}

/** What a person chooses. `system` follows the phone; `light` is the default. */
export type ThemePreference = 'system' | 'light' | 'dark'

/** What the attribute ends up saying. `system` is resolved away before that. */
export type ResolvedTheme = 'light' | 'dark'

/** The three, in the order the control offers them. */
export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system']

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

/**
 * A stored value as the app reads it.
 *
 * Deliberately lenient, like `tabKeysOf`: a key can hold anything a previous
 * version wrote or a person typed into their own devtools, and the honest
 * answer to a word we do not know is the default rather than a crash on the way
 * into the app.
 *
 * **The default is `light`, not `system`** (#633). Cecilija is read at a
 * rehearsal and on a stage at night, and the dark palette was never the one the
 * screens were drawn against, so a phone left on dark was handing most of the
 * society a skin nobody designed for. A stored choice still wins, `system` very
 * much included: the fallback is what an account that has never opened Profil
 * gets, and nothing else.
 */
export function readThemePreference(raw: string | null | undefined): ThemePreference {
  return isThemePreference(raw) ? raw : 'light'
}

/**
 * The attribute's value: the choice, or the phone's own answer for "Kao
 * sustav".
 *
 * `light` is written out rather than left off. The tokens treat a missing
 * attribute as light anyway, so both would look the same, but a written value
 * is a state a person (or a test) can read back off the element.
 */
export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference
  return prefersDark ? 'dark' : 'light'
}

/** The media query "Kao sustav" listens to, spelled once. */
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

/**
 * The no-flash script, inline in `/app`'s layout, above everything it renders.
 *
 * It is built from the constants above so that a renamed key renames itself
 * here too. Everything it touches is wrapped in one try: a private window with
 * storage blocked must still get its screen, in the default skin.
 *
 * It runs inside `<body>`, so `document.body` exists by the time it executes,
 * which is what lets it write the attribute on the element the tokens live on
 * rather than on `<html>`.
 *
 * **It reads three cases, not two** (#633): `light` and `dark` are the choice
 * itself, the word `system` is the one value that still asks the phone, and
 * anything else (an empty key, a word from an older version) is the default,
 * which is `light`. Collapsing the last two would take "Kao sustav" away from
 * everybody who had chosen it, which is the opposite of what the default change
 * was for. `readThemePreference` and `resolveTheme` compose to the same answer;
 * this is those two rules written once more in ES5 for the first paint.
 *
 * **It writes the answer in TWO places** (#670): `data-theme` on the body, which
 * is where the tokens live, and `color-scheme: only <skin>` on `<html>`, which
 * is where Android looks — `only` being what turns a declaration into a refusal
 * ({@link rootColorScheme}). Chrome on Android repaints a page in its own dark theme unless
 * the document says which schemes it handles, and it asks the ROOT element — so
 * `color-scheme: light` declared on `.app` (the body, `app.css`) never counted.
 * The app was drawing its light skin correctly and the phone was inverting it,
 * which is why Profil could show "Svijetla" over a black screen and why none of
 * the three choices appeared to do anything. The stylesheet carries the same
 * rule for a page whose script never ran; this is the copy that beats the first
 * paint. The body is written FIRST: if a browser were to refuse one of the two,
 * the tokens matter more than the canvas.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var v=localStorage.getItem('${THEME_STORAGE_KEY}');var d=window.matchMedia&&window.matchMedia('${DARK_MEDIA_QUERY}').matches;var t=(v==='light'||v==='dark')?v:(v==='system'?(d?'dark':'light'):'light');document.body.setAttribute('${THEME_ATTRIBUTE}',t);document.documentElement.style.${ROOT_SCHEME_STYLE_KEY}='only '+t}catch(e){}})()`
