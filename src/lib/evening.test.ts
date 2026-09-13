import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import hr from '@/messages/hr.json';
import { eveningFacts } from '@/lib/evening';

/**
 * The copy rules for this block are a decision (#541, CONTEXT.md "Evening
 * structure"), not a matter of taste, and they are the kind of rule an edit
 * undoes by accident: a per-part minute count, a precise runtime, a third act.
 * tsc sees none of it, so assert the rules here.
 */
describe('evening copy', () => {
  const locales = { en: en.evening, hr: hr.evening };

  for (const [locale, evening] of Object.entries(locales)) {
    const all = eveningFacts(evening).join(' ');

    it(`${locale} tells exactly the three facts, in order`, () => {
      expect(eveningFacts(evening)).toEqual([evening.runtime, evening.parts, evening.seating]);
    });

    it(`${locale} gives no duration in minutes and no precise runtime`, () => {
      // "about an hour" / "otprilike sat vremena", never "60 min", never "1 hour".
      expect(all).not.toMatch(/\d+\s*(min|minut)/i);
      expect(all).not.toMatch(/\b1\s*(hour|sat)\b/i);
    });

    it(`${locale} names the klapa and the orchestra in the parts sentence`, () => {
      expect(evening.parts.toLowerCase()).toContain('klapa');
      expect(evening.parts.toLowerCase()).toMatch(/orchestra|orkestar/);
    });

    it(`${locale} uses no em dash in guest-facing copy`, () => {
      expect(all + evening.label).not.toContain('—');
    });
  }

  it('keeps the Croatian dance lowercase mid-sentence', () => {
    // CONTEXT.md: "moreška" is a common noun in Croatian; uppercase only when it
    // opens a sentence, which it does not here.
    expect(hr.evening.parts).toContain('moreška');
    expect(hr.evening.parts).not.toContain('Moreška');
  });

  it('states the runtime as "about an hour" in both locales', () => {
    expect(en.evening.runtime.toLowerCase()).toContain('about an hour');
    expect(hr.evening.runtime.toLowerCase()).toContain('otprilike sat');
  });

  it('has dropped the schedule line the block replaces', () => {
    // Two blocks saying the same thing on one page is the failure mode #542
    // exists to avoid, so the old venue-details line must be gone, not parked.
    expect(en.performancesPage).not.toHaveProperty('venueDetails');
    expect(hr.performancesPage).not.toHaveProperty('venueDetails');
  });
});
