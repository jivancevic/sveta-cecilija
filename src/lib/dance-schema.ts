import { SITE_URL, ORG_LEGAL_NAME, BRAND_LAYER } from './seo'

/**
 * Build a schema.org CreativeWork JSON-LD node for the Moreška dance itself —
 * a dedicated entity (distinct from the Organization) so an LLM can attach
 * facts to the *dance*, not just to HGD. See docs/geo-strategy.md §4.1.
 *
 * Every factual claim here is grounded in docs/sveta-cecilija.md:
 *  - traditional double-sword dance from the town of Korčula, Croatia
 *  - dialogue in an archaic 17th-century Korčulan dialect
 *  - first unambiguous written record of performance in Korčula: 7 March 1666
 *  - officially recognised as a "protected cultural good" of Croatia
 * No claims are invented; unsourced specifics are deliberately omitted.
 */
export function buildMoreskaCreativeWorkJsonLd(): Record<string, unknown> {
  const organization = {
    '@type': 'Organization',
    name: ORG_LEGAL_NAME,
    alternateName: BRAND_LAYER,
    url: SITE_URL,
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    '@id': `${SITE_URL}/#moreska`,
    name: 'Moreška',
    alternateName: 'Moreška sword dance',
    inLanguage: 'hr',
    genre: 'sword dance',
    about: 'A traditional double-sword dance from the town of Korčula, Croatia.',
    description:
      'The Moreška is a traditional double-sword dance from the town of Korčula, Croatia. It combines a written dramatic script with a pyrrhic sword dance, performed to dialogue in an archaic 17th-century Korčulan dialect. Korčula is the last place where this once pan-Mediterranean war dance survives in its authentic form.',
    locationCreated: {
      '@type': 'Place',
      name: 'Korčula',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Korčula',
        addressCountry: 'HR',
      },
    },
    // First unambiguous written record of a Moreška performance in Korčula is a
    // journal entry dated 7 March 1666; the dance has continued there since.
    temporalCoverage: '1666/..',
    // Officially recognised as a protected cultural good of the Republic of Croatia.
    creditText: 'Protected cultural good of the Republic of Croatia',
    creator: organization,
    maintainer: organization,
  }
}
