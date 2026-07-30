# 0004 — Protocolo multiagente compartido

**Fecha:** 2026-07-23
**Estado:** vigente

## ¿Por qué hicimos esto?

Eze trabaja con Claude Code/Cowork y Codex en paralelo. Ambos necesitan aportar
al mismo cerebro y poder intervenir App RAVN sin convertir la coordinación en
copiar y pegar conversaciones ni crear estados contradictorios.

El sistema ya tenía sus piezas: el bot captura por WhatsApp y escribe el vault,
el daemon actualiza Graphify y publica el grafo en la app, y Supabase concentra
la operación. Faltaba la regla explícita que hace a esos flujos compartidos por
proveedor y auditables entre agentes.

## ¿Qué alternativas había?

1. Mantener una memoria y un flujo independiente por asistente.
2. Centralizar toda coordinación en un router/agente nuevo que medie cada
   conversación.
3. Usar las capas existentes — vault, Graphify y Supabase — como contrato
   común, con handoffs pequeños y persistencia según el tipo de dato.

## ¿Por qué las descartamos?

La memoria por asistente reproduce el punto ciego ya detectado: trabajo real
en terminal que no llega al vault. Un router agrega infraestructura, latencia y
otro punto de falla sin resolver mejor la trazabilidad.

Se elige la tercera opción porque aprovecha el stack desplegado, no duplica
datos y respeta la separación existente: conocimiento en Obsidian, relaciones
en Graphify y operación en Supabase/App RAVN.

## ¿Qué implicancias tiene?

- Claude Code, Codex y Cowork deben leer las reglas de `.ravn/` antes de
  intervenir el repositorio y dejar un handoff material al cerrar.
- Todo cambio operativo se confirma contra Supabase/App RAVN; el vault solo
  explica el contexto y enlaza la fuente viva.
- Nadie modifica artefactos generados de Graphify: se modifica la nota fuente
  y el ciclo `job_cerebro` vuelve a derivar y publicar el grafo.
- El bot de WhatsApp sigue siendo administrativo y liviano; no pasa a ser un
  router de conversaciones entre modelos.
- No cambia RLS, APIs, tablas ni permisos. Los cambios de runtime se diseñan y
  prueban como tareas separadas si luego hicieran falta.
