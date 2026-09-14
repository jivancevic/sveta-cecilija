# Generates the six direction artboards + canvas.json for the Cecilija direction board.
import json, os
base = os.path.dirname(os.path.abspath(__file__))

FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Labrada:ital,wght@0,400;0,500;0,600;0,700;1,400&amp;display=swap">'
SYS = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif'
SERIF = 'Labrada, "Iowan Old Style", Georgia, serif'

def svg(paths, size=24, sw=1.75):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{paths}</svg>')

I = {
    'home': '<path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9.5V21h5v-6h4v6h5V9.5"></path>',
    'swords': '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"></path><path d="M13 19l6-6"></path><path d="M16 16l4 4"></path><path d="M19 21l2-2"></path><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"></path><path d="M5 14l4 4"></path><path d="M7 17l-4 4"></path>',
    'chart': '<path d="M3 3v18h18"></path><path d="M8 17v-6"></path><path d="M13 17V7"></path><path d="M18 17v-9"></path>',
    'trophy': '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>',
    'more': '<circle cx="5" cy="12" r="1.3"></circle><circle cx="12" cy="12" r="1.3"></circle><circle cx="19" cy="12" r="1.3"></circle>',
    'bell': '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>',
    'chev': '<path d="m9 18 6-6-6-6"></path>',
    'check': '<path d="M20 6 9 17l-5-5"></path>',
    'x': '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
    'pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle>',
    'note': '<path d="M4 4h12l4 4v12H4z"></path><path d="M8 12h8"></path><path d="M8 16h5"></path>',
    'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
}

# ---------- tokens ----------
PAPIR = dict(
    bg='#f5f2ec', card='#ffffff', ink='#1a140c', muted='#6b6259', gold='#b8881a', goldText='#8f6a10',
    onGold='#14100a', rule='rgba(26,20,12,0.08)', sunk='#ede9e0', bar='#ffffff',
    shadow='0 1px 2px rgba(26,20,12,0.05), 0 10px 28px -12px rgba(26,20,12,0.18)',
    goldSoft='rgba(184,136,26,0.12)', warn='#a8321f', ghostEdge='rgba(26,20,12,0.16)',
)
TINTA = dict(
    bg='#17120c', card='#231c14', ink='#f5f2ec', muted='#a89e91', gold='#d9ab3c', goldText='#e3b94e',
    onGold='#14100a', rule='rgba(245,242,236,0.08)', sunk='#100c08', bar='#1d1710',
    shadow='inset 0 1px 0 rgba(255,255,255,0.04), 0 14px 30px -12px rgba(0,0,0,0.7)',
    goldSoft='rgba(217,171,60,0.14)', warn='#e07a5f', ghostEdge='rgba(245,242,236,0.18)',
)

def head(t, extra=''):
    return f'''<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  {FONT}
  <style>
    body {{ margin: 0; background: {t['bg']}; }}
    a {{ color: {t['goldText']}; }} a:hover {{ color: {t['gold']}; }}
    .phone {{ position: relative; width: 390px; height: 844px; overflow: hidden; background: {t['bg']}; color: {t['ink']};
      font-family: {SYS}; font-size: 15px; line-height: 1.45; -webkit-font-smoothing: antialiased; }}
    .phone * {{ box-sizing: border-box; }}
    .scroll {{ position: absolute; inset: 0 0 88px 0; overflow-y: auto; padding: 54px 20px 24px; display: flex; flex-direction: column; gap: 12px; }}
    .top {{ display: flex; align-items: center; gap: 10px; height: 40px; margin-bottom: 4px; }}
    .logo {{ width: 32px; height: 40px; object-fit: contain; }}
    .wordmark {{ font-family: {SERIF}; font-weight: 600; font-size: 22px; letter-spacing: 0.01em; flex: 1; }}
    .bell {{ position: relative; width: 44px; height: 44px; margin-right: -8px; border: 0; background: transparent; color: {t['ink']}; display: grid; place-items: center; border-radius: 999px; }}
    .bell .dot {{ position: absolute; top: 8px; right: 8px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px; background: {t['gold']}; color: {t['onGold']}; font-size: 10px; font-weight: 700; line-height: 16px; text-align: center; }}
    .greet {{ margin: 0 0 4px; }}
    .greet b {{ display: block; font-family: {SERIF}; font-weight: 600; font-size: 28px; line-height: 1.15; letter-spacing: -0.01em; }}
    .greet span {{ color: {t['muted']}; }}
    .card {{ background: {t['card']}; border-radius: 16px; padding: 16px; box-shadow: {t['shadow']}; display: flex; flex-direction: column; gap: 10px; }}
    .eyebrow {{ font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: {t['muted']}; }}
    .h {{ margin: 0; font-family: {SERIF}; font-weight: 600; font-size: 24px; line-height: 1.15; }}
    .meta {{ color: {t['muted']}; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }}
    .meta svg {{ width: 16px; height: 16px; }}
    .btns {{ display: flex; gap: 10px; margin-top: 4px; }}
    .btn {{ flex: 1; height: 48px; border-radius: 12px; border: 0; font: inherit; font-weight: 600; font-size: 16px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }}
    .btn--primary {{ background: {t['gold']}; color: {t['onGold']}; box-shadow: 0 6px 16px -8px {t['gold']}; }}
    .btn--ghost {{ background: transparent; color: {t['ink']}; box-shadow: inset 0 0 0 1.5px {t['ghostEdge']}; }}
    .bar {{ height: 6px; border-radius: 999px; background: {t['sunk']}; overflow: hidden; }}
    .bar i {{ display: block; height: 100%; border-radius: 999px; background: {t['gold']}; }}
    .small {{ font-size: 13px; color: {t['muted']}; }}
    .line {{ display: flex; align-items: center; gap: 12px; }}
    .line .grow {{ flex: 1; min-width: 0; }}
    .line .chev {{ color: {t['muted']}; }}
    .big {{ font-family: {SERIF}; font-weight: 600; font-size: 30px; line-height: 1; }}
    .big small {{ font-family: {SYS}; font-weight: 500; font-size: 14px; color: {t['muted']}; margin-left: 4px; }}
    .ico {{ width: 40px; height: 40px; border-radius: 12px; background: {t['goldSoft']}; color: {t['goldText']}; display: grid; place-items: center; flex: none; }}
    .rank {{ display: flex; flex-direction: column; }}
    .rank .r {{ display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid {t['rule']}; }}
    .rank .r:first-child {{ border-top: 0; }}
    .rank .n {{ width: 22px; font-family: {SERIF}; font-weight: 600; font-size: 16px; color: {t['muted']}; }}
    .rank .me {{ font-weight: 600; }}
    .rank .c {{ margin-left: auto; font-variant-numeric: tabular-nums; color: {t['muted']}; }}
    .chip {{ display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: {t['sunk']}; color: {t['muted']}; white-space: nowrap; }}
    .chip--gold {{ background: {t['goldSoft']}; color: {t['goldText']}; }}
    .tabs {{ position: absolute; left: 0; right: 0; bottom: 0; height: 88px; padding: 6px 8px 24px; background: {t['bar']}; border-top: 1px solid {t['rule']}; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); }}
    .tab {{ display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; color: {t['muted']}; font-size: 11px; font-weight: 500; border-radius: 12px; }}
    .tab--on {{ color: {t['goldText']}; font-weight: 600; }}
    .title {{ margin: 0; font-family: {SERIF}; font-weight: 600; font-size: 32px; line-height: 1.1; letter-spacing: -0.01em; }}
    .sub {{ color: {t['muted']}; margin: 0 0 4px; }}
    .note {{ display: flex; gap: 10px; padding: 10px 12px; border-radius: 12px; background: {t['sunk']}; font-size: 14px; }}
    .note svg {{ flex: none; color: {t['goldText']}; }}
    .armies {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }}
    .army {{ padding: 10px 12px; border-radius: 12px; background: {t['sunk']}; display: flex; flex-direction: column; gap: 2px; }}
    .army .k {{ font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: {t['muted']}; }}
    .army .v {{ font-family: {SERIF}; font-weight: 600; font-size: 22px; line-height: 1.1; }}
    .army .v small {{ font-family: {SYS}; font-size: 13px; font-weight: 500; color: {t['muted']}; }}
    .list {{ background: {t['card']}; border-radius: 16px; box-shadow: {t['shadow']}; display: flex; flex-direction: column; overflow: hidden; }}
    .row {{ display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 10px 16px; border-top: 1px solid {t['rule']}; }}
    .row:first-child {{ border-top: 0; }}
    .date {{ width: 44px; display: flex; flex-direction: column; align-items: center; line-height: 1; flex: none; }}
    .date b {{ font-family: {SERIF}; font-weight: 600; font-size: 20px; }}
    .date span {{ font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: {t['muted']}; margin-top: 3px; }}
    .row .grow b {{ display: block; font-weight: 600; }}
    .row .grow span {{ color: {t['muted']}; font-size: 13px; }}
    .section {{ display: flex; align-items: baseline; justify-content: space-between; margin-top: 4px; }}
    .section h3 {{ margin: 0; font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: {t['muted']}; }}
    {extra}
  </style>
</helmet>
'''

TAIL = '''</x-dc>
</body>
</html>
'''

def tabs(active, cls_on='tab--on'):
    items = [('home', 'Početna'), ('swords', 'Moreška'), ('chart', 'Statistika'), ('trophy', 'Ljestvica'), ('more', 'Više')]
    out = '<nav class="tabs">'
    for k, label in items:
        on = f' {cls_on}' if label == active else ''
        out += f'<div class="tab{on}">{svg(I[k], 24, 1.9 if label == active else 1.75)}<span>{label}</span></div>'
    return out + '</nav>'

def header():
    return f'''<header class="top"><img class="logo" src="logo.png" alt="Cecilija"><span class="wordmark">Cecilija</span>
  <button class="bell" type="button">{svg(I['bell'], 22)}<span class="dot">2</span></button></header>'''

# ---------- A / C : Početna ----------
def pocetna_ac():
    return f'''<div class="phone">
<div class="scroll">
  {header()}
  <p class="greet"><b>Dobra večer, Josipe.</b><span>Sutra je nastup.</span></p>

  <section class="card">
    <div class="eyebrow">Moreška · sljedeći nastup</div>
    <h2 class="h">Sutra, 14. rujna</h2>
    <div class="meta">{svg(I['pin'])}<span>Ljetno kino</span><span>·</span><span>21:00</span><span>·</span><span>Redovna</span></div>
    <div class="btns"><button class="btn btn--primary" type="button">{svg(I['check'], 20, 2.25)}Dolazim</button><button class="btn btn--ghost" type="button">Ne dolazim</button></div>
    <div class="bar"><i style="width: 3%"></i></div>
    <div class="small">2 od 70 odgovorilo · postava još nije potvrđena</div>
  </section>

  <section class="card">
    <div class="line">
      <div class="ico">{svg(I['chart'], 22)}</div>
      <div class="grow"><div class="eyebrow">Statistika · sezona 2026</div><div class="big">16 <small>od 22 izvedbe odigrano</small></div></div>
      <span class="chev">{svg(I['chev'], 20)}</span>
    </div>
  </section>

  <section class="card">
    <div class="line">
      <div class="ico">{svg(I['trophy'], 22)}</div>
      <div class="grow"><div class="eyebrow">Ljestvica · moreška</div><div class="big">4. <small>mjesto · 11 nastupa</small></div></div>
      <span class="chev">{svg(I['chev'], 20)}</span>
    </div>
    <div class="rank">
      <div class="r"><span class="n">1.</span><span>Brko</span><span class="c">14</span></div>
      <div class="r"><span class="n">2.</span><span>Cici</span><span class="c">13</span></div>
      <div class="r"><span class="n">3.</span><span>Baro</span><span class="c">12</span></div>
      <div class="r"><span class="n">4.</span><span class="me">Josip I.</span><span class="c">11</span></div>
    </div>
  </section>

  <section class="card">
    <div class="line">
      <div class="ico">{svg(I['bell'], 22)}</div>
      <div class="grow"><b>Nova postava za 2. rujna</b><div class="small">Plešeš kao crni kralj · prije 2 h</div></div>
      <span class="chip chip--gold">2 nove</span>
    </div>
  </section>
</div>
{tabs('Početna')}
</div>
'''

# ---------- A / C : Moreška ----------
ROWS = [
    ('15', 'uto', 'DMC', '10:00 · Zimsko kino'),
    ('16', 'sri', 'Redovna', '21:00 · Ljetno kino'),
    ('22', 'uto', 'DMC', '10:00 · Zimsko kino'),
    ('28', 'pon', 'Redovna', '21:00 · Ljetno kino'),
    ('30', 'sri', 'Redovna', '21:00 · Ljetno kino'),
]

def moreska_ac():
    rows = ''.join(f'''<div class="row"><div class="date"><b>{d}</b><span>{w}</span></div><div class="grow"><b>{k}</b><span>{m}</span></div><span class="chip">bez odgovora</span></div>''' for d, w, k, m in ROWS)
    return f'''<div class="phone">
<div class="scroll">
  <h1 class="title" style="margin-top: 8px">Moreška</h1>
  <p class="sub">9 nastupa pred tobom · sezona 2026</p>

  <section class="card">
    <div class="eyebrow">Sljedeći nastup</div>
    <h2 class="h">Pon, 14. rujna</h2>
    <div class="meta">{svg(I['pin'])}<span>Ljetno kino</span><span>·</span><span>21:00</span><span>·</span><span>Redovna</span></div>
    <div class="note">{svg(I['note'], 18)}<span>Skup u 20:15 iza pozornice, kostimi su već u kinu.</span></div>
    <div class="armies">
      <div class="army"><span class="k">Crni</span><span class="v">0 <small>od 8</small></span></div>
      <div class="army"><span class="k">Bili</span><span class="v">0 <small>od 8</small></span></div>
    </div>
    <div class="btns"><button class="btn btn--primary" type="button">{svg(I['check'], 20, 2.25)}Dolazim</button><button class="btn btn--ghost" type="button">Ne dolazim</button></div>
    <div class="small">68 bez odgovora · postava još nije potvrđena</div>
  </section>

  <div class="section"><h3>Rujan</h3><span class="small">5 nastupa</span></div>
  <div class="list">{rows}</div>
</div>
{tabs('Moreška')}
</div>
'''

# ---------- B : Podij ----------
B_EXTRA = f'''
    .card {{ border-radius: 22px; padding: 18px; box-shadow: 0 2px 4px rgba(26,20,12,0.05), 0 18px 36px -14px rgba(26,20,12,0.26); }}
    .greet b {{ font-size: 36px; }}
    .hero {{ background: {PAPIR['gold']}; color: {PAPIR['onGold']}; border-radius: 24px; padding: 20px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 20px 40px -16px rgba(184,136,26,0.7); }}
    .hero .eyebrow {{ color: rgba(20,16,10,0.72); }}
    .hero .day {{ display: flex; align-items: baseline; gap: 12px; line-height: 0.9; }}
    .hero .day b {{ font-family: {SERIF}; font-weight: 600; font-size: 80px; letter-spacing: -0.03em; }}
    .hero .day span {{ font-family: {SERIF}; font-weight: 600; font-size: 28px; }}
    .hero .meta {{ color: rgba(20,16,10,0.8); font-weight: 500; }}
    .hero .btn--primary {{ background: #ffffff; color: {PAPIR['ink']}; box-shadow: 0 8px 18px -8px rgba(20,16,10,0.5); height: 52px; border-radius: 16px; }}
    .hero .btn--ghost {{ color: {PAPIR['onGold']}; box-shadow: inset 0 0 0 1.5px rgba(20,16,10,0.35); height: 52px; border-radius: 16px; }}
    .hero .bar {{ background: rgba(20,16,10,0.18); }} .hero .bar i {{ background: {PAPIR['ink']}; }}
    .hero .small {{ color: rgba(20,16,10,0.72); }}
    .tiles {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }}
    .tile {{ background: #ffffff; border-radius: 22px; padding: 16px; box-shadow: 0 2px 4px rgba(26,20,12,0.05), 0 18px 36px -14px rgba(26,20,12,0.26); display: flex; flex-direction: column; gap: 8px; min-height: 150px; }}
    .ring {{ width: 72px; height: 72px; border-radius: 999px; display: grid; place-items: center; background: conic-gradient({PAPIR['gold']} 0 262deg, {PAPIR['sunk']} 262deg 360deg); }}
    .ring i {{ width: 56px; height: 56px; border-radius: 999px; background: #ffffff; display: grid; place-items: center; font-family: {SERIF}; font-weight: 600; font-size: 18px; font-style: normal; }}
    .podium {{ display: flex; align-items: flex-end; gap: 6px; height: 72px; }}
    .podium div {{ flex: 1; border-radius: 8px 8px 4px 4px; background: {PAPIR['sunk']}; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; padding-bottom: 4px; font-size: 11px; font-weight: 600; color: {PAPIR['muted']}; }}
    .podium div b {{ font-family: {SERIF}; font-size: 16px; color: {PAPIR['ink']}; }}
    .podium .p1 {{ height: 100%; background: {PAPIR['goldSoft']}; }} .podium .p2 {{ height: 78%; }} .podium .p3 {{ height: 60%; }}
    .tabs {{ background: transparent; border-top: 0; padding: 8px 12px 26px; }}
    .tabs::before {{ content: ""; position: absolute; inset: 6px 12px 22px; border-radius: 999px; background: #ffffff; box-shadow: 0 10px 30px -10px rgba(26,20,12,0.35); }}
    .tab {{ position: relative; }}
    .tab--on {{ background: {PAPIR['ink']}; color: {PAPIR['gold']}; border-radius: 999px; margin: 6px 2px; }}
    .list {{ border-radius: 22px; }}
    .row {{ min-height: 72px; }}
    .date {{ width: 48px; height: 48px; border-radius: 999px; justify-content: center; background: {PAPIR['sunk']}; }}
    .date--gold {{ background: {PAPIR['gold']}; color: {PAPIR['onGold']}; }} .date--gold span {{ color: rgba(20,16,10,0.7); }}
    .date b {{ font-size: 18px; }}
    .army {{ background: rgba(255,255,255,0.55); }}
    .army .v {{ font-size: 28px; }}
    .hero .note {{ background: rgba(255,255,255,0.55); }}
    .hero .note svg {{ color: {PAPIR['onGold']}; }}
    .season {{ display: inline-flex; align-items: center; height: 30px; padding: 0 12px; border-radius: 999px; background: {PAPIR['ink']}; color: {PAPIR['gold']}; font-size: 13px; font-weight: 600; }}
'''

def pocetna_b():
    return f'''<div class="phone">
<div class="scroll">
  {header()}
  <p class="greet"><b>Hej, Josipe.</b><span>Sutra je nastup, kostim je spreman?</span></p>

  <section class="hero">
    <div class="eyebrow">Sljedeći nastup · Ljetno kino</div>
    <div class="day"><b>14</b><span>rujna</span></div>
    <div class="meta">Sutra · 21:00 · Redovna</div>
    <div class="btns"><button class="btn btn--primary" type="button">{svg(I['check'], 20, 2.25)}Dolazim</button><button class="btn btn--ghost" type="button">Ne dolazim</button></div>
    <div class="bar"><i style="width: 3%"></i></div>
    <div class="small">2 od 70 odgovorilo</div>
  </section>

  <div class="tiles">
    <div class="tile">
      <div class="eyebrow">Statistika</div>
      <div class="ring"><i>16/22</i></div>
      <div class="small">izvedbi odigrano</div>
    </div>
    <div class="tile">
      <div class="eyebrow">Ljestvica</div>
      <div class="podium"><div class="p2"><b>13</b>Cici</div><div class="p1"><b>14</b>Brko</div><div class="p3"><b>12</b>Baro</div></div>
      <div class="small">ti si 4. s 11</div>
    </div>
  </div>

  <section class="card">
    <div class="line">
      <div class="ico">{svg(I['bell'], 22)}</div>
      <div class="grow"><b>Nova postava za 2. rujna</b><div class="small">Plešeš kao crni kralj · prije 2 h</div></div>
      <span class="chip chip--gold">2 nove</span>
    </div>
  </section>
</div>
{tabs('Početna')}
</div>
'''

def moreska_b():
    rows = ''.join(f'''<div class="row"><div class="date{' date--gold' if k == 'Redovna' else ''}"><b>{d}</b><span>{w}</span></div><div class="grow"><b>{k}</b><span>{m}</span></div><span class="chip">bez odgovora</span></div>''' for d, w, k, m in ROWS)
    return f'''<div class="phone">
<div class="scroll">
  <div class="line" style="margin-top: 8px"><h1 class="title grow">Moreška</h1><span class="season">Sezona 2026</span></div>
  <p class="sub">9 nastupa pred tobom</p>

  <section class="hero">
    <div class="eyebrow">Sljedeći nastup · Ljetno kino</div>
    <div class="day"><b>14</b><span>rujna</span></div>
    <div class="meta">Ponedjeljak · 21:00 · Redovna</div>
    <div class="note">{svg(I['note'], 18)}<span>Skup u 20:15 iza pozornice, kostimi su već u kinu.</span></div>
    <div class="armies">
      <div class="army"><span class="k">Crni</span><span class="v">0 <small>od 8</small></span></div>
      <div class="army"><span class="k">Bili</span><span class="v">0 <small>od 8</small></span></div>
    </div>
    <div class="btns"><button class="btn btn--primary" type="button">{svg(I['check'], 20, 2.25)}Dolazim</button><button class="btn btn--ghost" type="button">Ne dolazim</button></div>
  </section>

  <div class="section"><h3>Rujan</h3><span class="small">5 nastupa</span></div>
  <div class="list">{rows}</div>
</div>
{tabs('Moreška')}
</div>
'''

files = {
    'PapirPocetna.dc.html': head(PAPIR) + pocetna_ac() + TAIL,
    'PapirMoreska.dc.html': head(PAPIR) + moreska_ac() + TAIL,
    'PodijPocetna.dc.html': head(PAPIR, B_EXTRA) + pocetna_b() + TAIL,
    'PodijMoreska.dc.html': head(PAPIR, B_EXTRA) + moreska_b() + TAIL,
    'TintaPocetna.dc.html': head(TINTA) + pocetna_ac() + TAIL,
    'TintaMoreska.dc.html': head(TINTA) + moreska_ac() + TAIL,
}
for name, src in files.items():
    open(os.path.join(base, name), 'w').write(src)

ROUND1_NOTES = None
