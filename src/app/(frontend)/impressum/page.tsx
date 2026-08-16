import { getLocale } from '@/lib/locale';
import { getDictionary } from '@/lib/i18n';
import LegalPage from '@/components/LegalPage';
import { buildMetadata } from '@/lib/seo';

export function generateMetadata() {
  return buildMetadata({
    title: 'Impressum',
    description:
      'Legal identity of the operator of moreska.eu: HRVATSKO GLAZBENO DRUŠTVO SV.CECILIJA - KORČULA, OIB 52537805408, Knežev prolaz 1, 20260 Korčula, Croatia.',
    path: '/impressum',
  });
}

export default async function ImpressumPage() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);

  return (
    <LegalPage
      locale={locale}
      dict={dict}
      page={dict.impressumPage}
      heroImage="/moreska-wide.webp"
    />
  );
}
