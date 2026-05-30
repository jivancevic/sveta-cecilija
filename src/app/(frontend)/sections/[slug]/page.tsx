import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getLocale } from '@/lib/locale';
import { getDictionary } from '@/lib/i18n';
import { SECTION_PAGE_META } from '@/lib/data';
import Nav from '@/components/Nav';
import PageHero from '@/components/PageHero';
import Footer from '@/components/Footer';
import { buildMetadata } from '@/lib/seo';

const SLUGS = Object.keys(SECTION_PAGE_META);

export function generateStaticParams() {
  return SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = SECTION_PAGE_META[slug];
  if (!meta) return {};
  const dict = await getDictionary('en');
  const t = dict.sectionPages;
  const section = t[meta.sectionKey as keyof typeof t] as Record<string, string>;
  return buildMetadata({
    title: section.heroHeadline,
    description: section.heroSubtitle,
    path: `/sections/${slug}`,
    image: meta.image,
  });
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = SECTION_PAGE_META[slug];
  if (!meta) notFound();

  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.sectionPages;
  const section = t[meta.sectionKey as keyof typeof t] as Record<string, string>;

  return (
    <div className="inner-page t-stone">
      <Nav locale={locale} t={dict.nav} variant="inner" />

      <PageHero
        headline={section.heroHeadline}
        subtitle={section.heroSubtitle}
        image={meta.image}
      />

      <section style={{ background: 'var(--light)', padding: 'var(--pad) var(--sectionPadX)' }}>
        <div style={{ maxWidth: 'var(--maxW)', margin: '0 auto' }}>
          <a href="/#secs" className="sp-back">{t.backLink}</a>

          {meta.sectionKey === 'moreska' && (
            <MoreskaContent t={section} />
          )}
          {(meta.sectionKey === 'band' || meta.sectionKey === 'klapa') && (
            <TwoBodyContent t={section} />
          )}
          {meta.sectionKey === 'choir' && (
            <ChoirContent t={section} />
          )}
        </div>
      </section>

      <div
        className="ip-cta"
        style={meta.sectionKey === 'moreska' ? {
          backgroundImage:
            'linear-gradient(rgba(20,16,11,0.62), rgba(20,16,11,0.62)), url(/moreskanti-cool.webp)',
          backgroundSize: 'cover',
          // Wide-short band on laptop crops top/bottom; bias the crop upward so the
          // upper part of the photo (the dancers' faces) stays in frame, not the pavement.
          backgroundPosition: 'center 20%',
        } : undefined}
      >
        <h2 className="ip-cta__h serif">{t.ctaHeadline}</h2>
        <p className="ip-cta__body">{t.ctaBody}</p>
        <a href="/#sched" className="btn btn--primary">{t.ctaButton}</a>
      </div>

      <Footer locale={locale} t={dict.footer} />
    </div>
  );
}

function MoreskaContent({ t }: { t: Record<string, string> }) {
  return (
    <>
      <div className="sp-lead">
        <p>{t.lead}</p>
      </div>
      <div className="sp-zigzag">
        <div className="sp-zz">
          <div className="sp-zz__photo">
            <Image src="/bula.webp" alt="Moreška dancer in costume" fill sizes="(min-width: 768px) 45vw, 90vw" />
          </div>
          <div className="sp-block sp-zz__body">
            <h3>{t.storyHeadline}</h3>
            <p>{t.storyBody}</p>
          </div>
        </div>
        <div className="sp-zz">
          <div className="sp-zz__photo">
            <Image src="/mate.webp" alt="The Moreška sword dance" fill sizes="(min-width: 768px) 45vw, 90vw" />
          </div>
          <div className="sp-block sp-zz__body">
            <h3>{t.danceHeadline}</h3>
            <p>{t.danceBody}</p>
          </div>
        </div>
        <div className="sp-zz">
          <div className="sp-zz__photo sp-zz__photo--low">
            <Image src="/costume.webp" alt="Dressing in the Moreška costume" fill sizes="(min-width: 768px) 45vw, 90vw" />
          </div>
          <div className="sp-block sp-zz__body">
            <h3>{t.costumeHeadline}</h3>
            <p>{t.costumeBody}</p>
          </div>
        </div>
        <div className="sp-zz">
          <div className="sp-zz__photo sp-zz__photo--tall">
            <Image src="/younglings.webp" alt="Young performers with wooden swords" fill sizes="(min-width: 768px) 45vw, 90vw" />
          </div>
          <div className="sp-block sp-zz__body">
            <h3>{t.participationHeadline}</h3>
            <p>{t.participationBody}</p>
          </div>
        </div>
      </div>
    </>
  );
}

function TwoBodyContent({ t }: { t: Record<string, string> }) {
  return (
    <div className="sp-body sp-body--single">
      <div className="sp-block">
        <p style={{ fontSize: '17px', lineHeight: '1.7' }}>{t.body1}</p>
      </div>
      <div className="sp-block" style={{ marginTop: '28px' }}>
        <p style={{ fontSize: '17px', lineHeight: '1.7' }}>{t.body2}</p>
      </div>
    </div>
  );
}

function ChoirContent({ t }: { t: Record<string, string> }) {
  return (
    <div className="sp-body sp-body--single">
      <div className="sp-block">
        <p style={{ fontSize: '17px', lineHeight: '1.7' }}>{t.body1}</p>
      </div>
      <div className="sp-block" style={{ marginTop: '28px' }}>
        <p style={{ fontSize: '17px', lineHeight: '1.7' }}>{t.body2}</p>
      </div>
      {t.body3 && (
        <div className="sp-block" style={{ marginTop: '28px' }}>
          <p style={{ fontSize: '17px', lineHeight: '1.7' }}>{t.body3}</p>
        </div>
      )}
    </div>
  );
}
