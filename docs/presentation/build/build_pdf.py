# -*- coding: utf-8 -*-
"""Build the internal companion PDF (rehearsal script) as HTML for Chrome print-to-PDF."""
import os, base64, html
import content as C

HERE = os.path.dirname(__file__)
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PRES = os.path.join(ROOT, "docs", "presentation")
THUMBS = os.path.join(PRES, "assets", "thumbs")
OUT_HTML = os.path.join(PRES, "out", "internal.html")


def b64(path):
    with open(path, "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode()


def onscreen(d):
    """A short 'what's on the slide' summary for the presenter."""
    bits = []
    if d.get("subtitle"):
        bits.append(d["subtitle"])
    if d.get("points"):
        for p in d["points"]:
            bits.append(p if isinstance(p, str) else f"{p[0]}: {p[1]}")
    if d.get("steps"):
        bits += [f"{n}. {t}" for n, t in d["steps"]]
    if d.get("items"):
        bits += d["items"]
    if d.get("channels"):
        bits.append("Kanali: " + ", ".join(n for n, _ in d["channels"]))
    return bits


def esc(s):
    return html.escape(s)


rows = []
section = ""
for i, d in enumerate(C.SLIDES, 1):
    title = d.get("title", "")
    eyebrow = d.get("eyebrow") or d.get("kicker") or ""
    notes = d.get("notes") or "Kratko najavite ovu cjelinu i prijeđite na sljedeći dio."
    thumb = b64(os.path.join(THUMBS, f"slide-{i:02d}.png"))
    os_bits = onscreen(d)
    os_html = ""
    if os_bits:
        lis = "".join(f"<li>{esc(b)}</li>" for b in os_bits)
        os_html = f'<div class="onscreen"><span class="lbl">Na slajdu</span><ul>{lis}</ul></div>'
    is_divider = d.get("layout") == "divider"
    cls = "row divider" if is_divider else "row"
    rows.append(f"""
    <section class="{cls}">
      <div class="thumb"><img src="{thumb}"/><div class="num">{i:02d}</div></div>
      <div class="body">
        <div class="eyebrow">{esc(eyebrow)}</div>
        <h2>{esc(title)}</h2>
        {os_html}
        <div class="script"><span class="lbl">Govorni tekst</span><p>{esc(notes)}</p></div>
      </div>
    </section>""")

rows_html = "\n".join(rows)

doc = f"""<!doctype html>
<html lang="hr"><head><meta charset="utf-8">
<style>
  @page {{ size: A4; margin: 16mm 15mm; }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; padding: 0; }}
  body {{
    font-family: "Helvetica Neue", Arial, sans-serif;
    color: #241f17; background: #fff; font-size: 11pt; line-height: 1.5;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }}
  h1, h2, .display {{ font-family: "Bodoni 72 Smallcaps", "Didot", Georgia, serif; font-weight: 400; }}
  .gold {{ color: #9a7416; }}
  /* cover */
  .cover {{ height: 247mm; display: flex; flex-direction: column; justify-content: center;
            background: #0f0d0b; color: #f4efe6; margin: -16mm -15mm 0; padding: 0 22mm;
            page-break-after: always; }}
  .cover .kicker {{ font-family: "Menlo", monospace; letter-spacing: .22em; font-size: 10pt; color: #c9a24a; text-transform: uppercase; }}
  .cover .rule {{ width: 54px; height: 2px; background: #b8881a; margin: 14px 0 18px; }}
  .cover h1 {{ font-size: 46pt; color: #d9a526; margin: 0 0 14px; line-height: .98; }}
  .cover .sub {{ font-size: 15pt; color: #efe8da; max-width: 150mm; }}
  .cover .meta {{ margin-top: 40px; font-family: "Menlo", monospace; font-size: 10pt; color: #b7ad9b; letter-spacing: .06em; }}
  /* intro */
  .intro {{ page-break-after: always; }}
  .intro h1 {{ font-size: 26pt; color: #1a140c; margin: 0 0 4px; }}
  .intro .lead {{ color: #5b5346; max-width: 165mm; }}
  .intro h3 {{ font-family: "Bodoni 72 Smallcaps","Didot",Georgia,serif; font-size: 15pt; color: #9a7416; margin: 22px 0 6px; }}
  .intro ul {{ margin: 0; padding-left: 18px; }}
  .intro li {{ margin: 4px 0; }}
  .agenda {{ margin-top: 8px; border-top: 1px solid #e7e0d2; }}
  .agenda div {{ display:flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #efe9dc; }}
  .agenda b {{ font-family:"Bodoni 72 Smallcaps","Didot",Georgia,serif; font-weight:400; font-size:12.5pt; }}
  .agenda span {{ font-family:"Menlo",monospace; font-size: 9.5pt; color:#9a8e78; }}
  /* slide rows */
  .row {{ display: flex; gap: 12mm; padding: 8mm 0; border-bottom: 1px solid #ece5d6; page-break-inside: avoid; }}
  .row .thumb {{ position: relative; flex: 0 0 78mm; }}
  .row .thumb img {{ width: 78mm; border: 1px solid #e2dac9; border-radius: 4px; display:block; box-shadow: 0 4px 14px rgba(0,0,0,.12); }}
  .row .thumb .num {{ position: absolute; top: -6px; left: -6px; background: #b8881a; color: #fff;
        font-family:"Menlo",monospace; font-size: 9pt; padding: 3px 7px; border-radius: 3px; }}
  .row .body {{ flex: 1; }}
  .row .eyebrow {{ font-family:"Menlo",monospace; letter-spacing:.16em; font-size: 8.5pt; color:#b8881a; text-transform: uppercase; }}
  .row h2 {{ font-size: 21pt; color:#1a140c; margin: 2px 0 8px; line-height: 1; }}
  .lbl {{ display:block; font-family:"Menlo",monospace; font-size: 7.5pt; letter-spacing:.14em; text-transform:uppercase; color:#a9a08c; margin-bottom: 3px; }}
  .onscreen ul {{ margin: 0 0 10px; padding-left: 16px; color:#3f382c; font-size: 10pt; }}
  .onscreen li {{ margin: 2px 0; }}
  .script p {{ margin: 0; color:#241f17; }}
  .row.divider {{ background: #faf6ec; }}
  .row.divider h2 {{ color: #9a7416; }}
  .foot {{ text-align:center; font-family:"Menlo",monospace; font-size: 8pt; color:#b3a98f; margin-top: 10mm; }}
</style></head>
<body>
  <div class="cover">
    <div class="kicker">{esc(C.SLIDES[0]['eyebrow'])}</div>
    <div class="rule"></div>
    <h1>Digitalna obnova</h1>
    <div class="sub">Interni vodič za izlaganje, govorni tekst uz prezentaciju za Upravni odbor.</div>
    <div class="meta">{esc(C.PRESENTER)} &nbsp;·&nbsp; {esc(C.OCCASION)} &nbsp;·&nbsp; 17 slajdova, ~20 minuta</div>
  </div>

  <div class="intro">
    <h1 class="gold">O ovom dokumentu</h1>
    <p class="lead">Ovo je vaš podsjetnik za izlaganje. Uz svaki slajd stoji što je na ekranu i predloženi
    govorni tekst koji možete čitati ili prepričati svojim riječima. Prezentaciju (PowerPoint) otvorite na
    projektoru, a ovaj dokument držite uza se ili isprintajte.</p>

    <h3>Kako izlagati (oko 20 minuta)</h3>
    <ul>
      <li>Jedan slajd = jedna poruka. Ne žurite, pustite da slika djeluje.</li>
      <li>Računajte otprilike jednu minutu po slajdu. Ostavite par minuta za pitanja na kraju.</li>
      <li>Brojke su namjerno u drugom planu, naglasak je na tome kako je bilo prije, a kako je sada.</li>
      <li>Ako vas netko prekine pitanjem, mirno odgovorite i vratite se na tijek priče.</li>
    </ul>

    <h3>Tijek izlaganja</h3>
    <div class="agenda">
      <div><b>Uvod</b><span>tradicija stara 143 godine</span></div>
      <div><b>1. dio &nbsp; Gdje smo bili</b><span>tri problema, prije i poslije</span></div>
      <div><b>2. dio &nbsp; Novi dom: moreska.eu</b><span>stranica, ulaznice, QR kod</span></div>
      <div><b>3. dio &nbsp; Prodaja posvuda</b><span>partnerska prodaja</span></div>
      <div><b>4. dio &nbsp; Ponovno vidljivi</b><span>Google, društvene mreže</span></div>
      <div><b>5. dio &nbsp; Temelji</b><span>vlastiti alati i brojevi</span></div>
      <div><b>Zaključak</b><span>sve je sada naše, temelj za budućnost</span></div>
    </div>
  </div>

  {rows_html}

  <div class="foot">HGD Sveta Cecilija · Korčula · moreska.eu</div>
</body></html>"""

os.makedirs(os.path.dirname(OUT_HTML), exist_ok=True)
with open(OUT_HTML, "w", encoding="utf-8") as f:
    f.write(doc)
print("wrote", OUT_HTML, f"({len(doc)//1024} KB)")
