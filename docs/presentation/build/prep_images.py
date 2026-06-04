#!/usr/bin/env python3
"""Prepare cinematic backgrounds, browser frames and crops for the board deck."""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PUB = os.path.join(ROOT, "public")
SHOTS = os.path.join(ROOT, "docs", "presentation", "shots")
BG = os.path.join(ROOT, "docs", "presentation", "assets", "bg")
FR = os.path.join(ROOT, "docs", "presentation", "assets", "frames")
for d in (BG, FR):
    os.makedirs(d, exist_ok=True)

W, H = 1920, 1080
MENLO = "/System/Library/Fonts/Menlo.ttc"

def cover(im, w, h):
    sw, sh = im.size
    scale = max(w / sw, h / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    im = im.resize((nw, nh), Image.LANCZOS)
    left = (nw - w) // 2
    top = (nh - h) // 2
    return im.crop((left, top, left + w, top + h))

def make_bg(src, out, darken=0.42, focus_y=0.5, contrast=1.04):
    """Cover-crop to 16:9, darken, with brand-warm grade. focus_y biases vertical crop."""
    im = Image.open(os.path.join(PUB, src)).convert("RGB")
    sw, sh = im.size
    scale = max(W / sw, H / sh)
    nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
    im = im.resize((nw, nh), Image.LANCZOS)
    left = (nw - W) // 2
    top = int((nh - H) * focus_y)
    top = max(0, min(nh - H, top))
    im = im.crop((left, top, left + W, top + H))
    im = ImageEnhance.Contrast(im).enhance(contrast)
    im = ImageEnhance.Color(im).enhance(1.02)
    # uniform darken
    ov = Image.new("RGB", (W, H), (8, 7, 6))
    im = Image.blend(im, ov, darken)
    # bottom vignette gradient for caption legibility
    grad = Image.new("L", (1, H), 0)
    for y in range(H):
        t = y / H
        grad.putpixel((0, y), int(150 * max(0, (t - 0.45) / 0.55) ** 1.4))
    grad = grad.resize((W, H))
    black = Image.new("RGB", (W, H), (5, 4, 3))
    im = Image.composite(black, im, grad)
    im.save(os.path.join(BG, out), "PNG")
    print("bg ", out)

def browser_frame(src, out, url, max_w=1500, scale_pct=100):
    """Wrap a screenshot in a dark rounded browser chrome with soft shadow."""
    im = Image.open(os.path.join(SHOTS, src)).convert("RGB")
    sw, sh = im.size
    tw = int(max_w * scale_pct / 100)
    th = int(sh * tw / sw)
    im = im.resize((tw, th), Image.LANCZOS)
    bar = max(38, int(tw * 0.045))
    rad = int(bar * 0.5)
    cw, ch = tw, th + bar
    card = Image.new("RGB", (cw, ch), (28, 25, 21))
    # top bar
    d = ImageDraw.Draw(card)
    # three dots
    r = max(5, bar // 8)
    cy = bar // 2
    for i, col in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        cx = bar // 2 + i * (r * 3)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
    # url pill
    pill_x0 = bar // 2 + 3 * (r * 3) + bar // 2
    pill_x1 = cw - bar // 2
    pill_h = int(bar * 0.56)
    pill_y0 = (bar - pill_h) // 2
    d.rounded_rectangle([pill_x0, pill_y0, pill_x1, pill_y0 + pill_h], radius=pill_h // 2, fill=(46, 42, 36))
    try:
        f = ImageFont.truetype(MENLO, int(pill_h * 0.5))
    except Exception:
        f = ImageFont.load_default()
    d.text((pill_x0 + pill_h // 2, bar // 2), url, font=f, fill=(176, 168, 152), anchor="lm")
    # paste screenshot
    card.paste(im, (0, bar))
    # rounded mask
    mask = Image.new("L", (cw, ch), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, cw - 1, ch - 1], radius=rad, fill=255)
    rounded = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    rounded.paste(card, (0, 0), mask)
    # shadow canvas
    pad = 70
    canvas = Image.new("RGBA", (cw + pad * 2, ch + pad * 2), (0, 0, 0, 0))
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([pad + 8, pad + 22, pad + cw + 8, pad + ch + 26], radius=rad, fill=(0, 0, 0, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(34))
    canvas = Image.alpha_composite(canvas, shadow)
    canvas.paste(rounded, (pad, pad), rounded)
    canvas.save(os.path.join(FR, out), "PNG")
    print("frame", out, canvas.size)

def crop(src, out, box_frac):
    im = Image.open(os.path.join(SHOTS, src)).convert("RGB")
    w, h = im.size
    l, t, r, b = box_frac
    im.crop((int(w * l), int(h * t), int(w * r), int(h * b))).save(os.path.join(FR, out), "PNG")
    print("crop", out)

# ---- backgrounds ----
make_bg("sword-clash.webp", "title.png", darken=0.5, focus_y=0.4)
make_bg("kraljevi.webp", "tradicija.png", darken=0.5, focus_y=0.35)
make_bg("torches.webp", "div-bili.png", darken=0.58, focus_y=0.45)
make_bg("kings-face-off.webp", "div-novi.png", darken=0.52, focus_y=0.4)
make_bg("moreska-wide.webp", "div-partneri.png", darken=0.55, focus_y=0.45)
make_bg("fila.webp", "div-vidljivi.png", darken=0.55, focus_y=0.4)
make_bg("crni-kralj.webp", "div-temelji.png", darken=0.55, focus_y=0.35)
make_bg("moreskanti-cool.webp", "recap.png", darken=0.6, focus_y=0.35)
make_bg("younglings.webp", "closing.png", darken=0.55, focus_y=0.3)
make_bg("top-end.webp", "plain1.png", darken=0.6, focus_y=0.4)
make_bg("sfida-wide.webp", "plain2.png", darken=0.6, focus_y=0.45)

# ---- browser frames ----
browser_frame("old-home.png", "old-home.png", "korcula-moreska.com", max_w=1400)
browser_frame("new-home-hr.png", "new-home.png", "moreska.eu", max_w=1500)
browser_frame("new-tickets-hr.png", "new-tickets.png", "moreska.eu/ulaznice", max_w=1300)
browser_frame("new-checkout-hr.png", "new-checkout.png", "moreska.eu/checkout", max_w=1300)
browser_frame("new-about-hr.png", "new-about.png", "moreska.eu/o-nama", max_w=1300)
browser_frame("admin-stats.png", "admin-full.png", "moreska.eu/admin", max_w=1300)

# ---- crops ----
# admin dashboard: trim the dev strip + issues badge at the very bottom (~last 13%)
crop("admin-stats.png", "dash-top.png", (0.02, 0.03, 0.98, 0.86))
# sales-channels band ("Prodajni kanali") sits near the bottom of the dashboard
crop("admin-stats.png", "channels.png", (0.04, 0.78, 0.96, 0.875))
# QR code square from the ticket view
crop("ticket-qr-hr.png", "qr.png", (0.35, 0.10, 0.65, 0.34))

print("DONE")
