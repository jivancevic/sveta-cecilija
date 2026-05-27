import Image from 'next/image';

export default function GoldDivider() {
  return (
    <div className="divider">
      <span className="divider__rule" />
      <Image src="/swords.webp" className="divider__swords" alt="" width={56} height={71} />
      <span className="divider__rule" style={{ width: '32%' }} />
    </div>
  );
}
