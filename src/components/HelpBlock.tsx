import type { Dictionary } from '@/lib/i18n';

interface Props {
  t: Dictionary['help'];
  /** The order-number hint only makes sense once the visitor has an order. */
  showOrderHint?: boolean;
}

/**
 * Small utility block: how to reach us and how fast we answer.
 * Support is email only by board decision (#546); no phone number here, ever.
 * Both surfaces read the shared `help` namespace so the response time cannot drift.
 */
export default function HelpBlock({ t, showOrderHint = false }: Props) {
  // Split on the {email} placeholder, the same convention the rest of the dictionary
  // uses, so the address can be changed in one place without unlinking the copy.
  const [beforeEmail, afterEmail] = t.body.split('{email}');

  return (
    <aside className="help-block">
      <p className="help-block__heading">{t.heading}</p>
      <p className="help-block__body">
        {beforeEmail}
        <a className="help-block__link" href={`mailto:${t.email}`}>
          {t.email}
        </a>
        {afterEmail}
      </p>
      {showOrderHint && <p className="help-block__hint">{t.orderHint}</p>}
    </aside>
  );
}
