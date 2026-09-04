"""Informe RAVN — Vallas antes y después — Barrio Las Glorietas (v4, 03/09/2026 noche).

v4 = análisis exhaustivo foto por foto (chapa + marco + escena). Cambios contra v3:
- Fotos RECORTADAS a la valla (ventana 4:3 centrada en la valla), no plano general: el cambio se ve.
- Rótulos ANTES / DESPUÉS en banda completa sobre cada foto, con fecha. Inconfundibles.
- Fotos en carpeta PERMANENTE diagnosticos/vallas-fotos/ (ya no depende de ningún scratchpad).
- "Después" = foto de Eze del 03/09 con la valla en su lugar (+ pilar con lotes); si no hay, foto de Ever del 02/09.
- Estacionamiento: sección propia con la panorámica de Eze (8 vallas terminadas) + los 8 "antes".
"""
import base64, io, os, glob
from PIL import Image, ImageOps

BASE = '/Users/ezeotero/Documents/ravn/diagnosticos'
F = f'{BASE}/vallas-fotos'
os.chdir(F)
def U(n): return glob.glob(f'eze_0309/{n}_*.jpg')[0]   # foto de Eze 03/09 por número de envío

def crop_valla(im, vy, ratio=4/3):
    """Ventana de proporción `ratio` (ancho/alto) a todo el ancho, centrada verticalmente en vy (fracción)."""
    W, H = im.size
    if W / H < ratio:            # vertical: recorto alto
        h = int(W / ratio); top = int(vy * H - h / 2); top = max(0, min(H - h, top))
        return im.crop((0, top, W, top + h))
    else:                        # apaisada: recorto ancho, centrado
        w = int(H * ratio); left = (W - w) // 2
        return im.crop((left, 0, left + w, H))

def b64(path, vy=None, ratio=4/3, maxw=1100, q=84):
    im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    # 03/09 22:15 Eze: NINGUNA foto recortada → vy se ignora
    if im.width > maxw: im.thumbnail((maxw, maxw * 3))
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=q, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

CAT = {'sup': ('Recuperación superficial', '#e8b40a'),
       'int': ('Reparación intermedia', '#e0721c'),
       'itg': ('Reparación integral', '#c2271a')}
CAT_DESC = {'sup': 'Estructura sana, deterioro superficial',
            'int': 'Deformaciones o fijaciones comprometidas',
            'itg': 'Tramos vencidos o faltantes'}

# ---- DATOS ----------------------------------------------------------------
# Vía pública: (id, cat, antes, vy_antes, despues, vy_despues, fecha_despues, ubic=(foto pilar, texto) | None)
# vy = centro vertical de la valla en la foto (fracción de la altura) para el recorte 4:3.
# Cruce por chapa + marco + escena (análisis 03/09 noche). Filas con duda marcadas en el handoff.
VP = [
 #('SN','itg','eze_0109/valla-02-bochas-estacionamiento.jpg',0.5, U('02'),0.47,'3 sep', (U('01'),'Lotes 11 / 10')),  # CIRCULE con dos bochas, sin tiza; Eze 22:55: NO es la 2
 ('03','sup','antes/03.jpg',0.43, U('22'),0.44,'3 sep', (U('23'),'Lotes 162 / 161')),
 ('04','sup','antes/04.jpg',0.43, U('05'),0.58,'3 sep', (U('06'),'Lotes 63 / 62')),
 ('06','sup','antes/06.jpg',0.40, U('03'),0.52,'3 sep', (U('04'),'Lotes 59 / 58')),
 ('07','int','antes/07.jpg',0.50, 'despues_ever/07.jpg',None,'2 sep', None),
 ('08','int','antes/08.jpg',0.53, U('11'),0.47,'3 sep', (U('12'),'Lotes 135 / 136')),
 ('09','int','antes/09.jpg',0.52, U('09'),0.45,'3 sep', (U('10'),'Lotes 148 / 147')),
 ('10','int','antes/10.jpg',0.52, U('20'),0.44,'3 sep', (U('21'),'Lotes 158 / 157')),
 ('11','int','antes/11.jpg',0.43, 'despues_ever/11.jpg',None,'2 sep', None),
 ('13','sup','antes/13.jpg',0.65, U('08'),0.53,'3 sep', (U('07'),'De las Camelias 1-14 / 17-28')),  # bochas sacadas → tapas; reflectivos en ambos postes
 ('14','sup','antes/14.jpg',0.50, U('15'),0.54,'3 sep', (U('16'),'Lotes 282 / 281')),
 ('15','sup','antes/15.jpg',0.55, U('17'),0.49,'3 sep', (U('18'),'Lotes 173 / 174')),
 ('05','int','eze_0109/valla-05-tiza.jpg',0.52, U('14'),0.50,'3 sep', (U('12'),'Lotes 135 / 136')),  # Eze 04/09 00:40: la 'sin numeración' ES la N.º 5 (tiza 5, foto 01/09)
]
# Estacionamiento (terminadas, registro grupal en la panorámica del 03/09): (id, cat, antes, vy)
# Después = 8 fotos de Ever en el estacionamiento (03/09 13:47, reenviadas por Eze 22:07). Pareo por chapa donde se pudo:
# 1 = VELOCIDAD con reflectivos y 20 grisáceo; E4 = RADAR; el resto por tipo de chapa disponible.
DE = 'despues_estac/'
EST = [
 ('01','int','antes/01.jpg',0.38, DE+'13.48.05.jpeg',None,'3 sep', None),
 ('02','itg','antes/02.jpg',0.52, None,None,None, None),  # Eze 22:55: la 2 (IMG_8810) fue al estacionamiento
 ('12','int','antes/12.jpg',0.54, DE+'13.46.58.jpeg',None,'3 sep', None),  # Eze 04/09 00:40: vuelve al estacionamiento (coincide con la cartelería)
 ('E1','itg','antes/E1.jpg',0.45, DE+'13.47.15.jpeg',None,'3 sep', None),
 ('E2','int','antes/E2.jpg',0.5, DE+'13.47.36.jpeg',None,'3 sep', None),
 ('E3','int','antes/E3.jpg',0.5, DE+'13.47.26.jpeg',None,'3 sep', None),
 ('E4','sup','antes/E4.jpg',0.55, DE+'13.48.10.jpeg',None,'3 sep', None),
 ('E5','int','antes/E5.jpg',0.55, DE+'13.47.47.jpeg',None,'3 sep', None),
]
EST_IDS = {v[0] for v in EST}
PANORAMICA = U('19')
FECHA_ANTES = {'05': '1 sep', '02': '1 sep'}   # la N.º 5 se relevó el 01/09 (tiza "5"); el resto el 31/08

def lbl(i): return 'Sin numeración' if i=='SN' else (i if i.startswith('E') else f'N.º {int(i)}')
def nums(ids): return ', '.join('s/n' if i=='SN' else (i if i.startswith('E') else str(int(i))) for i in ids)

# ---- HTML -----------------------------------------------------------------
src = open(f'{BASE}/Informe_Relevamiento_Glorietas_Vallas.html').read()
head = src.split('</style>')[0]
footer = src[src.index('<div class="footer">'):]
footer = footer[:footer.index('</body>')]
footer = footer[:footer.rstrip().rfind('</div>')]

extra_css = '''
  .title-doc { font-size: 38pt; }
  .row { margin-bottom: 9mm; }
  .row-head { display: flex; align-items: baseline; gap: 4mm; padding-bottom: 1.6mm; margin-bottom: 2mm; border-bottom: 0.3pt solid var(--line); }
  .cap-ubic { font-size: 8.5pt; font-weight: 300; color: var(--soft); letter-spacing: 0.02em; }
  .cap-der { margin-left: auto; display: flex; align-items: center; gap: 2mm; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; align-items: start; }
  .ph { position: relative; overflow: hidden; background: #e6e2d8; width: 100%; height: 100mm; }
  .ph img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .cell .ph { height: 34mm; }
  .grid-est { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 4mm; }
  .grid-est .ph-g { height: 50mm; }
  .grid-est-3 { grid-template-columns: repeat(3, 1fr); }
  .grid-est-3 .ph-g { height: 66mm; }
  .grid-est .cell-cap { flex-direction: row; align-items: center; gap: 3mm; min-height: 4mm; }
  .grid-est .cell-cap .cap-der { margin-left: auto; }
  .ph-u { aspect-ratio: auto; height: 100%; }
  .ph-u img { object-position: 50% 20%; }
  .band { position: absolute; left: 0; right: 0; top: 0; padding: 1.7mm 2.6mm; font-size: 8pt; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; display: flex; justify-content: space-between; align-items: baseline; }
  .band small { font-weight: 400; letter-spacing: 0.08em; font-size: 7pt; text-transform: none; opacity: 0.85; }
  .band-antes { background: rgba(194,39,26,0.55); color: #f2efe8; }
  .band-despues { background: rgba(46,125,50,0.55); color: #f2efe8; }
  .band-ubic { background: rgba(7,7,7,0.62); color: #f2efe8; font-size: 6.5pt; padding: 1.4mm 2mm; }
  .ph-pend { border: 0.3pt solid var(--line); background: none; display: flex; align-items: center; justify-content: center; text-align: center; }
  .cols-head { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-bottom: 3mm; }
  .cols-head span { font-size: 7.5pt; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted); }
  .res-head, .res-row { grid-template-columns: 1fr 36mm; }
  .res-tot { color: var(--muted); font-weight: 300; }
  .res-cat-muted { font-weight: 400; color: var(--soft); }
  .res-total { border-bottom: none; padding-top: 4mm; }
  .res-total .res-cat-name { font-weight: 400; letter-spacing: 0.04em; text-transform: uppercase; font-size: 8.5pt; color: var(--muted); }
  .estado-lista { margin-top: 9mm; border-top: 0.3pt solid var(--line); padding-top: 4mm; display: flex; flex-direction: column; gap: 2.4mm; }
  .estado-fila { display: grid; grid-template-columns: 36mm 1fr; align-items: baseline; }
  .estado-lbl { font-size: 8.5pt; font-weight: 400; display: flex; align-items: center; gap: 2mm; }
  .estado-val { font-size: 8.5pt; font-weight: 300; color: var(--soft); line-height: 1.6; }
  .pano { position: relative; overflow: hidden; width: 100%; background: #e6e2d8; margin-bottom: 7mm; }
  .pano img { width: 100%; height: auto; display: block; }
  .grid-antes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm 3mm; }
  .cell { display: flex; flex-direction: column; gap: 1.5mm; }
  .cell-cap { display: flex; flex-direction: column; gap: 0.8mm; font-size: 9pt; font-weight: 500; }
  .cell-cap .cap-der { margin-left: 0; }
  .cell-cap .cap-cat { font-size: 7pt; font-weight: 300; }
'''
head = head.replace('<title>RAVN · Relevamiento de Vallas — Barrio Las Glorietas</title>',
                    '<title>RAVN · Relevamiento de vallas — Barrio Las Glorietas</title>') + extra_css + '</style>\n</head>\n<body>\n'

def page(title, body, sub=None, last=False):
    h = '<div class="page">\n  <div class="header"><span class="brand">R &nbsp;A &nbsp;V &nbsp;N .</span></div>\n'
    if title: h += f'  <div class="section-title">{title}</div><div class="section-rule"></div>' + (f'<p class="sec-sub">{sub}</p>' if sub else '')
    h += body
    if last: h += footer
    return h + '</div>'

def band(kind, text, date=None):
    d = f'<small>{date}</small>' if date else ''
    return f'<span class="band band-{kind}">{text}{d}</span>'

def cat_cap(cat):
    if cat: name, color = CAT[cat]; return f'<span class="cap-der"><span class="dot" style="background:{color}"></span><span class="cap-cat">{name}</span></span>'
    return '<span class="cap-der"><span class="cap-cat cap-cat-muted">Sin clasificar</span></span>'

def row_vp(v):
    vid, cat, a, vya, d, vyd, fd, u = v
    ub = (f'<span class="cap-ubic">Ubicación: {u[1]}</span>' if u else
          ('<span class="cap-ubic">Ubicación: Estacionamiento</span>' if vid in EST_IDS else '<span class="cap-ubic">Registro de obra del 2 de septiembre</span>'))
    ant = (f'<div class="ph"><img src="{b64(a, vya)}" alt="">{band("antes", "Antes", FECHA_ANTES.get(vid, "31 ago"))}</div>' if a else
           '<div class="ph ph-pend"><span class="cap-ubic" style="padding:6mm">Sin registro fotográfico previo.<br>Valla identificada en obra el 2 de septiembre, fuera del relevamiento del 31 de agosto.</span>' + band("antes", "Antes", "—") + '</div>')
    des = f'<div class="ph"><img src="{b64(d, vyd)}" alt="">{band("despues", "Después", fd)}</div>'
    return f'<div class="row"><div class="row-head"><span class="cap-num">{lbl(vid)}</span>{ub}{cat_cap(cat)}</div><div class="pair">{ant}{des}</div></div>'

cols_head = '<div class="cols-head"><span>Antes</span><span>Después</span></div>'

# ---- Portada --------------------------------------------------------------
ALL = [(v[0], v[1]) for v in VP] + [(v[0], v[1]) for v in EST]
n_total = len(ALL)
cat_rows = ''
for k in ('sup', 'int', 'itg'):
    tot = [i for i, c in ALL if c == k]
    cat_rows += f'''<div class="res-row">
    <div class="res-cat"><div class="res-cat-name"><span class="dot dot-lg" style="background:{CAT[k][1]}"></span>{CAT[k][0]}</div><div class="res-cat-unit">{CAT_DESC[k]}</div></div>
    <div class="res-cant"><span class="res-ok">{len(tot)}</span><span class="res-tot"> / {len(tot)}</span></div>
  </div>'''
sc = [i for i, c in ALL if c is None]
if sc:
    cat_rows += f'''<div class="res-row">
    <div class="res-cat"><div class="res-cat-name res-cat-muted"><span class="dot dot-lg" style="border:0.3pt solid rgba(7,7,7,0.4);background:none"></span>Sin clasificar en el relevamiento</div><div class="res-cat-unit">N.º {nums(sc)} — relevada el 1 de septiembre, fuera del informe del 31 de agosto</div></div>
    <div class="res-cant"><span class="res-ok">{len(sc)}</span><span class="res-tot"> / {len(sc)}</span></div>
  </div>'''
vp_ids = [v[0] for v in VP]; est_vp = [v[0] for v in EST if not v[0].startswith('E')]; est_e = [v[0] for v in EST if v[0].startswith('E')]
cover = f'''
  <div class="title-doc">Relevamiento<br>de vallas</div>
  <div class="meta">
    <span class="meta-label">Cliente</span><span class="meta-value">Barrio Las Glorietas</span>
    <span class="meta-label">Fecha</span><span class="meta-value">3 de septiembre de 2026</span>
    <span class="meta-label">Trabajo</span><span class="meta-value">Recuperación de vallas vehiculares — registro fotográfico final</span>
    <span class="meta-label">Referencia</span><span class="meta-value">Relevamiento del 31 de agosto de 2026 · Propuesta del 3 de agosto de 2026</span>
  </div>
  <div class="section-title">Resumen</div>
  <div class="section-rule"></div>
  <p class="intro">Las {n_total} vallas están terminadas. Registro fotográfico de cada una, antes y después.</p>
  <div class="res-head"><span>Categoría</span><span style="text-align:right">Terminadas / total</span></div>
  {cat_rows}
  <div class="res-row res-total">
    <div class="res-cat"><div class="res-cat-name">Total</div></div>
    <div class="res-cant"><span class="res-ok">{n_total}</span><span class="res-tot"> / {n_total}</span></div>
  </div>
  <div class="estado-lista">
    <div class="estado-fila"><span class="estado-lbl"><span class="dot" style="background:#070707"></span>Vía pública</span><span class="estado-val">N.º {nums(vp_ids)} — registro individual en su ubicación</span></div>
    <div class="estado-fila"><span class="estado-lbl"><span class="dot" style="border:0.3pt solid rgba(7,7,7,0.4);background:none"></span>Estacionamiento</span><span class="estado-val">N.º {nums(est_vp)} · {nums(est_e)} — reparadas en el estacionamiento</span></div>
  </div>
'''
pages = [page(None, cover)]

def chunks(l, n):
    for i in range(0, len(l), n): yield l[i:i+n]
first = True
for ch in chunks(VP, 2):
    t = 'Vía pública' if first else 'Vía pública — continuación'
    pages.append(page(t, cols_head + ''.join(row_vp(v) for v in ch),
                      sub='Cada valla en su estado previo y terminada en su lugar. La ubicación se indica con los números de lote.' if first else None))
    first = False

# Estacionamiento — Eze 22:45: las 8 ANTES por un lado y las 8 DESPUÉS por otro, SIN cruzar.
def cell(img, cap, kind, date):
    return f'<div class="cell"><div class="ph ph-g"><img src="{b64(img, maxw=900)}" alt="">{band(kind, "Antes" if kind=="antes" else "Después", date)}</div><div class="cell-cap">{cap}</div></div>'
antes_cells = ''.join(cell(v[2], f'{lbl(v[0])}{cat_cap(v[1])}', 'antes', FECHA_ANTES.get(v[0], '31 ago')) for v in EST)
desp_cells = ''.join(cell(DE+f, '', 'despues', '3 sep') for f in sorted(os.listdir(DE)) if f.endswith('.jpeg'))  # las 8 fotos de Ever del 03/09, sin cruce (Eze 22:50)
pages.append(page('Estacionamiento — antes', f'<div class="grid-est grid-est-3">{antes_cells}</div>',
                  sub='Ocho vallas reparadas en el estacionamiento: las cinco de los estacionamientos (E1 a E5) y cuatro retiradas de la vía pública (N.º 1, 2, 5 y 12).'))
pages.append(page('Estacionamiento — después', f'<div class="grid-est">{desp_cells}</div>',
                  sub='Vallas terminadas en el estacionamiento, registro del 3 de septiembre.', last=True))

out = head + '\n'.join(pages) + '\n</body>\n</html>\n'
open(f'{BASE}/Informe_Vallas_Glorietas_Antes_Despues.html', 'w').write(out)
print('ok', len(out)//1024, 'KB', 'pages', len(pages))
