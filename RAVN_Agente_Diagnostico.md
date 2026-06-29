# RAVN — Instrucciones completas para agente de diagnóstico técnico

> Documento autosuficiente. Un agente que lea esto debe poder replicar exactamente el mismo workflow, el mismo diseño y el mismo output (HTML + PDF) sin consultar nada externo.

---

## CONTEXTO DEL NEGOCIO

**RAVN Construcciones** es una empresa de construcción y reformas que opera en zona norte del GBA (Nordelta, barrios privados, CABA zona norte). El dueño visita clientes, detecta problemas y genera reportes de diagnóstico profesionales para presentarles. Los clientes son de alto poder adquisitivo.

El reporte se llama **Diagnóstico Técnico**. Tiene estética minimalista-arquitectónica premium: negro absoluto, blanco cálido, acento verde salvia. Tipografías Raleway + Cormorant Garamond + Barlow.

---

## WORKFLOW COMPLETO PASO A PASO

### Input que recibe el agente

El usuario manda:
1. Una o más **fotos** de problemas (formato HEIC desde iPhone, o JPG/PNG)
2. Una **descripción breve** de cada problema (ej: "humedad en techo", "fuente LED rota")
3. **Nombre del cliente** y **dirección**

### Paso 1 — Convertir fotos HEIC a JPG y codificar en base64

```python
import pillow_heif
pillow_heif.register_heif_opener()
from PIL import Image
import base64

img = Image.open('foto.HEIC')
img = img.convert('RGB')
img.thumbnail((1200, 1600), Image.LANCZOS)
img.save('foto_web.jpg', 'JPEG', quality=80)

with open('foto_web.jpg', 'rb') as f:
    b64 = base64.b64encode(f.read()).decode()
```

Si la foto ya es JPG o PNG, saltar la conversión HEIC y hacer solo el resize + base64.

### Paso 2 — Investigar precios actuales

**Para CADA problema detectado**, buscar precios en internet. Esto es crítico — los precios en Argentina cambian mes a mes.

#### Qué buscar y dónde:

**Búsquedas de mano de obra:**
- Query: `"precio mano de obra [tipo de trabajo] Argentina [año actual] por m2"`
- Query: `"cuánto cobra [electricista/pintor/plomero/gasista] por [trabajo] Argentina [año actual]"`
- Sitios útiles: clickie.com.ar, servidos.ar, homesolution.net/ar, impermeabilizacionesdetechos.com

**Búsquedas de materiales:**
- Query: `"[material] precio Argentina MercadoLibre [año actual]"`
- Directamente en: `listado.mercadolibre.com.ar/[nombre-del-material]`
- Sitios útiles: easy.com.ar, sodimac.com.ar, pricely.ar

**Ajuste por zona:**
- CABA y GBA Norte: precio base de mercado
- Barrios privados / countries zona norte (Nordelta, Pilar): **+15–20%** por logística, demoras en portería, acceso vehicular
- GBA Sur/Oeste: −5–10%

#### Tipos de trabajo más comunes y dónde buscar:

| Trabajo | Qué buscar en ML | Qué buscar para MO |
|---------|------------------|--------------------|
| Humedad/impermeabilización | "membrana liquida impermeabilizante 20kg" | "precio mano obra impermeabilizacion techo m2 argentina" |
| Electricidad / luminaria | "driver led [watts]" / "fuente led driver" | "precio electricista por hora argentina" |
| Pintura interior | "pintura latex interior 20 litros" + "enduido plastico" | "valor m2 pintura mano de obra argentina" |
| Zócalo cerámico | "adhesivo ceramico 25kg" / "sellador junta" | "precio colocacion ceramico m2 argentina" |
| Plomería | según caso | "precio plomero por hora argentina" |

### Paso 3 — Calcular rangos de precio

Siempre con **rango mínimo–máximo**, nunca un valor exacto. Armar dos opciones:

- **Solución completa**: resuelve el problema de raíz. Incluye materiales + mano de obra + garantía.
- **Solución parcial**: cuando aplica — alternativa de menor alcance, menor costo, con advertencia de limitaciones.

Si no existe solución parcial lógica, marcar la card como "No aplica" con opacidad reducida.

### Paso 4 — Generar el HTML del diagnóstico

Ver sección **CÓDIGO HTML COMPLETO** más abajo. El agente debe:
1. Tomar el template base
2. Reemplazar los placeholders con datos reales del cliente y del problema
3. Inyectar la foto como base64 en el `<script>` al final
4. Guardar en `/ravn/diagnosticos/Diagnostico_[Apellido].html`

### Paso 5 — Generar el PDF

```python
from playwright.sync_api import sync_playwright
from pypdf import PdfWriter, PdfReader
from reportlab.pdfgen import canvas as rl_canvas
from PIL import Image

html_path = '/ruta/Diagnostico_Cliente.html'
pdf_path  = '/ruta/Diagnostico_Cliente.pdf'

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})
    page.goto(f'file://{html_path}')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(2000)

    slides = page.query_selector_all('.slide')
    writer = PdfWriter()

    for i, slide in enumerate(slides):
        screenshot = slide.screenshot(type='jpeg', quality=92)
        tmp_jpg = f'/tmp/slide_{i}.jpg'
        with open(tmp_jpg, 'wb') as f:
            f.write(screenshot)
        img = Image.open(tmp_jpg)
        w, h = img.size
        tmp_pdf = f'/tmp/slide_{i}.pdf'
        c = rl_canvas.Canvas(tmp_pdf, pagesize=(w, h))
        c.drawImage(tmp_jpg, 0, 0, w, h)
        c.save()
        writer.add_page(PdfReader(tmp_pdf).pages[0])

    with open(pdf_path, 'wb') as f:
        writer.write(f)
    browser.close()
```

Dependencias: `playwright`, `pypdf`, `reportlab`, `pillow`, `pillow-heif`

---

## SISTEMA DE DISEÑO

### Paleta de colores
```css
--k:   #070707   /* negro casi puro — fondo de todos los slides */
--w:   #f2efe8   /* blanco cálido — texto principal */
--g:   #b8c8a0   /* verde salvia — acento, precios, tags activos */
--dim: #5a5754   /* gris oscuro cálido — texto secundario, labels */
--red: #6e1010   /* rojo oscuro — badge "Grave", alertas */
```

### Tipografías (Google Fonts)
```html
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,700;1,700&family=Raleway:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,300&family=Barlow:wght@300;400;500&display=swap" rel="stylesheet">
```

- **Raleway 900** → títulos grandes, números de slide de fondo, marca "RAVN."
- **Raleway 400–700** → labels, tags, precios, metadatos
- **Cormorant Garamond 700** → uso decorativo (no activo en versión actual)
- **Barlow 300–400** → texto de diagnóstico y descripciones (body)

### Tamaño del canvas
Cada slide: **1920 × 1080 px**. Se escala automáticamente al viewport con JavaScript.

### Badges de severidad
```html
<!-- Grave -->   <span class="bdg bdg-s">Grave</span>      <!-- fondo rojo oscuro -->
<!-- Moderada --> <span class="bdg bdg-m">Moderada</span>   <!-- borde verde salvia -->
<!-- Leve -->    <span class="bdg bdg-l">Leve</span>        <!-- borde gris oscuro -->
```

---

## ESTRUCTURA DE SLIDES

### Slide 1 — Portada
- Fondo negro
- "D" decorativa gigante en stroke muy tenue (fondo)
- Topbar: "RAVN." a la izquierda · "REF · 2026-XXX" a la derecha
- Título: "Diagnóstico" (filled) + "Técnico" (stroke outline)
- Grid inferior 4 columnas: Cliente · Dirección · Fecha · Cantidad de problemas

### Slide 2 (y siguientes si hay más problemas) — Problema N
- Topbar igual
- Layout: 3 columnas fijas → **460px | 1fr | 400px**
  - **Col 1** (460px): número de problema en stroke gigante de fondo, badge de severidad, zona + título del problema
  - **Col 2** (flexible): foto embebida como `<img>` con base64, fecha y referencia sobreimpresas
  - **Col 3** (400px): diagnóstico técnico en texto + card "Solución Completa" (fondo #111, borde superior verde) + card "Solución Parcial" (fondo transparente, borde tenue)
- Footer: URL + número de slide

### Slide final — Resumen económico
- Topbar igual
- Layout: 2 columnas 50/50
  - **Col izquierda**: texto "Inversión estimada" (título grande) + nota de pie en itálica
  - **Col derecha**: tabla con header blanco + filas por problema + fila total en verde salvia
  - Puede incluir bloque "Incluye / No incluye" en lugar de solución parcial si el trabajo es simple

---

## CÓDIGO HTML COMPLETO — TEMPLATE BASE

> Copiar este template y reemplazar todos los valores entre `{{ }}`.
> Para múltiples problemas: duplicar el "SLIDE PROBLEMA" y ajustar los números.

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RAVN · Diagnóstico Técnico — {{ APELLIDO_CLIENTE }}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,700;1,700&family=Raleway:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,300&family=Barlow:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  :root { --k:#070707; --w:#f2efe8; --g:#b8c8a0; --dim:#5a5754; --red:#6e1010; }
  * { box-sizing:border-box; margin:0; padding:0; }
  .slide { width:1920px; height:1080px; font-family:'Barlow',sans-serif; color:var(--w); background:var(--k); overflow:hidden; position:relative; display:block; margin-bottom:4px; }
  .stroke { font-family:'Raleway',sans-serif; font-weight:900; text-transform:uppercase; line-height:0.88; letter-spacing:-0.03em; color:transparent; -webkit-text-stroke:2px var(--w); }
  .stroke-dim { font-family:'Raleway',sans-serif; font-weight:900; text-transform:uppercase; line-height:0.88; letter-spacing:-0.03em; color:transparent; -webkit-text-stroke:1px #242424; }
  .label { font-family:'Raleway',sans-serif; font-weight:400; letter-spacing:0.22em; text-transform:uppercase; font-size:24px; color:var(--dim); }
  .fill { font-family:'Raleway',sans-serif; font-weight:900; text-transform:uppercase; line-height:0.88; letter-spacing:-0.03em; color:transparent; -webkit-text-stroke:2px var(--w); }
  .topbar { display:flex; justify-content:space-between; align-items:center; padding:36px 80px; position:relative; z-index:10; flex-shrink:0; }
  .brand { font-family:'Raleway',sans-serif; font-weight:300; font-size:28px; letter-spacing:0.35em; text-transform:uppercase; color:var(--w); }
  .topbar-label { font-family:'Raleway',sans-serif; font-weight:400; font-size:24px; letter-spacing:0.14em; text-transform:uppercase; color:var(--dim); }
  .photo { background:#0c0c0c; position:relative; display:flex; align-items:center; justify-content:center; overflow:hidden; }
  .photo::before { content:''; position:absolute; inset:20px; border:1px solid #1c1c1c; pointer-events:none; z-index:2; }
  .photo::after { content:''; position:absolute; width:24px; height:24px; border-left:1px solid var(--g); border-top:1px solid var(--g); top:28px; left:28px; pointer-events:none; z-index:2; }
  .photo .photo-ref { position:absolute; bottom:28px; right:32px; font-family:'Raleway',sans-serif; font-size:24px; letter-spacing:0.12em; color:rgba(242,239,232,0.55); z-index:3; }
  .photo .photo-date { position:absolute; top:28px; right:32px; font-family:'Raleway',sans-serif; font-size:24px; letter-spacing:0.08em; color:rgba(242,239,232,0.55); z-index:3; }
  .photo .corner-br { position:absolute; bottom:28px; left:28px; width:24px; height:24px; border-right:1px solid var(--g); border-bottom:1px solid var(--g); z-index:2; }
  .bcard { padding:22px 26px; display:flex; flex-direction:column; gap:12px; }
  .bcard.primary { background:#111; border-top:2px solid var(--g); }
  .bcard.secondary { background:transparent; border-top:1px solid #222; }
  .bcard .bc-tag { font-family:'Raleway',sans-serif; font-weight:600; font-size:18px; letter-spacing:0.2em; text-transform:uppercase; color:var(--g); }
  .bcard.secondary .bc-tag { color:var(--dim); }
  .bcard .bc-name { font-family:'Raleway',sans-serif; font-weight:700; font-size:24px; color:var(--w); line-height:1.15; }
  .bcard .bc-desc { font-family:'Barlow',sans-serif; font-size:21px; color:var(--dim); line-height:1.45; }
  .bcard .bc-price { font-family:'Raleway',sans-serif; font-weight:700; font-size:26px; color:var(--g); margin-top:auto; padding-top:14px; border-top:1px solid #222; }
  .bcard.secondary .bc-price { color:#444; }
  .bdg { font-family:'Raleway',sans-serif; font-weight:700; font-size:22px; letter-spacing:0.22em; text-transform:uppercase; padding:7px 18px; display:inline-block; }
  .bdg-s { background:var(--red); color:var(--w); }    /* Grave */
  .bdg-m { border:1px solid var(--g); color:var(--g); } /* Moderada */
  .bdg-l { border:1px solid #333; color:#555; }          /* Leve */
  body { background:#000; padding:20px; }
  .slide-wrapper { width:1920px; transform-origin:top left; margin-bottom:8px; }
  @media screen { body { display:flex; flex-direction:column; align-items:flex-start; } }
  [contenteditable="true"] { outline:1px dashed rgba(184,200,160,0.3); cursor:text; }
  [contenteditable="true"]:focus { outline:1px solid var(--g); }
</style>
</head>
<body>
<script>
  function scaleSlides() {
    const vw = window.innerWidth - 40;
    const scale = vw / 1920;
    document.querySelectorAll('.slide').forEach(s => {
      s.style.transform = `scale(${scale})`;
      s.style.transformOrigin = 'top left';
      s.parentElement.style.height = (1080 * scale) + 'px';
      s.parentElement.style.width = (1920 * scale) + 'px';
    });
  }
  window.addEventListener('load', scaleSlides);
  window.addEventListener('resize', scaleSlides);
</script>

<!-- ══ SLIDE 01 — PORTADA ══ -->
<div class="slide-wrapper">
<section class="slide" data-label="01 Portada">
  <div style="position:absolute;bottom:-60px;right:-20px;font-family:'Raleway',sans-serif;font-weight:900;font-size:580px;line-height:1;color:transparent;-webkit-text-stroke:1px #131313;letter-spacing:-0.04em;pointer-events:none;user-select:none;z-index:0;">D</div>
  <div class="topbar" style="border-bottom:1px solid #151515;">
    <span class="brand">RAVN.</span>
    <span class="topbar-label">REF &nbsp;·&nbsp; {{ REF }}</span>
  </div>
  <div style="position:relative;z-index:1;padding:60px 80px 0;display:flex;flex-direction:column;gap:8px;">
    <div class="label" style="margin-bottom:24px;">Informe de diagnóstico</div>
    <div style="font-family:'Raleway',sans-serif;font-weight:900;text-transform:uppercase;line-height:0.88;letter-spacing:-0.03em;color:var(--w);font-size:168px;margin-bottom:16px;">Diagnóstico</div>
    <div class="stroke" style="font-size:168px;-webkit-text-stroke:3px #f2efe8;">Técnico</div>
    <div style="border-top:1px solid #222;margin-top:48px;padding-top:36px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:0;">
      <div>
        <div class="label" style="font-size:20px;margin-bottom:8px;">Cliente</div>
        <div style="font-family:'Raleway',sans-serif;font-size:30px;font-weight:600;color:var(--w);" contenteditable="true">{{ NOMBRE_CLIENTE }}</div>
      </div>
      <div>
        <div class="label" style="font-size:20px;margin-bottom:8px;">Dirección</div>
        <div style="font-family:'Raleway',sans-serif;font-size:26px;font-weight:400;color:var(--dim);" contenteditable="true">{{ DIRECCION }}</div>
      </div>
      <div>
        <div class="label" style="font-size:20px;margin-bottom:8px;">Fecha</div>
        <div style="font-family:'Raleway',sans-serif;font-size:30px;font-weight:600;color:var(--w);" contenteditable="true">{{ DD · MM · AAAA }}</div>
      </div>
      <div>
        <div class="label" style="font-size:20px;margin-bottom:8px;">Problemas detectados</div>
        <div style="font-family:'Raleway',sans-serif;font-size:60px;font-weight:900;color:var(--g);line-height:1;">{{ N_PROBLEMAS }}</div>
      </div>
    </div>
  </div>
</section>
</div>

<!-- ══ SLIDE 02 — PROBLEMA 01 ══ -->
<!-- REPETIR ESTE BLOQUE POR CADA PROBLEMA ADICIONAL, cambiando 01→02, etc. -->
<div class="slide-wrapper">
<section class="slide" data-label="02 Problema 01" style="display:grid;grid-template-rows:auto 1fr auto;grid-template-columns:1fr;">
  <div class="topbar" style="border-bottom:1px solid #151515;grid-column:1;grid-row:1;">
    <span class="brand">RAVN.</span>
    <span class="topbar-label">Diagnóstico Técnico</span>
  </div>
  <div style="display:grid;grid-template-columns:460px 1fr 400px;grid-row:2;min-height:0;overflow:hidden;">

    <!-- COLUMNA 1: Identidad del problema -->
    <div style="border-right:1px solid #151515;padding:36px 36px 36px 80px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden;">
      <div class="stroke-dim" style="position:absolute;font-size:340px;bottom:-60px;left:-20px;letter-spacing:-0.06em;z-index:0;">01</div>
      <div style="position:relative;z-index:1;display:flex;flex-direction:column;gap:20px;">
        <!-- BADGE: usar bdg-s (Grave) / bdg-m (Moderada) / bdg-l (Leve) -->
        <span class="bdg bdg-m">{{ SEVERIDAD }}</span>
        <div>
          <div class="label" style="font-size:20px;margin-bottom:16px;">ZONA · {{ ZONA }}</div>
          <div class="fill" style="font-size:44px;line-height:0.94;" contenteditable="true">{{ TITULO_PROBLEMA }}</div>
        </div>
      </div>
    </div>

    <!-- COLUMNA 2: Foto -->
    <div class="photo" style="border-right:1px solid #151515;">
      <div class="corner-br"></div>
      <img id="photo-01" src="" alt="Foto problema" style="width:100%;height:100%;object-fit:cover;object-position:center;display:block;">
      <span class="photo-date">{{ DD.MM.AAAA }}</span>
      <span class="photo-ref">IMG · 01.A</span>
    </div>

    <!-- COLUMNA 3: Diagnóstico + Soluciones -->
    <div style="display:flex;flex-direction:column;overflow:hidden;">
      <div style="padding:28px 32px 20px 28px;border-bottom:1px solid #151515;flex-shrink:0;">
        <div class="label" style="font-size:20px;color:var(--g);margin-bottom:12px;">Diagnóstico</div>
        <p style="font-size:21px;color:var(--dim);line-height:1.55;font-weight:300;" contenteditable="true">{{ DESCRIPCION_TECNICA }}</p>
      </div>
      <div class="bcard primary" style="flex:1;">
        <div class="bc-tag">Solución Completa</div>
        <div class="bc-name" contenteditable="true">{{ NOMBRE_SOLUCION_COMPLETA }}</div>
        <div class="bc-desc" contenteditable="true">{{ DESC_SOLUCION_COMPLETA }}</div>
        <div class="bc-price" contenteditable="true">{{ PRECIO_COMPLETO }}</div>
      </div>
      <div class="bcard secondary" style="flex:1;border-top:1px solid #1a1a1a;">
        <!-- Si no hay solución parcial: agregar style="opacity:0.35;" a este div -->
        <div class="bc-tag">Solución Parcial</div>
        <div class="bc-name" contenteditable="true">{{ NOMBRE_SOLUCION_PARCIAL }}</div>
        <div class="bc-desc" contenteditable="true">{{ DESC_SOLUCION_PARCIAL }}</div>
        <div class="bc-price" style="color:#333;" contenteditable="true">{{ PRECIO_PARCIAL }}</div>
      </div>
    </div>
  </div>
  <div style="grid-row:3;border-top:1px solid #151515;padding:16px 80px;display:flex;justify-content:space-between;align-items:center;">
    <span class="label" style="font-size:22px;text-transform:lowercase;letter-spacing:0.08em;">ravnconstrucciones.com.ar</span>
    <span class="label" style="font-size:22px;">02 / {{ TOTAL_SLIDES }}</span>
  </div>
</section>
</div>

<!-- ══ SLIDE FINAL — RESUMEN ECONÓMICO ══ -->
<div class="slide-wrapper">
<section class="slide" data-label="Resumen Económico" style="display:grid;grid-template-rows:auto 1fr auto;">
  <div class="topbar" style="border-bottom:1px solid #151515;grid-column:1;grid-row:1;">
    <span class="brand">RAVN.</span>
    <span class="topbar-label">Diagnóstico Técnico</span>
  </div>
  <div style="grid-row:2;display:grid;grid-template-columns:1fr 1fr;min-height:0;">

    <!-- IZQUIERDA -->
    <div style="border-right:1px solid #151515;padding:48px 60px 40px 80px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden;">
      <div class="stroke-dim" style="position:absolute;font-size:480px;bottom:-120px;right:-80px;letter-spacing:-0.08em;z-index:0;">$</div>
      <div style="position:relative;z-index:1;">
        <div class="label" style="margin-bottom:28px;">Resumen económico</div>
        <div style="font-family:'Raleway',sans-serif;font-weight:900;text-transform:uppercase;line-height:0.88;letter-spacing:-0.03em;color:var(--w);font-size:104px;">Inversión</div>
        <div class="stroke" style="font-size:104px;line-height:0.88;-webkit-text-stroke:3px var(--w);">estimada</div>
      </div>
      <div style="position:relative;z-index:1;border-top:1px solid #1c1c1c;padding-top:28px;">
        <p style="font-size:23px;color:var(--dim);line-height:1.6;font-style:italic;max-width:520px;" contenteditable="true">
          {{ NOTA_PIE_RESUMEN }}
        </p>
      </div>
    </div>

    <!-- DERECHA: Tabla -->
    <div style="padding:48px 80px 40px 60px;display:flex;flex-direction:column;gap:0;justify-content:center;">
      <!-- Header tabla -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;background:var(--w);padding:16px 24px;">
        <span style="font-family:'Raleway',sans-serif;font-weight:700;font-size:22px;letter-spacing:0.14em;text-transform:uppercase;color:#080808;">Problema</span>
        <span style="font-family:'Raleway',sans-serif;font-weight:700;font-size:22px;letter-spacing:0.14em;text-transform:uppercase;color:#080808;">Sol. Completa</span>
        <span style="font-family:'Raleway',sans-serif;font-weight:700;font-size:22px;letter-spacing:0.14em;text-transform:uppercase;color:#080808;">Sol. Parcial</span>
      </div>

      <!-- FILA POR CADA PROBLEMA — repetir este bloque -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;padding:26px 24px;border-bottom:1px solid #1a1a1a;align-items:center;">
        <span style="font-family:'Raleway',sans-serif;font-size:24px;color:var(--dim);"><span style="color:var(--g);">01 &nbsp;</span>{{ LABEL_PROBLEMA }}</span>
        <span style="font-family:'Raleway',sans-serif;font-size:24px;color:var(--w);font-weight:600;" contenteditable="true">{{ PRECIO_COMPLETO }}</span>
        <span style="font-family:'Raleway',sans-serif;font-size:24px;color:var(--dim);" contenteditable="true">{{ PRECIO_PARCIAL_O_GUION }}</span>
      </div>

      <!-- Fila total -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;padding:28px 24px;background:var(--g);margin-top:32px;">
        <span style="font-family:'Raleway',sans-serif;font-weight:700;font-size:24px;letter-spacing:0.12em;text-transform:uppercase;color:#080808;">Total estimado</span>
        <span style="font-family:'Raleway',sans-serif;font-weight:900;font-size:28px;color:#080808;" contenteditable="true">{{ TOTAL_COMPLETO }}</span>
        <span style="font-family:'Raleway',sans-serif;font-weight:900;font-size:28px;color:#3a2a10;" contenteditable="true">{{ TOTAL_PARCIAL_O_GUION }}</span>
      </div>

      <!-- Nota de alerta (opcional — usar cuando la sol. parcial tiene riesgo) -->
      <div style="margin-top:40px;padding:24px;border:1px solid #1a1a1a;background:#0a0a0a;">
        <div class="label" style="font-size:18px;margin-bottom:12px;color:var(--red);">⚠ Nota técnica</div>
        <p style="font-family:'Barlow',sans-serif;font-size:20px;color:var(--dim);line-height:1.5;" contenteditable="true">{{ NOTA_ALERTA }}</p>
      </div>
    </div>
  </div>

  <div style="grid-row:3;border-top:1px solid #151515;padding:16px 80px;display:flex;justify-content:space-between;align-items:center;">
    <span class="label" style="font-size:22px;text-transform:lowercase;letter-spacing:0.08em;">ravnconstrucciones.com.ar</span>
    <span class="label" style="font-size:22px;">{{ SLIDE_ACTUAL }} / {{ TOTAL_SLIDES }}</span>
  </div>
</section>
</div>

<!-- Inyección de fotos por script — una línea por foto -->
<script>
  document.getElementById('photo-01').src = 'data:image/jpeg;base64,' + '{{ BASE64_FOTO_01 }}';
  /* Si hay más fotos:
  document.getElementById('photo-02').src = 'data:image/jpeg;base64,' + '{{ BASE64_FOTO_02 }}';
  */
</script>
</body>
</html>
```

---

## PLACEHOLDERS — Referencia completa

| Placeholder | Qué poner |
|-------------|-----------|
| `{{ APELLIDO_CLIENTE }}` | Apellido para el título del archivo |
| `{{ REF }}` | Número correlativo: 2026-001, 2026-002, etc. |
| `{{ NOMBRE_CLIENTE }}` | Nombre completo |
| `{{ DIRECCION }}` | Dirección exacta |
| `{{ DD · MM · AAAA }}` | Fecha con puntos medianos (ej: 13 · 05 · 2026) |
| `{{ N_PROBLEMAS }}` | Cantidad: 01, 02, 03 |
| `{{ SEVERIDAD }}` | Grave / Moderada / Leve |
| `{{ ZONA }}` | Ej: Techo / Cielorraso · Dormitorio / Aplique de pared |
| `{{ TITULO_PROBLEMA }}` | Título corto del problema (≤ 5 palabras) |
| `{{ DD.MM.AAAA }}` | Fecha con puntos normales para la foto |
| `{{ DESCRIPCION_TECNICA }}` | Párrafo técnico: qué se observa, causa probable, riesgo |
| `{{ NOMBRE_SOLUCION_COMPLETA }}` | Nombre de la intervención completa |
| `{{ DESC_SOLUCION_COMPLETA }}` | Descripción metodológica (qué se hace, cómo, con qué) |
| `{{ PRECIO_COMPLETO }}` | $ XXX.000 – $ XXX.000 |
| `{{ NOMBRE_SOLUCION_PARCIAL }}` | "No aplica" si no existe |
| `{{ DESC_SOLUCION_PARCIAL }}` | Descripción o "No existe alternativa de menor alcance..." |
| `{{ PRECIO_PARCIAL }}` | $ XXX.000 – $ XXX.000 o "—" |
| `{{ TOTAL_SLIDES }}` | N total de slides |
| `{{ NOTA_PIE_RESUMEN }}` | Texto itálico en la columna izquierda del resumen |
| `{{ LABEL_PROBLEMA }}` | Label corto para la tabla (ej: "Humedad en techo") |
| `{{ TOTAL_COMPLETO }}` | Suma de todos los precios completos |
| `{{ TOTAL_PARCIAL_O_GUION }}` | Suma o "—" |
| `{{ NOTA_ALERTA }}` | Texto de advertencia (cuándo omitir: si no hay riesgo en sol. parcial) |
| `{{ BASE64_FOTO_01 }}` | String base64 completo de la foto |

---

## CRITERIOS DE TEXTO TÉCNICO

### Descripción técnica del problema (diagnóstico)
- Extensión: 3–5 líneas
- Tono: técnico, preciso, sin adjetivos de relleno
- Estructura: (1) qué se observa, (2) causa probable, (3) riesgo si no se interviene
- Ejemplo bueno: *"Mancha de humedad en cielorraso sobre encuentro con muro, con decoloración del revestimiento. Evidencia de filtración proveniente de la losa de cubierta. Sin intervención, el daño avanza comprometiendo el revoque y la estructura del cielorraso."*

### Descripción de solución
- Extensión: 2–3 líneas
- Incluir: qué se desmonta, qué se aplica, qué se verifica, qué queda garantizado
- Ejemplo bueno: *"Aplicación de membrana líquida elastomérica en el sector de cubierta afectado (2 manos). Interior: remoción del revestimiento dañado, sellador hidrófugo, enduido antihumedad, pintura látex al tono existente."*

### Nota de alerta (slide resumen)
- Solo cuando la solución parcial deja un riesgo activo
- Ejemplo: *"Sin impermeabilización, la mancha reaparecerá con las primeras lluvias. Coordinar ambas intervenciones en una misma movilización reduce el costo total."*

---

## NUMERACIÓN DE REF

Correlativo por año: `2026-001`, `2026-002`, etc.
Llevar registro externo. Los casos de esta sesión:
- 2026-001 → Lagomarsino
- 2026-002 → Preiss
- 2026-003 → Perazzo

---

## ARCHIVOS DE SALIDA

```
/ravn/diagnosticos/
├── Diagnostico_[Apellido].html   ← Editable en browser, comparte con cliente
└── Diagnostico_[Apellido].pdf    ← 3 slides en PDF, resolución 1880×1058 px
```

Ambos archivos deben generarse siempre. El HTML es el original editable; el PDF es para envío formal.

---

*Documento generado en sesión Cowork — Mayo 2026*
*Válido para agente Hermes o cualquier sistema que lo implemente*
