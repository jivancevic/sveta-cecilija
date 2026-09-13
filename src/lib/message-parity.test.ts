import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import hr from '@/messages/hr.json';

/**
 * Infrastructure, not a test of one feature.
 *
 * `Dictionary` is inferred from `en.json` alone (`src/lib/i18n.ts`), so a key
 * added in English and forgotten in Croatian type-checks, builds, ships, and
 * then renders `undefined` to a Croatian guest. The reverse, a key that outlives
 * its English twin, is dead weight nobody notices. Nothing else in CI compares
 * the two files, which is why #542's shared `evening` block asked for this.
 *
 * Every locale-pair test belongs here rather than beside the feature that
 * happened to add the key.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/**
 * Flatten to `path:kind` entries. The kind is part of the entry on purpose: a
 * string in one file and an object in the other is the same class of breakage as
 * a missing key, and an array that lost an element shows up as a missing index.
 */
function shape(value: Json, path = ''): string[] {
  if (Array.isArray(value)) {
    return [`${path}:array`, ...value.flatMap((item, i) => shape(item, `${path}[${i}]`))];
  }
  if (value !== null && typeof value === 'object') {
    return [
      `${path}:object`,
      ...Object.entries(value).flatMap(([key, item]) => shape(item, path ? `${path}.${key}` : key)),
    ];
  }
  return [`${path}:${value === null ? 'null' : typeof value}`];
}

describe('message files', () => {
  const enShape = shape(en as Json);
  const hrShape = shape(hr as Json);

  it('carry the same key paths, with the same shape, in both locales', () => {
    const inHr = new Set(hrShape);
    const inEn = new Set(enShape);
    expect(enShape.filter((entry) => !inHr.has(entry)), 'missing from hr.json').toEqual([]);
    expect(hrShape.filter((entry) => !inEn.has(entry)), 'missing from en.json').toEqual([]);
  });

  it('name the same support mailbox in both locales', () => {
    // #383 decided support is one address. Two files drifting to two addresses
    // would send half the buyers somewhere nobody reads, and the shape check
    // above cannot see it, because both sides would still be strings.
    expect(hr.help.email).toBe(en.help.email);
  });

  it('leave no string empty in either locale', () => {
    const blanks = (shapes: string[], source: Json, locale: string) =>
      shapes
        .filter((entry) => entry.endsWith(':string'))
        .map((entry) => entry.slice(0, entry.lastIndexOf(':')))
        .filter((path) => read(source, path) === '')
        .map((path) => `${locale}:${path}`);

    expect([...blanks(enShape, en as Json, 'en'), ...blanks(hrShape, hr as Json, 'hr')]).toEqual([]);
  });
});

/** Read a `a.b[0].c` path produced by `shape` back out of the parsed JSON. */
function read(source: Json, path: string): Json | undefined {
  let current: Json | undefined = source;
  for (const step of path.split(/\.|\[(\d+)\]/).filter(Boolean)) {
    if (current === null || typeof current !== 'object') return undefined;
    current = Array.isArray(current) ? current[Number(step)] : current[step];
  }
  return current;
}
