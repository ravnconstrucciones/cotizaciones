<!-- RAVN_MEMORIA_COMPARTIDA:START -->
## Memoria compartida RAVN

- Antes de todo trabajo material de RAVN, ejecutá `ravn-memoria recuperar --vault "/Users/ezeotero/Obsidian/RAVN" --query "<objetivo y entidades inequívocas>"`; agregá `--entidad "<obra, cliente o cotización>"` por cada entidad conocida. Si falla, informalo inmediatamente.
- No leas `Conversaciones/crudo/` por defecto. Abrí una transcripción cruda sólo cuando un cierre resumido la señale o falte evidencia exacta.
- Antes de afirmar que el trabajo terminó, generá un cierre JSON conforme a `/Users/ezeotero/Obsidian/RAVN/Sistema/Memoria/esquemas/cierre-conversacion.schema.json` y pasalo por stdin: `ravn-memoria cerrar --vault "/Users/ezeotero/Obsidian/RAVN" < "/ruta/al/cierre-conversacion.json"`. `cerrar` consume JSON estructurado por stdin; `--session-path`, `--host` y `--thread-id` son opcionales. Si falla, informalo inmediatamente y no afirmes persistencia.
- Persistí los IDs y el estado operativo en App RAVN; persistí el contexto narrativo, las decisiones y los criterios en Obsidian.
- Identificá explícitamente cada trabajo parecido por cliente, ubicación, alcance e ID disponible para no mezclar alcances ni antecedentes.
<!-- RAVN_MEMORIA_COMPARTIDA:END -->
