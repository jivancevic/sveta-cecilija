'use client';

// PROTOTYPE — floating switcher for the font-option comparison.
// Visible on staging on purpose (the team reviews these on dev.moreska.eu),
// so it is NOT gated on NODE_ENV. Delete with the rest of the prototype.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { PrototypeOption } from './fonts';

const ORDER: PrototypeOption[] = ['option1', 'option2'];

type Recipe = { label: string; titles: string; body: string; accents: string };

export default function PrototypeBar({
  current,
  recipe,
}: {
  current: PrototypeOption;
  recipe: Recipe;
}) {
  const router = useRouter();
  const idx = ORDER.indexOf(current);
  const prev = ORDER[(idx - 1 + ORDER.length) % ORDER.length];
  const next = ORDER[(idx + 1) % ORDER.length];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          (el as HTMLElement).isContentEditable)
      ) {
        return;
      }
      if (e.key === 'ArrowLeft') router.push(`/prototype/${prev}`);
      if (e.key === 'ArrowRight') router.push(`/prototype/${next}`);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, prev, next]);

  const wrap: React.CSSProperties = {
    position: 'fixed',
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'stretch',
    gap: 0,
    background: 'rgba(10,10,10,0.92)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 10,
    boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(8px)',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    overflow: 'hidden',
    maxWidth: '92vw',
  };
  const arrow: React.CSSProperties = {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 18,
    padding: '0 16px',
    lineHeight: 1,
  };
  const body: React.CSSProperties = {
    padding: '10px 14px',
    textAlign: 'center',
    borderLeft: '1px solid rgba(255,255,255,0.12)',
    borderRight: '1px solid rgba(255,255,255,0.12)',
    minWidth: 0,
  };

  return (
    <div style={wrap} aria-label="Prototype font switcher">
      <button style={arrow} onClick={() => router.push(`/prototype/${prev}`)} aria-label="Previous option">
        ‹
      </button>
      <div style={body}>
        <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.65 }}>
          {current === 'option1' ? 'Option 1' : 'Option 2'} · {recipe.label}
        </div>
        <div style={{ fontSize: 12.5, marginTop: 4, opacity: 0.95, whiteSpace: 'nowrap' }}>
          <b>Titles:</b> {recipe.titles} &nbsp;·&nbsp; <b>Body:</b> {recipe.body} &nbsp;·&nbsp;{' '}
          <b>Accents:</b> {recipe.accents}
        </div>
      </div>
      <button style={arrow} onClick={() => router.push(`/prototype/${next}`)} aria-label="Next option">
        ›
      </button>
    </div>
  );
}
