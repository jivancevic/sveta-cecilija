export function AdminLogo() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
      <img
        src="/cecilija-logo.webp"
        alt="HGD Sveta Cecilija"
        style={{ width: '56px', height: '56px', objectFit: 'contain' }}
      />
      <div style={{ textAlign: 'center', lineHeight: 1.2 }}>
        <div style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#B8881A' }}>
          HGD Sveta Cecilija
        </div>
        <div style={{ fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.45, marginTop: '2px' }}>
          Admin
        </div>
      </div>
    </div>
  )
}
