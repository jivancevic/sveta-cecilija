import { eveningFacts, type EveningCopy } from '@/lib/evening';

interface Props {
  t: EveningCopy;
  /**
   * The schedule page has room for the label and a fact per line; the receipt
   * after payment has room for one line and is not the place to expand (#541,
   * decision 5). The same sentences either way.
   */
  variant?: 'panel' | 'line';
}

/**
 * What the evening is, told the same way wherever a guest meets it.
 * Copy rules live in CONTEXT.md under "Evening structure": two named parts, the
 * pre-klapa march left unnamed, the spoken introduction named inside the moreška
 * half, "about an hour" and never a per-part duration.
 */
export default function EveningBlock({ t, variant = 'panel' }: Props) {
  const facts = eveningFacts(t);

  if (variant === 'line') {
    return <p className="evening-block evening-block--line">{facts.join(' ')}</p>;
  }

  return (
    <div className="evening-block">
      <p className="evening-block__label">{t.label}</p>
      <ul className="evening-block__facts">
        {facts.map((fact) => (
          <li key={fact} className="evening-block__fact">
            {fact}
          </li>
        ))}
      </ul>
    </div>
  );
}
