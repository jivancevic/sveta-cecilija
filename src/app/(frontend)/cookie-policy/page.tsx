import { getLocale } from '@/lib/locale';
import { getDictionary } from '@/lib/i18n';
import LegalPage from '@/components/LegalPage';
import { buildMetadata } from '@/lib/seo';

export function generateMetadata() {
  return buildMetadata({
    title: 'Cookie Policy',
    description: 'What cookies moreska.eu uses and how to manage your preferences.',
    path: '/cookie-policy',
  });
}

export default async function CookiePolicyPage() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  return (
    <LegalPage
      locale={locale}
      dict={dict}
      page={dict.cookiePage}
      heroImage="/klapa-todor.webp"
    />
  );
}
