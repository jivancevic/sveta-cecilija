# Round 2: direction B chosen with Josip's changes. Builds Main (Početna), MoreskaB, three hero
# background variants, the role-mark legend, and a two-page canvas.json (round 1 on page 2).
import json, os
from gen import base, svg, I, PAPIR, SYS, SERIF, head, TAIL, tabs, header, B_EXTRA

T = PAPIR
RED = '#8b0000'
CROWN = '<path d="m3 7 4.5 4.5L12 4l4.5 7.5L21 7l-2 11H5z"></path><path d="M5 21h14"></path>'
CROWN_NOBASE = '<path d="m3 8 4.5 4.5L12 5l4.5 7.5L21 8l-2 11H5z"></path>'

# Additional CSS for round 2 (hero on white, split army bar, role marks, tappable state row).
R2 = B_EXTRA + f'''
    .hero {{ background: #ffffff; color: {T['ink']}; box-shadow: 0 2px 4px rgba(26,20,12,0.05), 0 22px 44px -18px rgba(26,20,12,0.32); }}
    .hero .eyebrow {{ color: {T['muted']}; }}
    .hero .day b {{ color: {T['ink']}; }}
    .hero .day span {{ color: {T['ink']}; }}
    .hero .meta {{ color: {T['muted']}; }}
    .hero .btn--primary {{ background: {T['gold']}; color: {T['onGold']}; box-shadow: 0 8px 18px -8px {T['gold']}; }}
    .hero .btn--ghost {{ color: {T['ink']}; box-shadow: inset 0 0 0 1.5px {T['ghostEdge']}; }}
    .hero .note {{ background: {T['sunk']}; }} .hero .note svg {{ color: {T['goldText']}; }}
    .hero .small {{ color: {T['muted']}; }}
    .hero--ring .day {{ align-items: center; }}
    .hero--ring .day b {{ font-size: 44px; width: 84px; height: 84px; border-radius: 999px; display: grid; place-items: center; box-shadow: inset 0 0 0 3px {T['gold']}; letter-spacing: 0; }}
    .hero--ivory {{ background: #fbf8f1; box-shadow: inset 0 0 0 1px rgba(184,136,26,0.35), 0 22px 44px -18px rgba(26,20,12,0.25); }}
    .hero--ivory .day b, .hero--ivory .day span {{ color: {T['goldText']}; }}
    /* split army bar: crni fill grows leftwards from the centre, bili rightwards; tick = threshold */
    .state {{ display: flex; flex-direction: column; gap: 8px; padding: 12px; margin: 2px -4px 0; border-radius: 16px; background: {T['sunk']}; }}
    .state--tap {{ cursor: pointer; }}
    .state .heads {{ display: flex; align-items: baseline; justify-content: space-between; }}
    .state .army2 {{ display: flex; align-items: baseline; gap: 6px; }}
    .state .army2 .k {{ font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: {T['muted']}; }}
    .state .army2 .v {{ font-family: {SERIF}; font-weight: 600; font-size: 26px; line-height: 1; }}
    .state .army2 .v--low {{ color: {T['warn']}; }}
    .split {{ position: relative; height: 12px; border-radius: 999px; background: #ffffff; overflow: hidden; }}
    .split .mid {{ position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: {T['bg']}; z-index: 2; }}
    .split .crni {{ position: absolute; right: 50%; top: 0; bottom: 0; background: {T['ink']}; border-radius: 999px 0 0 999px; }}
    .split .bili {{ position: absolute; left: 50%; top: 0; bottom: 0; background: {RED}; border-radius: 0 999px 999px 0; }}
    .split .tick {{ position: absolute; top: 2px; bottom: 2px; width: 2px; background: {T['gold']}; z-index: 3; border-radius: 2px; }}
    .status {{ display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; }}
    .status--ok {{ color: {T['goldText']}; }} .status--low {{ color: {T['warn']}; }}
    .status .chev {{ margin-left: auto; color: {T['muted']}; }}
    .status .dot {{ width: 8px; height: 8px; border-radius: 999px; background: currentColor; }}
    /* who am I */
    .me {{ display: flex; align-items: center; gap: 12px; margin-top: 8px; }}
    .me .grow {{ flex: 1; min-width: 0; }}
    .me h1 {{ margin: 0; font-family: {SERIF}; font-weight: 600; font-size: 26px; line-height: 1.1; }}
    .me .role {{ color: {T['muted']}; margin-top: 2px; }}
    .mark {{ width: 44px; height: 44px; border-radius: 999px; display: grid; place-items: center; flex: none; color: {T['gold']}; }}
    .mark--crni {{ background: {T['ink']}; color: #d9d4cc; }}
    .mark--bili {{ background: {RED}; }}
    .mark--otm {{ background: {T['ink']}; color: #d9d4cc; }}
    .mark--bula {{ background: {T['gold']}; color: #ffffff; }}
    .mark svg {{ width: 22px; height: 22px; }}
    .mark--sm {{ width: 28px; height: 28px; }} .mark--sm svg {{ width: 14px; height: 14px; }}
    .legend {{ display: flex; flex-direction: column; gap: 0; background: #ffffff; border-radius: 22px; box-shadow: 0 2px 4px rgba(26,20,12,0.05), 0 18px 36px -14px rgba(26,20,12,0.26); overflow: hidden; }}
    .legend .row {{ min-height: 64px; }}
    .frame {{ box-sizing: border-box; position: relative; width: 390px; min-height: 100%; background: {T['bg']}; color: {T['ink']}; font-family: {SYS}; font-size: 15px; line-height: 1.45; padding: 20px; display: flex; flex-direction: column; gap: 12px; }}
    .frame * {{ box-sizing: border-box; }}
    .ring--tix {{ background: conic-gradient({T['gold']} 0 218deg, {T['sunk']} 218deg 360deg); }}
'''

def crown(size=22):
    return svg(CROWN, size, 2)

def crown_nobase(size=22):
    return svg(CROWN_NOBASE, size, 2)

def army_state(crni, bili, thr=8, tap=True):
    # each half of the bar spans 0..12 dancers (1.5 × the threshold of 8); the gold tick sits on 8
    half = 50.0
    cw = min(crni / 12, 1) * half
    bw = min(bili / 12, 1) * half
    tick = thr / 12 * half
    low = []
    if crni < thr: low.append(('crnih', thr - crni))
    if bili < thr: low.append(('bilih', thr - bili))
    if not low:
        status = f'<div class="status status--ok"><span class="dot"></span>Ima nas dovoljno' + (f'<span class="chev">{svg(I["chev"], 18)}</span>' if tap else '') + '</div>'
    else:
        txt = ' · '.join(f'{"fali" if n == 1 else "fale"} još {n} {"bili" if a == "bilih" and n == 1 else ("crni" if a == "crnih" and n == 1 else ("bila" if a == "bilih" and n < 5 else ("crna" if a == "crnih" and n < 5 else a)))}' for a, n in low)
        txt = txt[0].upper() + txt[1:]
        status = f'<div class="status status--low"><span class="dot"></span>{txt}' + (f'<span class="chev">{svg(I["chev"], 18)}</span>' if tap else '') + '</div>'
    return f'''<div class="state{' state--tap' if tap else ''}">
      <div class="heads">
        <div class="army2"><span class="k">Crni</span><span class="v{' v--low' if crni < thr else ''}">{crni}</span></div>
        <div class="army2"><span class="v{' v--low' if bili < thr else ''}">{bili}</span><span class="k">Bili</span></div>
      </div>
      <div class="split"><i class="crni" style="width: {cw:.1f}%"></i><i class="bili" style="width: {bw:.1f}%"></i><i class="mid"></i><i class="tick" style="left: {half - tick:.1f}%"></i><i class="tick" style="left: {half + tick:.1f}%"></i></div>
      {status}
    </div>'''

def hero(variant='', with_note=False, tap=True, crni=9, bili=6, meta='Sutra · 21:00 · Redovna'):
    note = f'<div class="note">{svg(I["note"], 18)}<span>Skup u 20:15 iza pozornice, kostimi su već u kinu.</span></div>' if with_note else ''
    return f'''<section class="hero{(' ' + variant) if variant else ''}">
    <div class="eyebrow">Sljedeći nastup · Ljetno kino</div>
    <div class="day"><b>14</b><span>rujna</span></div>
    <div class="meta">{meta}</div>
    {note}
    <div class="btns"><button class="btn btn--primary" type="button">{svg(I['check'], 20, 2.25)}Dolazim</button><button class="btn btn--ghost" type="button">Ne dolazim</button></div>
    {army_state(crni, bili, tap=tap)}
  </section>'''

def pocetna_main():
    return f'''<div class="phone">
<div class="scroll">
  {header()}
  <p class="greet"><b>Dobra večer, Josip.</b><span>Sutra je nastup.</span></p>
  {hero(tap=False)}
  <div class="tiles">
    <div class="tile">
      <div class="eyebrow">Statistika</div>
      <div class="ring ring--tix"><i>212</i></div>
      <div class="small">karata za sutra, od 350</div>
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

ROWS2 = [
    ('15', 'uto', 'Vanredna', '10:00 · Zimsko kino'),
    ('16', 'sri', 'Redovna', '21:00 · Ljetno kino'),
    ('22', 'uto', 'Vanredna', '10:00 · Zimsko kino'),
    ('28', 'pon', 'Redovna', '21:00 · Ljetno kino'),
    ('30', 'sri', 'Redovna', '21:00 · Ljetno kino'),
]

def moreska_main():
    rows = ''.join(f'''<div class="row"><div class="date{' date--gold' if k == 'Redovna' else ''}"><b>{d}</b><span>{w}</span></div><div class="grow"><b>{k}</b><span>{m}</span></div><span class="chip">bez odgovora</span></div>''' for d, w, k, m in ROWS2)
    return f'''<div class="phone">
<div class="scroll">
  <div class="me">
    <div class="mark mark--crni">{crown()}</div>
    <div class="grow"><h1>Josip Ivančević</h1><div class="role">Crni kralj · 9 nastupa pred tobom</div></div>
  </div>
  {hero(with_note=True, tap=True, meta='Ponedjeljak · 21:00 · Redovna')}
  <div class="section"><h3>Rujan</h3><span class="small">5 nastupa</span></div>
  <div class="list">{rows}</div>
</div>
{tabs('Moreška')}
</div>
'''

def hero_variant(variant, title):
    return f'''<div class="frame">
  <div class="eyebrow">{title}</div>
  {hero(variant=variant, tap=False)}
</div>
'''

def legend():
    roles = [
        ('mark--crni', '', 'Crni', 'tinta'),
        ('mark--bili', '', 'Bili', 'crvena'),
        ('mark--crni', crown(), 'Crni kralj', 'tinta + siva kruna s podnožjem'),
        ('mark--bili', crown(), 'Bili kralj', 'crvena + zlatna kruna'),
        ('mark--otm', crown_nobase(), 'Otmanović', 'tinta + siva kruna bez podnožja'),
        ('mark--bula', '', 'Bula', 'zlato'),
    ]
    rows = ''.join(f'<div class="row"><div class="mark {c}">{g}</div><div class="grow"><b>{n}</b><span>{d}</span></div></div>' for c, g, n, d in roles)
    return f'''<div class="frame">
  <div class="eyebrow">Oznake uloga · prijedlog</div>
  <div class="legend">{rows}</div>
  <div class="small">Boja kruga je vojska (crni = tinta, bili = crvena iz brenda), glyph je uloga; kruna crnog kralja je siva, Otmanović nosi istu krunu bez podnožja. Ista oznaka ide uz ime na Moreški, u postavi i na ljestvici, u 28 px verziji.</div>
  <div class="line" style="gap: 8px"><div class="mark mark--sm mark--crni">{crown(14)}</div><span>Josip I.</span><div class="mark mark--sm mark--bili" style="margin-left: 12px"></div><span>Roke</span><div class="mark mark--sm mark--otm" style="margin-left: 12px">{crown_nobase(14)}</div><span>Ojda</span></div>
</div>
'''

files = {
    'Main.dc.html': head(T, R2) + pocetna_main() + TAIL,
    'MoreskaB.dc.html': head(T, R2) + moreska_main() + TAIL,
    'HeroBijela.dc.html': head(T, R2) + hero_variant('', 'V1 · Bijela kartica (u Main)') + TAIL,
    'HeroPrsten.dc.html': head(T, R2) + hero_variant('hero--ring', 'V2 · Datum u zlatnom prstenu') + TAIL,
    'HeroBjelokost.dc.html': head(T, R2) + hero_variant('hero--ivory', 'V3 · Bjelokost sa zlatnim rubom') + TAIL,
    'OznakeUloga.dc.html': head(T, R2) + legend() + TAIL,
}
for name, src in files.items():
    open(os.path.join(base, name), 'w').write(src)

W, H, GX, GY = 390, 844, 130, 160
c = [0, W + GX, 2 * (W + GX)]
P1, P2 = 'smjer-b', 'prvi-krug'
canvas = {
    "pages": [{"id": P1, "name": "Smjer B, drugi krug"}, {"id": P2, "name": "Prvi krug: A, B, C"}],
    "artboards": [
        {"file": "Main.dc.html", "title": "Početna", "x": c[0], "y": 0, "w": W, "h": H, "page": P1},
        {"file": "MoreskaB.dc.html", "title": "Moreška", "x": c[1], "y": 0, "w": W, "h": H, "page": P1},
        {"file": "OznakeUloga.dc.html", "title": "Oznake uloga", "x": c[2], "y": 0, "w": W, "h": 620, "page": P1},
        {"file": "HeroBijela.dc.html", "title": "Hero V1", "x": c[0], "y": H + GY, "w": W, "h": 420, "page": P1},
        {"file": "HeroPrsten.dc.html", "title": "Hero V2", "x": c[1], "y": H + GY, "w": W, "h": 420, "page": P1},
        {"file": "HeroBjelokost.dc.html", "title": "Hero V3", "x": c[2], "y": H + GY, "w": W, "h": 420, "page": P1},
        {"file": "PapirPocetna.dc.html", "title": "A · Papir · Početna", "x": c[0], "y": 0, "w": W, "h": H, "page": P2},
        {"file": "PapirMoreska.dc.html", "title": "A · Papir · Moreška", "x": c[0], "y": H + GY, "w": W, "h": H, "page": P2},
        {"file": "PodijPocetna.dc.html", "title": "B · Podij · Početna", "x": c[1], "y": 0, "w": W, "h": H, "page": P2},
        {"file": "PodijMoreska.dc.html", "title": "B · Podij · Moreška", "x": c[1], "y": H + GY, "w": W, "h": H, "page": P2},
        {"file": "TintaPocetna.dc.html", "title": "C · Tinta · Početna", "x": c[2], "y": 0, "w": W, "h": H, "page": P2},
        {"file": "TintaMoreska.dc.html", "title": "C · Tinta · Moreška", "x": c[2], "y": H + GY, "w": W, "h": H, "page": P2},
    ],
    "annotations": [
        {"id": "krug2", "x": -470, "y": 0, "w": 380, "page": P1, "text":
         "DRUGI KRUG · smjer B s tvojim izmjenama\n\n· Pozdrav iz A: 'Dobra večer, Josip.' + 'Sutra je nastup.'\n· Hero iz B, ali na bijeloj kartici; tri varijante pozadine su u redu ispod (Q62).\n· Umjesto '2 od 70': stanje crnih i bilih. Crni pune traku ulijevo od sredine (tinta), bili udesno (crvena), zlatna crtica je prag od 8. Broj ispod praga pocrveni i piše koliko fali (Q63).\n· Statistika: karte za sutrašnji nastup, prsten kao u B.\n· Ljestvica: podij iz B.\n· Moreška: gore tvoje ime i glavna uloga s oznakom (legenda desno, Q64). Stanje je red na koji se klikne i vodi u postavu koja se prijavila.\n· Vanredne se zovu 'Vanredna', bez naručitelja.\n\nBrojke 9 crnih / 6 bilih i 212 karata su primjer da se vide oba stanja."},
        {"id": "hero-q", "x": -470, "y": H + GY, "w": 380, "page": P1, "text":
         "Q62 · POZADINA HERO KARTICE\n\nOdabrano 2026-09-13: V1 bijela. V2 i V3 ostaju ovdje samo kao zapis."},
        {"id": "smjer-a", "x": c[0], "y": -250, "w": W, "page": P2, "text": "A · PAPIR\n\nMirno i uredno. Bijele kartice na papiru, jedan zlatni gumb po ekranu."},
        {"id": "smjer-b", "x": c[1], "y": -250, "w": W, "page": P2, "text": "B · PODIJ (odabran 2026-09-13)\n\nEnergija: zlatni blok, golemi datum, prsten, postolje, tamna pilula u traci."},
        {"id": "smjer-c", "x": c[2], "y": -250, "w": W, "page": P2, "text": "C · TINTA\n\nIsti raspored kao A, noć zadana. Ostaje kao tamna tema preko tokena."},
    ],
    "launch": {"view": "canvas", "page": P1},
}
json.dump(canvas, open(os.path.join(base, 'canvas.json'), 'w'), ensure_ascii=False, indent=2)
print('ok', {k: len(v) for k, v in files.items()})
