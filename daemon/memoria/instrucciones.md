<!-- RAVN_MEMORIA_COMPARTIDA:START -->
## Memoria compartida RAVN

- Antes de todo trabajo material de RAVN, ejecutá `ravn-memoria recuperar --vault "/Users/ezeotero/Obsidian/RAVN" --query "<objetivo>"` y agregá las entidades inequívocas con su tipo: `--obra`, `--cliente`, `--cotizacion` o `--documento`. La recuperación consulta primero el estado operativo mínimo de App RAVN y luego el índice acotado del Vault; Graphify sólo aporta relaciones derivadas. Si una fuente no está disponible, informá su estado explícito y no rellenes el dato con memoria histórica.
- No leas `Conversaciones/crudo/` por defecto. Abrí una transcripción cruda sólo cuando un cierre resumido la señale o falte evidencia exacta.
- Antes de afirmar que el trabajo terminó, generá un cierre JSON conforme a `/Users/ezeotero/Obsidian/RAVN/Sistema/Memoria/esquemas/cierre-conversacion.schema.json` y pasalo por stdin: `ravn-memoria cerrar --vault "/Users/ezeotero/Obsidian/RAVN" < "/ruta/al/cierre-conversacion.json"`. `cerrar` consume JSON estructurado por stdin; `--session-path`, `--host` y `--thread-id` son opcionales. Código `0` confirma persistencia, índice, marcador Graphify y sincronización Git; código `4` indica que el flujo no quedó compartido: puede haber evidencia local pendiente o un guard de sincronización puede haber frenado antes de escribir. Ante `2`, `3` o `4`, informá exactamente el estado devuelto y no afirmes sincronización completa.
- Persistí los IDs y el estado operativo en App RAVN; persistí el contexto narrativo, las decisiones y los criterios en Obsidian.
- Identificá explícitamente cada trabajo parecido por cliente, ubicación, alcance e ID disponible para no mezclar alcances ni antecedentes.
<!-- RAVN_MEMORIA_COMPARTIDA:END -->
