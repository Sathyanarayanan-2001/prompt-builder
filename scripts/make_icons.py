"""Generate the app icons (run once: python scripts/make_icons.py). Needs Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)
TEAL, INK, AMBER = (11, 107, 102), (255, 255, 255), (229, 205, 133)


def icon(size, maskable=False):
    s = 4  # supersample
    im = Image.new("RGBA", (size * s, size * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    S = size * s
    if maskable:
        d.rectangle([0, 0, S, S], fill=TEAL)
        pad = int(S * 0.2)
    else:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=TEAL)
        pad = int(S * 0.14)
    w = S - 2 * pad
    lw = max(4, int(w * 0.085))
    # chevron ">"
    x0, y0 = pad + int(w * 0.12), pad + int(w * 0.22)
    d.line([(x0, y0), (x0 + int(w * 0.3), pad + int(w * 0.47)), (x0, pad + int(w * 0.72))], fill=INK, width=lw, joint="curve")
    # cursor line in amber
    d.rounded_rectangle([pad + int(w * 0.52), pad + int(w * 0.66), pad + int(w * 0.9), pad + int(w * 0.66) + lw], radius=lw // 2, fill=AMBER)
    return im.resize((size, size), Image.LANCZOS)


icon(192).save(OUT / "icon-192.png")
icon(512).save(OUT / "icon-512.png")
icon(512, maskable=True).save(OUT / "icon-maskable-512.png")
icon(180, maskable=True).convert("RGB").save(OUT / "apple-touch-icon.png")
print("icons written to", OUT)
