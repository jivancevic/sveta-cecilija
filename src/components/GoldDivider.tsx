export default function GoldDivider() {
  return (
    <div className="divider">
      <span className="divider__rule" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/swords.png" className="divider__swords" alt="" />
      <span className="divider__rule" style={{ width: '32%' }} />
    </div>
  );
}
