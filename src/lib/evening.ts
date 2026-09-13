import type { Dictionary } from '@/lib/i18n';

/**
 * The three facts a guest needs before the evening: how long it runs, what the
 * two parts are and in which order, and that a seat is taken rather than given.
 *
 * One dictionary namespace feeds the schedule page, the post-payment receipt and
 * (from #543) the ticket e-mail, so the sentences are literally the same in all
 * three places instead of being kept in step by hand (#541, decision 1).
 */
export type EveningCopy = Dictionary['evening'];

/**
 * The facts in the order they are always told: runtime, then the parts, then the
 * seating. Every surface reads the order from here, so a receipt cannot end up
 * telling the evening differently from the schedule page.
 */
export const eveningFacts = (t: EveningCopy): string[] => [t.runtime, t.parts, t.seating];
