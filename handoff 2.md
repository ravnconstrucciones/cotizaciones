# Handoff — Sesión 2026-06-10

## Objetivo de la sesión
1. Análisis de gastos personales (BBVA + MercadoPago) y plan austero
2. Tracker de finanzas personales en App RAVN + bot WhatsApp
3. Adjuntar documentos (diagnóstico/presupuesto) a obras en historial

---

## Estado actual — QUÉ ESTÁ HECHO ✅

### Finanzas personales
- Análisis completo BBVA + MercadoPago Mayo-Junio 2026
- **Presupuesto definido:** $2,100,000 ingreso · $1,392,058 fijos · **$707,942 libre/mes · $23,600/día**
- Fijos: expensas $594,694 · servicios $200,000 · seguros $70,771 · comisión cuenta $55,289 · cuotas BBVA $145,163 · YPF $120,000 · subs digitales $153,000 · MP Créditos $53,141
- Límites semanales: Supermercado $50k · Delivery $8k · Salidas $30k · Varios $15k

### Bot WhatsApp (Railway — ya deployado)
- `supabaseService.js`: agrega `insertGastoPersonal()` → tabla `gastos_personales`
- `advisorService.js`: detecta gasto personal (super/delivery/salidas) vs obra; personal se guarda directo sin preguntar obra
- Commit pusheado: `fd7658d` en `ravnconstrucciones/ravn-bots`

### App RAVN (Vercel — buildando)
- `/finanzas` — página nueva: semáforo día/mes, barras por categoría, carga manual
- `/api/finanzas` — GET resumen + POST nuevo gasto
- Nav principal — link "Finanzas personales" agregado
- `src/lib/documentos-obra.ts` — config estática docs por presupuesto_id
- `historial-screen.tsx` — links de documentos por obra (acento distinto)
- `public/docs/` — 5 HTMLs: Diagnóstico/Materiales/Presupuesto Lagomarsino + Materiales/Presupuesto Container
- Commits pusheados a `main`: `a6f8dc3` (finanzas) + `2360df4` (docs)

### Supabase
- Tabla `gastos_personales` ya existía (verificado con REST API → devuelve `[]`)

---

## Archivos clave modificados

| Archivo | Estado |
|---------|--------|
| `/Users/ezeotero/Documents/ravn/src/app/finanzas/finanzas-screen.tsx` | NUEVO |
| `/Users/ezeotero/Documents/ravn/src/app/finanzas/page.tsx` | NUEVO |
| `/Users/ezeotero/Documents/ravn/src/app/api/finanzas/route.ts` | NUEVO |
| `/Users/ezeotero/Documents/ravn/src/app/page.tsx` | modificado (nav) |
| `/Users/ezeotero/Documents/ravn/src/lib/documentos-obra.ts` | NUEVO |
| `/Users/ezeotero/Documents/ravn/src/app/historial/historial-screen.tsx` | modificado (doc links) |
| `/Users/ezeotero/Documents/ravn/public/docs/` | 5 HTMLs nuevos |
| `/Users/ezeotero/Documents/ravn-bots/src/advisorService.js` | modificado |
| `/Users/ezeotero/Documents/ravn-bots/src/supabaseService.js` | modificado |

---

## Lo que se intentó y falló

- **Supabase MCP OAuth**: entorno non-TTY, no se pudo completar login interactivo
- **Supabase CLI login**: mismo problema, requiere TTY
- **Secret key `sb_secret_x4_qh...`** para Management API: devuelve "JWT could not be decoded" (es project key, no PAT)
- **Crear tabla `gastos_personales`**: innecesario, ya existía

---

## Pendientes inmediatos

1. **Verificar deploy Vercel** — confirmar que el build terminó sin errores
2. **Verificar Railway** — bot deployado con cambios del bot
3. **Probar flujo completo**: WhatsApp "gasté en Coto $40k" → aparece en `/finanzas`
4. **Cancelar Nous Research** — USD 35/mes tirados, pendiente del usuario
5. **Desactivar KlingAI** auto-recarga — créditos sueltos sin control

## Pendientes del usuario (features)
- Agregar documentos a futuras obras: editar `src/lib/documentos-obra.ts` con nuevo presupuesto_id + URLs
- Presupuesto Container Las Glorietas en Supabase está como `borrador` — puede cambiarse a `aprobado` desde la app

---

## Contexto de negocio relevante
- Ingreso declarado: $2,100,000/mes
- El bot de WhatsApp es la entrada principal de datos (no abrir la app)
- App RAVN = Next.js 15 + Supabase en `https://lryelzsstyghylphvgju.supabase.co`
- Repo: `ravnconstrucciones/cotizaciones` (branch `main` → Vercel auto-deploy)
- Bot: `ravnconstrucciones/ravn-bots` (branch `main` → Railway auto-deploy)
