import type { Metadata } from 'next';

export const SITE_URL = 'https://moreska.eu';
export const BRAND_LAYER = 'Moreška by HGD Sveta Cecilija';
export const TAGLINE = 'The Original Moreška, performed since 1883.';
export const ORG_LEGAL_NAME = 'HGD Sveta Cecilija';
export const DEFAULT_OG_IMAGE = '/moreska-wide.webp';

export interface SeoInput {
  title: string;
  description: string;
  path: string;
  image?: string;
}

function clampDescription(desc: string): string {
  if (desc.length <= 155) return desc;
  return desc.slice(0, 152).replace(/\s+\S*$/, '') + '…';
}

export function buildMetadata({ title, description, path, image }: SeoInput): Metadata {
  const fullTitle = `${title} | ${BRAND_LAYER}`;
  const desc = clampDescription(description);
  const url = `${SITE_URL}${path}`;
  const ogImage = image ?? DEFAULT_OG_IMAGE;
  return {
    title: fullTitle,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      siteName: BRAND_LAYER,
      title: fullTitle,
      description: desc,
      images: [{ url: `${SITE_URL}${ogImage}` }],
      locale: 'en',
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: desc,
      images: [`${SITE_URL}${ogImage}`],
    },
  };
}
