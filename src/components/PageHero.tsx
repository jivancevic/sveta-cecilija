interface Props {
  headline: string;
  subtitle?: string;
  image: string;
  imageAlt?: string;
}

export default function PageHero({ headline, subtitle, image, imageAlt }: Props) {
  return (
    <section className="page-hero">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="page-hero__bg" src={image} alt={imageAlt ?? ''} />
      <div className="page-hero__overlay" />
      <div className="page-hero__inner">
        <h1 className="page-hero__h serif">{headline}</h1>
        {subtitle && <p className="page-hero__sub">{subtitle}</p>}
      </div>
    </section>
  );
}
