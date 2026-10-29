"""يولّد أيقونة التطبيق وشاشة البداية (أصل مصنوع بالكود، بدون صور خارجية).
الاستعمال: python3 tools/make_icons.py
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android/app/src/main/res'
BG1, BG2 = (14, 42, 58), (31, 111, 139)


def gradient(size, inner=BG2, outer=BG1):
    img = Image.new('RGB', (size, size), outer)
    px = img.load()
    c = size / 2
    for y in range(size):
        for x in range(size):
            t = min(1, math.hypot(x - c, y - c * 0.85) / (size * 0.72))
            px[x, y] = tuple(int(inner[i] + (outer[i] - inner[i]) * t) for i in range(3))
    return img


def star8(d, cx, cy, r, fill=None, outline=None, width=1):
    pts = []
    for i in range(16):
        a = math.pi * i / 8 - math.pi / 2
        rr = r if i % 2 == 0 else r * 0.72
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(pts, fill=fill, outline=outline, width=width)


def drop(d, cx, cy, r, fill):
    # قطرة ماء: دائرة + مثلّث نحو الأعلى
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)
    h = r * 1.55
    d.polygon([(cx - r * 0.92, cy - r * 0.38), (cx, cy - h), (cx + r * 0.92, cy - r * 0.38)], fill=fill)


def logo(size, transparent=False, scale=1.0):
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0)) if transparent else gradient(S).convert('RGBA')
    d = ImageDraw.Draw(img)
    c = S / 2
    k = scale
    # إطار النجمة الثمانية بزوايا متّصلة (بدون فراغات)
    r, w = S * 0.40 * k, int(S * 0.02 * k)
    pts = []
    for i in range(16):
        a = math.pi * i / 8 - math.pi / 2
        rr = r if i % 2 == 0 else r * 0.72
        pts.append((c + rr * math.cos(a), c + rr * math.sin(a)))
    d.line(pts + pts[:2], fill=(227, 176, 75, 255), width=w, joint='curve')
    drop(d, c, c + S * 0.08 * k, S * 0.2 * k, (245, 250, 255, 255))
    drop(d, c - S * 0.04 * k, c + S * 0.11 * k, S * 0.11 * k, (79, 195, 247, 255))
    # لمعة
    sx, sy, sr = c + S * 0.2 * k, c - S * 0.2 * k, S * 0.07 * k
    d.polygon([(sx, sy - sr), (sx + sr * 0.25, sy - sr * 0.25), (sx + sr, sy), (sx + sr * 0.25, sy + sr * 0.25),
               (sx, sy + sr), (sx - sr * 0.25, sy + sr * 0.25), (sx - sr, sy), (sx - sr * 0.25, sy - sr * 0.25)], fill=(255, 236, 170, 255))
    return img.resize((size, size), Image.LANCZOS)


def rounded(img, radius):
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius, fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def circle(img):
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).ellipse([0, 0, img.size[0] - 1, img.size[1] - 1], fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


densities = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for name, f in densities.items():
    legacy = int(48 * f)
    fg = int(108 * f)
    base = logo(legacy)
    rounded(base, legacy * 0.18).save(RES / f'mipmap-{name}/ic_launcher.png')
    circle(base).save(RES / f'mipmap-{name}/ic_launcher_round.png')
    logo(fg, transparent=True, scale=0.62).save(RES / f'mipmap-{name}/ic_launcher_foreground.png')

for path in sorted(RES.glob('drawable*/splash.png')):
    w, h = Image.open(path).size
    bg = Image.new('RGB', (w, h), BG1)
    m = int(min(w, h) * 0.42)
    lg = logo(m, transparent=True)
    bg.paste(lg, ((w - m) // 2, (h - m) // 2), lg)
    bg.save(path)

logo(512).save(ROOT / 'store/icon-512.png')
print('ok')
