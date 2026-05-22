import { getLocale } from '@/lib/locale';
import { getDictionary } from '@/lib/i18n';
import LegalPage from '@/components/LegalPage';

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
