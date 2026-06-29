# RAVN · Cowork — Resumen de sesión

> Nota para Obsidian. Cubre todo lo construido y resuelto en esta sesión de trabajo con Claude Cowork.

---

## 1. Workflow de Diagnóstico Técnico

### Qué es
Un flujo completo para generar reportes de diagnóstico profesionales para clientes, a partir de fotos tomadas en visita de obra.

### Cómo funciona
1. **Mandás fotos** (HEIC desde iPhone) + descripción breve de cada problema + datos del cliente
2. Claude convierte las fotos, analiza cada problema, investiga precios actuales (MercadoLibre + fuentes online) y genera:
   - **HTML interactivo** (editable en browser, todos los campos son contenteditable)
   - **PDF de 3 slides** listo para enviar al cliente
3. Los archivos se guardan en `/ravn/diagnosticos/`

### Estructura del reporte (3 slides)
- **Slide 1 — Portada**: nombre del cliente, dirección, fecha, cantidad de problemas, REF RAVN
- **Slide 2 — Problema**: foto, zona, severidad (Leve / Moderada / Grave), diagnóstico técnico, solución completa + precio, solución parcial + precio
- **Slide 3 — Resumen económico**: tabla comparativa + nota técnica o bloque "incluye / no incluye"

### Casos realizados
| REF | Cliente | Problema | Precio completo |
|-----|---------|----------|----------------|
| 2026-001 | Lucila Lagomarsino · Villa Adelina | Luminaria + cableado + zócalo cerámico | $73k–$115k |
| 2026-002 | Federico Preiss · Homes 3 U20 | Humedad en techo por filtración | $280k–$420k |
| 2026-003 | Marisa Perazzo · Conesa 2171 | Fuente LED defectuosa en aplique | $65k–$110k |

### Criterio de precios (zona GBA Norte / barrio privado)
- Precios investigados en tiempo real: MercadoLibre + sitios de referencia
- Siempre con rango min–max, nunca valor exacto
- Zona premium: +15–20% sobre precio base de mercado
- Separación clara: solución completa vs. solución parcial/transitoria

---

## 2. App RAVN (Next.js 15 + Supabase)

### Stack
- **Framework**: Next.js 15 (App Router)
- **Backend**: Supabase
- **Deploy**: Vercel (proyecto `ravn-app`)
- **Repo**: `ravnconstrucciones/cotizaciones` en GitHub (rama `main`)
- **Tipografía**: Raleway (local)
- **Estilo**: minimalista, negro/blanco absoluto, cero border-radius

### Módulos implementados
- Presupuestos y propuestas
- Cashflow y gastos
- Maestro de precios
- Certificado de conformidad (con firma digital)
- Login + middleware de autenticación
- PWA (installable en iPhone como app)

### Deploy workflow
```bash
# Único comando necesario desde ahora:
git add -A && git commit -m "descripción" && git push origin main
```
Vercel detecta el push automáticamente y deploya. **No hace falta nada más.**

### Problema resuelto esta sesión
El proyecto `ravn-app` en Vercel **no estaba conectado a GitHub** — por eso ningún push disparaba deployments. Se conectó manualmente desde Vercel → Settings → Git → GitHub → `ravnconstrucciones/cotizaciones`.

### PWA / iPhone
- `public/apple-touch-icon.png` (180x180) — logo RAVN
- `public/icon-192.png` y `icon-512.png`
- `public/manifest.webmanifest` — standalone, fondo negro
- `src/app/layout.tsx` — meta tags apple explícitos en `<head>`
- `src/app/apple-icon.png` — para Next.js App Router

---

## 3. Diseño del diagnóstico — Stack visual

| Elemento | Valor |
|---------|-------|
| Tipografías | Raleway (900 para títulos) + Cormorant Garamond (serif) + Barlow (body) |
| Colores | `#070707` negro · `#f2efe8` blanco cálido · `#b8c8a0` verde salvia · `#5a5754` gris dim · `#6e1010` rojo oscuro |
| Tamaño slide | 1920×1080px (escala automática al viewport) |
| Fotos | Embebidas como base64 (sin dependencia externa) |
| Editable | Todos los textos y precios tienen `contenteditable="true"` |
| PDF | Generado con Playwright (screenshot por slide) + reportlab + pypdf |

---

## 4. Herramientas y MCPs activos

| Herramienta | Uso |
|------------|-----|
| **Claude Cowork** | Sesión principal, acceso a `/ravn/` |
| **Bash (sandbox Linux)** | Conversión HEIC→JPG, generación PDF, git push |
| **Claude in Chrome** | Navegación a Vercel para diagnóstico y conexión de repo |
| **WebSearch** | Investigación de precios en tiempo real |
| **Skills activas** | `cotizador-construccion`, `presupuesto-construccion`, `nanobanana-render` |

---

## 5. Carpetas del proyecto

```
/ravn/
├── diagnosticos/
│   ├── Diagnostico_Lagomarsino.html + .pdf
│   ├── Diagnostico_Preiss.html + .pdf
│   └── Diagnostico_Perazzo.html + .pdf
├── public/
│   ├── apple-touch-icon.png
│   ├── icon-192.png · icon-512.png · favicon.png
│   ├── manifest.webmanifest
│   └── firma-ravn.png
└── src/
    ├── app/
    │   ├── apple-icon.png · icon.png
    │   ├── layout.tsx (meta PWA)
    │   └── login/page.tsx
    └── middleware.ts
```

---

## 6. Pendientes / Próximos pasos

- [ ] Verificar que el logo RAVN aparezca correctamente en iPhone (requiere reinstalar PWA tras deploy)
- [ ] Verificar firma en certificado de conformidad en producción
- [ ] Escalar el workflow de diagnóstico: múltiples problemas por visita (ya probado con Lagomarsino, 2 problemas)
- [ ] Posible: numeración automática de REF desde Supabase

---

*Última actualización: Mayo 2026*
