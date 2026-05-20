import { getLocale } from '@/lib/locale';
import { getDictionary } from '@/lib/i18n';
import LegalPage from '@/components/LegalPage';

export default async function PrivacyPolicyPage() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  return (
    <LegalPage
      locale={locale}
      dict={dict}
      page={dict.privacyPage}
      heroImage="/moreska-wide.jpg"
    />
  );
}
