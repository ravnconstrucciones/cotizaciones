> **Naturaleza:** INTENCIÓN
> **Última verificación:** 2026-07-23
> **Fuente:** spec 2026-07-23 (Eze + ChatGPT + Claude)

# Reglas para cualquier IA que trabaje en este proyecto

Estas reglas son agnósticas del proveedor. Aplican a Claude, Codex, Gemini,
Cursor o cualquier agente futuro.

## Rol
- El agente implementa dentro de la arquitectura definida. NUNCA cambia
  arquitectura crítica por iniciativa propia. Si cree que hay algo mejor:
  se detiene → explica por qué → ventajas → desventajas → espera aprobación.
- Toda decisión de producto la toma Eze (Product Owner).

## Reglas duras
1. Nunca romper compatibilidad de APIs o esquema sin aprobación explícita.
2. Nunca borrar ni editar migraciones ya aplicadas. Cambios de esquema = migración nueva.
3. No duplicar lógica: buscar si ya existe antes de escribir.
4. No agregar dependencias sin justificar por qué no alcanza lo que hay.
5. KISS: si una solución tarda 20 minutos en entenderse, es demasiado compleja.
6. Preferir funciones chicas, archivos enfocados, nombres descriptivos.
7. Ante la duda: preguntar, nunca asumir.
8. Decisión importante de arquitectura/producto → escribir ADR en `decisions/`.

## Checklist de cierre de toda tarea
- [ ] Compila (`npm run build` o el build del proyecto)
- [ ] Tests pasan
- [ ] No rompí compatibilidad
- [ ] Docs `.ravn/` afectados actualizados (con fecha de verificación)
- [ ] Sin código duplicado ni dependencias nuevas injustificadas
- [ ] Nombres claros, feature desacoplada

## Fuente de verdad
- `.ravn/` es el punto único de verdad para cualquier IA.
- Docs HECHOS: regenerables desde el código; ante conflicto, gana el código.
- Docs INTENCIÓN: solo se editan con Eze; el código NO los puede inferir.
- Doc con verificación >2 semanas = hipótesis, re-verificar antes de usar.

## Protocolo multiagente compartido

Claude Code, Codex, Cowork y cualquier agente futuro son **operadores del mismo
sistema**, no asistentes con memorias separadas. La coordinación no depende de
recordar un chat: depende de persistir cada resultado en la capa correcta.

1. **Supabase / App RAVN** es la verdad operativa: obras, cotizaciones, plata,
   tareas, eventos y estado de los procesos. Toda intervención de la app usa
   sus write-points o una migración nueva; nunca una copia paralela de datos.
   Si toca plata, se aplica además el ledger obligatorio de este archivo.
2. **Vault Obsidian** es la memoria: decisiones, contexto, conocimiento,
   handoffs, aprendizaje y estado explicable. No duplica números operativos
   que ya tienen fuente viva en Supabase.
3. **Graphify** es derivado del vault, nunca una fuente editable. Los agentes
   escriben la nota fuente; `daemon/jobs/job_cerebro.py` ejecuta el update
   incremental, publica `grafo-app.json` al bucket de la App y deja el grafo
   disponible en `/grafo`.
4. **Handoff mínimo:** al completar una decisión, deploy, migración, cambio de
   datos, entrega o bloqueo que otro agente pueda necesitar, registrar en el
   vault: `actor`, `fecha`, `acción`, `resultado`, `persistencia` y `siguiente
   paso`. No transcribir conversaciones ni registrar ruido.
5. Antes de intervenir, leer el estado fresco de la capa afectada y el último
   handoff relevante. Después de intervenir, dejar evidencia en el mismo
   circuito: evento/cola de Supabase para operación y nota o Inbox para
   contexto. `eventos.contenido.agente` identifica al operador cuando aplique.
6. El protocolo cotidiano y los límites de cada canal viven en
   `Sistema/Protocolo de agentes compartido.md` del vault. La decisión de
   arquitectura está en `decisions/0004-protocolo-multiagente-compartido.md`.
