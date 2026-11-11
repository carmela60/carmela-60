"""Compone l'anteprima social (og.jpg) e le favicon. Uso: python tools/og_image.py <invito.webp> <public/fiori> <public>"""
import sys
from PIL import Image
import numpy as np
def fade(im, side):
    a=np.asarray(im).copy(); w=a.shape[1]; n=int(w*.35)
    ramp=np.linspace(0,1,n)
    if side=='right': a[:, w-n:, 3]=(a[:, w-n:, 3]*ramp[::-1]).astype(np.uint8)
    else: a[:, :n, 3]=(a[:, :n, 3]*ramp).astype(np.uint8)
    return Image.fromarray(a,'RGBA')
src, fiori, out = sys.argv[1], sys.argv[2], sys.argv[3]
BG=(253,244,234)
inv=Image.open(src).convert('RGB')
W,H=1200,630
c=Image.new('RGBA',(W,H),BG+(255,))
g=Image.open(f'{fiori}/top-garland.webp'); s=1.0
g=g.resize((int(1333*s),int(430*s)),Image.LANCZOS); c.alpha_composite(g,((W-g.width)//2,-60))
bed=Image.open(f'{fiori}/bottom-bed.webp')
bl=fade(bed.crop((0,330,470,990)),'right'); bl=bl.resize((int(bl.width*.62),int(bl.height*.62)),Image.LANCZOS); c.alpha_composite(bl,(-10,H-bl.height+40))
br=fade(bed.crop((900,150,1333,990)),'left'); br=br.resize((int(br.width*.62),int(br.height*.62)),Image.LANCZOS); c.alpha_composite(br,(W-br.width+10,H-br.height+40))
t=inv.crop((340,440,1010,985)); sc=0.66; t=t.resize((int(t.width*sc),int(t.height*sc)),Image.LANCZOS)
# testo come moltiplicazione sul fondo (preserva il colore dell'inchiostro)
from PIL import ImageChops
m=Image.new('RGB',(W,H),(255,255,255)); 
tt=ImageChops.add(t, Image.new('RGB',t.size,(255-BG[0],255-BG[1],255-BG[2])))  # sfondo crema -> bianco
m.paste(tt,((W-t.width)//2,262))
c=ImageChops.multiply(c.convert('RGB'),m)
c.save(f'{out}/og.jpg',quality=86,optimize=True,progressive=True)
# favicon: la rosa Wollerton
r=Image.open(f'{fiori}/rose-top.webp'); side=300; box=(225-side//2+0,10,225+side//2,10+side)
ic=Image.new('RGBA',(side,side),BG+(255,)); ic.alpha_composite(r.crop(box))
ic.convert('RGB').resize((180,180),Image.LANCZOS).save(f'{out}/apple-touch-icon.png',optimize=True)
ic.resize((48,48),Image.LANCZOS).save(f'{out}/favicon.png',optimize=True)
