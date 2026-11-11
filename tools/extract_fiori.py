"""Estrae livelli floreali trasparenti dall'invito originale.
Uso: python tools/extract_fiori.py <invito.webp> <cartella_output>
"""
import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
im = Image.open(src).convert('RGB')
P = np.asarray(im).astype(np.float32)
H, W = P.shape[:2]

BG = np.array([253, 244, 234], np.float32)

# 1. stima locale dello sfondo (vignettatura) con normalized convolution
d0 = np.linalg.norm(P - BG, axis=2)
fg0 = ndi.binary_dilation(d0 > 14, iterations=12)
w = (~fg0).astype(np.float32)
sig = 45
num = np.stack([ndi.gaussian_filter(P[..., c] * w, sig) for c in range(3)], -1)
den = ndi.gaussian_filter(w, sig)[..., None]
bgl = np.where(den > 1e-3, num / np.maximum(den, 1e-3), BG)

# 2. distanza dal fondo locale -> alpha morbida
d = np.linalg.norm(P - bgl, axis=2)
soft = np.clip((d - 5) / 22, 0, 1)

# 3. riempimento dei petali chiari racchiusi dai contorni
ratio = P / np.maximum(bgl, 1)
shadow = (ratio.std(axis=2) < 0.025) & (ratio.mean(axis=2) < 0.985)
core = ndi.binary_closing((d > 11) & ~shadow, iterations=3)
core = ndi.binary_fill_holes(core)
core = ndi.binary_opening(core, iterations=2)
core = ndi.binary_erosion(core, iterations=2)
corea = ndi.gaussian_filter(core.astype(np.float32), 1.6)
alpha = np.maximum(soft, corea)

# testo dell'invito: mai incluso negli asset
TEXT = [(330, 430, 1010, 910), (390, 1020, 980, 1420), (390, 1420, 880, 1565)]
for x0, y0, x1, y1 in TEXT:
    alpha[y0:y1, x0:x1] = 0

rgba = np.dstack([P, alpha * 255]).clip(0, 255).astype(np.uint8)
full = Image.fromarray(rgba, 'RGBA')


def ellipse_mask(box, feather):
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).ellipse(box, fill=255)
    return np.asarray(m.filter(ImageFilter.GaussianBlur(feather))).astype(np.float32) / 255


def save(name, box, mask=None, q=84):
    a = rgba.copy()
    if mask is not None:
        a[..., 3] = (a[..., 3] * mask).astype(np.uint8)
    img = Image.fromarray(a, 'RGBA').crop(box)
    bb = img.getchannel('A').point(lambda v: 255 if v > 3 else 0).getbbox()
    img.save(os.path.join(out, name + '.webp'), quality=q, method=6, exact=False)
    print(name, box, img.size, 'content bbox', bb)


# livelli posteriori completi
save('top-garland', (0, 0, W, 430))
save('bottom-bed', (0, 1010, W, H))
# livelli anteriori: rose Wollerton e bocciolo (sovrapposti nella stessa posizione)
save('rose-top', (370, 0, 820, 330), ellipse_mask((395, -60, 800, 315), 10))
save('rose-bottom-right', (700, 1560, 1270, H), ellipse_mask((730, 1590, 1250, 2040), 12))
save('rose-bottom-center', (430, 1820, 940, H), ellipse_mask((455, 1840, 915, 2100), 10))
save('rose-bud', (540, 1690, 740, 1850), ellipse_mask((560, 1700, 720, 1845), 6))
# rametto decorativo sotto il nome
sprig = rgba.copy()
sprig[..., 3] = 0
y0, y1, x0, x1 = 905, 985, 490, 860
sprig[y0:y1, x0:x1, 3] = (np.clip((d[y0:y1, x0:x1] - 4) / 18, 0, 1) * 255).astype(np.uint8)
Image.fromarray(sprig, 'RGBA').crop((x0, y0, x1, y1)).save(os.path.join(out, 'sprig.webp'), quality=90, method=6)

# anteprima su sfondo scuro per controllare i bordi
prev = Image.new('RGBA', (W, H), (60, 40, 30, 255))
prev.alpha_composite(full)
prev.convert('RGB').resize((W // 2, H // 2)).save(os.path.join(out, '_preview_dark.png'))
