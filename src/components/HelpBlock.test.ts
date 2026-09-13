import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import hr from '@/messages/hr.json';

// HelpBlock builds the mailto link by splitting `body` on the {email} placeholder.
// If a locale loses the placeholder the address stops being a link, and if it gains
// a second one the tail of the sentence is dropped, both silently and in one language
// only. tsc cannot see either, so assert it here.
describe('help copy', () => {
  const locales = { en: en.help, hr: hr.help };

  for (const [locale, help] of Object.entries(locales)) {
    it(`${locale} body carries exactly one {email} placeholder`, () => {
      expect(help.body.split('{email}')).toHaveLength(2);
    });

    it(`${locale} copy advertises no phone path`, () => {
      const all = [help.heading, help.body, help.orderHint, help.email].join(' ');
      expect(all).not.toMatch(/tel:|\+385|\d{3}[\s/-]?\d{3,}/);
    });
  }

  it('both locales point at the same address', () => {
    expect(hr.help.email).toBe(en.help.email);
    expect(en.help.email).toBe('info@moreska.eu');
  });
});
