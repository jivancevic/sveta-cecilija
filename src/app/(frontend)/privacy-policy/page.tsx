import { getLocale } from '@/lib/locale';
import { getDictionary } from '@/lib/i18n';
import LegalPage from '@/components/LegalPage';
import { buildMetadata } from '@/lib/seo';

export function generateMetadata() {
  return buildMetadata({
    title: 'Privacy Policy',
    description: 'How HGD Sveta Cecilija collects, uses, and protects your personal data. GDPR-compliant.',
    path: '/privacy-policy',
  });
}

export default async function PrivacyPolicyPage() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  return (
    <LegalPage
      locale={locale}
      dict={dict}
      page={dict.privacyPage}
      heroImage="/moreska-wide.webp"
    />
  );
}
