import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Infrastructure, not a test of one feature (#679).
 *
 * Every parallel session picks its ADR number off its own base, so two
 * branches opened the same hour both call themselves 0029 — and a duplicate
 * FILENAME is not a merge conflict, so git takes both and nothing complains.
 * On 2026-09-16 that happened three times and two `0029-*.md` sat on `main`
 * for three days until a wrap session read the directory by eye. The
 * convention ("re-check the number against origin/main before you push") is
 * written in `docs/agents/worktree-dev.md`; this is what the convention lacked,
 * a check that runs. It lives in `vitest` rather than a workflow of its own
 * because `vitest` is already a required check and a new job is one more thing
 * to keep required — which is also why `ci.yml`'s docs-only skip has one
 * exception for `docs/adr/`: an ADR PR is docs-only, and a guard that is
 * skipped on the PR that adds the duplicate would fire on the next innocent
 * code PR instead.
 *
 * The second assertion is the other half of a renumber: a `sed` on paths
 * leaves the file's own `# ADR-NNNN:` heading saying the old number, which
 * reads correctly and lies. Link labels elsewhere are not checked here.
 */

const ADR_DIR = path.resolve(__dirname, '../../docs/adr')
const FILENAME = /^(\d{4})-[a-z0-9-]+\.md$/

/**
 * Every entry, not only `*.md`: a `0031-x.MD` or a `0032-x.md.bak` would
 * otherwise never reach the shape check and could carry a duplicate number
 * unseen. The shape assertion is what refuses them, by name.
 */
function adrFiles(): string[] {
  return readdirSync(ADR_DIR)
    .filter((name) => !name.startsWith('.'))
    .sort()
}

describe('docs/adr', () => {
  const files = adrFiles()

  it('holds something to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('names every file NNNN-kebab-slug.md', () => {
    const offenders = files.filter((name) => !FILENAME.test(name))
    expect(offenders, 'ADR files outside the NNNN-slug.md shape').toEqual([])
  })

  it('gives each number to exactly one file', () => {
    const byNumber = new Map<string, string[]>()
    for (const name of files) {
      const m = FILENAME.exec(name)
      if (!m) continue
      byNumber.set(m[1], [...(byNumber.get(m[1]) ?? []), name])
    }
    const duplicates = [...byNumber.entries()].filter(([, names]) => names.length > 1)
    expect(
      duplicates,
      'two ADRs hold the same number — renumber the one that merged second (worktree-dev.md, "An ADR number is not yours until it merges")',
    ).toEqual([])
  })

  it('starts each file with a heading that carries its own number', () => {
    const mismatches: string[] = []
    for (const name of files) {
      const m = FILENAME.exec(name)
      if (!m) continue
      const firstLine = readFileSync(path.join(ADR_DIR, name), 'utf-8').split('\n')[0] ?? ''
      if (!firstLine.startsWith(`# ADR-${m[1]}:`)) {
        mismatches.push(`${name} → ${JSON.stringify(firstLine)}`)
      }
    }
    expect(mismatches, 'first line must be "# ADR-NNNN: …" with the filename\'s number').toEqual([])
  })
})
