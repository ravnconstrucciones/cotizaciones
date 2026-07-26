# 0005 — Mesa de cotización conversacional: motores locales por suscripción

**Fecha:** 2026-07-25
**Estado:** vigente

## ¿Por qué hicimos esto?

La spec del 2026-07-25 pide que la mesa de revisión (`/cotizaciones/[id]/revision`)
deje de ser un formulario y pase a ser una charla a tres voces (Eze, Fable,
Codex) que arma el desglose, redacta la propuesta y clasifica fotos en vivo,
igual que Eze ya trabaja con Claude Code en la terminal. Para eso hacía falta
un motor que escuche la mesa y responda — sin duplicar la sesión de Claude que
Eze ya paga y sin meter otro proveedor de IA a facturar por llamada.

## ¿Qué alternativas había?

1. **API paga en Vercel** (Anthropic API + Codex API por HTTP, corriendo como
   function del propio Next.js), facturada por token/llamada.
2. **Todo por `trabajos_cola`**, reusando el mecanismo bot↔Mac existente
   (encolar y que el daemon de jobs lo levante en su próximo tick).
3. **Motores locales por suscripción** (Claude Code / Fable y Codex ya
   instalados en la Mac de Eze) escuchando Realtime, con un secret de agente
   para que puedan pegarle a `/api/*` como si fueran la app, y una tabla nueva
   de mensajes (`cotizacion_mensajes`) como canal de ida y vuelta.

## ¿Por qué las descartamos?

La opción 1 cobra por uso encima de una suscripción que ya cubre ese consumo
— exactamente el gasto que el resto del sistema evita (ver "Sonnet por
defecto", "vara de herramienta real"). La opción 2 no da conversación: el
runner de `daemon/jobs` corre cada 30 min y está pensado para jobs que
terminan y mueren, no para un chat con turnos en segundos ni para mantener una
sesión (`--resume`) por cotización; forzarlo ahí degrada tanto el job runner
como la mesa.

Se eligió la opción 3 porque reusa el stack sin costo marginal (motores ya
pagos por suscripción), y porque el problema real — que un proceso local
necesita escribir en la app como si fuera un usuario autenticado — se resuelve
con un secret acotado a `/api/*`, no con un router nuevo ni con RLS más laxo.

## ¿Qué implicancias tiene?

- Nuevo daemon `daemon/puente-cotizador/` (independiente de `com.ravn.jobs`),
  bajo `launchd` propio (`com.ravn.puente-cotizador`, `KeepAlive`) — vive
  escuchando, no corre-y-muere como los jobs.
- Bypass de middleware por header `x-ravn-agente` == `RAVN_AGENTE_SECRET`,
  **acotado a `/api/*`**: sin el secret configurado en el entorno, el bypass
  no existe (nunca abre `/api/*` por accidente en un deploy sin la env var).
- `cotizacion_mensajes` es el canal — Realtime ON, lectura `authenticated`,
  escritura siempre por service role (mismo patrón del resto del módulo).
  `puente_latidos` es el latido (una fila, `visto_at` cada 30 s) que la ruta
  `/mensajes` usa para mostrar "motor conectado/desconectado" (umbral 90 s).
- La sesión de Fable (`--resume`) es por cotización — el contexto de la charla
  vive en el proceso local, no en Supabase; si se pierde el estado de
  `~/.ravn-puente/`, se pierde el hilo de razonamiento (no los mensajes, que
  siguen en la tabla).
- Codex corre en paralelo a Fable solo para búsqueda de precios (doble fuente,
  luego consolidada) — no reemplaza al cotizador maestro ni decide precio;
  el margen y la emisión los sigue aprobando Eze (ver ADR 0003).
- Este motor NO es fuente de verdad de nada: si el puente está caído, la mesa
  sigue viva en modo lectura/escritura manual y el barrido (cada 60 s) resuelve
  los mensajes perdidos al reconectar.
