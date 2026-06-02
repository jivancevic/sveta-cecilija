import { getLocale } from '@/lib/locale';
import { getDictionary } from '@/lib/i18n';
import LegalPage from '@/components/LegalPage';
import { buildMetadata } from '@/lib/seo';

export function generateMetadata() {
  return buildMetadata({
    title: 'Refund Policy',
    description:
      'When HGD Sveta Cecilija ticket purchases can and cannot be refunded, how refunds are processed via Stripe, and what happens when a performance is cancelled or moved.',
    path: '/refund-policy',
  });
}

export default async function RefundPolicyPage() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  return (
    <LegalPage
      locale={locale}
      dict={dict}
      page={dict.refundPage}
      heroImage="/moreska-wide.webp"
    />
  );
}
