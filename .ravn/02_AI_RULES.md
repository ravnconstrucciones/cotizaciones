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
