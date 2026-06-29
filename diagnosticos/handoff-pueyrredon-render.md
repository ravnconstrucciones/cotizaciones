# Handoff — Baño Pueyrredón (render celeste + cotizaciones A/B) · 2026-06-24

## Estado: TERMINADO ✅
Tarea cerrada. Este handoff es solo referencia para la próxima sesión.

## Qué se hizo
1. **Presupuesto Opción C** (`diagnosticos/Presupuesto_Bano_Pueyrredon_OpcionC.html/pdf`): se agregó apartado **"Mueble de diseño a medida"** (laqueado a medida + cajonera, SIN color) y **"Reemplazo de cañería de plomo — Adicional"** (texto "se incluye", no "RAVN incluye"). Precio final **U$S 8.050** (pago 40/30/30 = 3.220/2.415/2.415).
2. **Render**: sobre `render_opcionC_FINAL.png` se pasó a celeste una franja de la pared salmón izquierda (entre espejo y esquina). Método ganador: fan-out 8 variantes Gemini → injertar SOLO la franja de la mejor (v6, gemini-3-pro-image) sobre el original con máscara geométrica = calidad Gemini + cero drift. Eligió ancho **C (ancha)**. Detalle técnico guardado en memoria [[ravn-render-obras-metodo]].
3. **Dos PDF de un solo render**: `Presupuesto_Bano_Pueyrredon_A.pdf` (pared salmón) y `..._B.pdf` (acento celeste). Texto idéntico, 8.050 ambos. Renders: `render_oficial_salmon.png` (A) y `render_opcionB_celeste.png` (B). Backup del original: `render_opcionC_FINAL_PRECELESTE.png`.

## App RAVN (tabla cotizaciones, bucket obra-archivos) — SUBIDO
- **A** = `9b4e12b2-7e51-4c1a-8f21-691526bc7e62` → "Baño Pueyrredón — Opción A (pared salmón)", portada salmón + 1 PDF (A). en_revision.
- **B** = `47b4b9f8-e53c-4fe3-ad18-554dbbc989fa` (NUEVA, duplicada de A) → "Baño Pueyrredón — Opción B (acento celeste)", portada celeste + 1 PDF (B). en_revision.
- Convención: portada `portadas-cotizacion/{id}/{ts}.png` + `cotizaciones.foto_portada_path`; PDF `propuestas/{id}/{ts}.pdf` + fila en `cotizacion_archivos`. Subida directa con service-role (script `scratchpad/upload_ravn.py`).
- Nota: el precio que muestra la app es el rango interno del cotizador (total_min/max en ARS), NO el 8.050 USD — ese va en el PDF.

## Pendiente (si Eze quiere)
- Aprobar/emitir A y B desde la mesa de revisión (eso lo hace Eze en la app, nunca el agente).
- Nada más crítico abierto.
