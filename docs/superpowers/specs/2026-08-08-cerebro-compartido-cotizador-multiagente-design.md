# Cerebro compartido y cotizador multiagente — diseño

**Fecha:** 2026-08-08

**Estado:** aprobado conceptualmente por Ezequiel; pendiente de plan de implementación

**Alcance:** memoria compartida Codex–Claude–App RAVN y flujo formal de cotización especializado

## 1. Objetivo

Construir un sistema en el que Codex y Claude trabajen sobre la misma memoria durable sin releer conversaciones completas ni todo el Vault, y usar esa base para ejecutar cotizaciones mediante especialistas coordinados, formatos canónicos y cálculo determinístico.

El resultado debe garantizar:

- que los hechos, decisiones, métodos, evidencias, archivos y pendientes materiales sobrevivan a cada conversación;
- que App RAVN conserve la verdad operativa y Obsidian la memoria narrativa;
- que una conversación nueva recupere únicamente el contexto relevante, con un presupuesto de tokens acotado;
- que los trabajos similares permanezcan separados por identidad y alcance;
- que ninguna cotización se apruebe o emita automáticamente;
- que diagnóstico, costos y propuesta compartan una única ficha técnica y no se contradigan.

## 2. Decisiones de arquitectura

### 2.1 Memoria híbrida

Se conservarán dos capas por conversación:

1. **Archivo crudo:** transcripción completa normalizada, útil para auditoría y recuperación excepcional.
2. **Cierre estructurado:** resumen breve y tipado con lo que debe sobrevivir y alimentar el trabajo futuro.

Las transcripciones crudas no se incorporan al grafo ni a la recuperación cotidiana. Graphify indexa los cierres estructurados y las notas canónicas del Vault. Esto conserva trazabilidad sin multiplicar ruido ni tokens.

### 2.2 Una fuente por tipo de verdad

- **App RAVN / Supabase:** estados, IDs, cotizaciones, obras, clientes, precios, partidas, archivos y aprobaciones.
- **Obsidian:** contexto, razonamiento, métodos, decisiones, relaciones, aprendizajes e historia del trabajo.
- **Graphify:** índice derivado y conexiones; nunca reemplaza ni corrige silenciosamente las fuentes anteriores.
- **Transcripciones:** respaldo auditable, no fuente operativa ni contexto predeterminado.

### 2.3 Coordinación con especialistas

Un coordinador mantiene el expediente. Los especialistas reciben paquetes de contexto mínimos y devuelven salidas estructuradas. Ningún especialista vuelve a interpretar toda la conversación desde cero.

El motor de cantidades y totales es código determinístico, no un agente.

## 3. Memoria compartida

### 3.1 Estructura en el Vault

```text
Conversaciones/
  crudo/YYYY/MM/<fecha>-<host>-<thread_id>.md
  cierres/YYYY/MM/<fecha>-<tema>-<thread_id>.md
Sistema/Memoria/
  esquemas/cierre-conversacion.schema.json
  indices/entidades.json
  pendientes-escritura/
```

El directorio `Conversaciones/crudo/` debe estar excluido de Graphify mediante `.graphifyignore`. `Conversaciones/cierres/` sí entra al grafo.

### 3.2 Contrato del cierre estructurado

Cada cierre tendrá frontmatter validable:

```yaml
id: <id estable e idempotente>
thread_id: <id del chat>
host: codex | claude
fecha_inicio: <ISO-8601>
fecha_cierre: <ISO-8601>
tema: <título breve>
estado: completo | parcial | bloqueado
entidades:
  obras: []
  clientes: []
  cotizaciones: []
  documentos: []
sensibilidad: normal | restringida
fuente_cruda: <ruta relativa>
```

El cuerpo contendrá únicamente:

- hechos confirmados y su fuente;
- decisiones tomadas;
- método o criterio reusable;
- cambios realizados y ubicación;
- estado operativo verificado;
- dudas y pendientes reales;
- próximos pasos autorizados;
- separaciones de alcance explícitas;
- enlaces a notas canónicas y registros de App RAVN.

No se guardarán claves, tokens, cookies, secretos, volcados de variables de entorno ni salidas técnicas irrelevantes.

### 3.3 Captura en dos defensas

La persistencia no dependerá de que un agente recuerde hacerlo:

1. **Cierre en sesión:** Codex y Claude ejecutan el mismo comando de cierre antes de declarar terminado un trabajo material. El comando valida, escribe y devuelve evidencia de persistencia.
2. **Recolector de respaldo:** un job local inspecciona periódicamente los registros JSONL de ambos hosts, archiva transcripciones nuevas y detecta conversaciones sin cierre estructurado. Si falta un cierre, crea una tarea recuperable; no inventa el resumen en silencio.

Los adaptadores de Codex y Claude normalizan formatos diferentes hacia un mismo modelo. Cada mensaje conserva autor, fecha, tipo y referencia al hilo, pero las llamadas de herramientas voluminosas se resumen y se conserva un hash o puntero en lugar de duplicarlas completas cuando sea seguro.

### 3.4 Escritura y sincronización

- Escritura atómica: archivo temporal, validación y reemplazo.
- Idempotencia por `host + thread_id + fecha_cierre`.
- Antes de escribir: sincronizar el repositorio externo del Vault.
- Después de escribir: commit y push del Vault; si falla, conservar el cierre local y registrar el pendiente.
- Nunca insertar un `.git` dentro del Vault de iCloud; usar el git-dir externo existente.
- Un conflicto no se resuelve sobrescribiendo: se conserva ambas versiones y se genera un evento visible.

### 3.5 Recuperación acotada

Al iniciar una tarea material:

1. Extraer entidades y objetivo del pedido actual.
2. Consultar App RAVN por IDs o coincidencias inequívocas cuando el tema sea operativo.
3. Consultar Graphify y el índice de cierres.
4. Rankear por coincidencia de entidad, recencia, estado y relación en el grafo.
5. Entregar al agente un paquete limitado.

Presupuesto inicial recomendado:

- máximo 8 notas;
- máximo 3.000 tokens totales;
- prioridad: registros activos, decisiones y métodos canónicos;
- las transcripciones crudas solo se abren cuando una nota resumida apunta a ellas o falta evidencia exacta;
- si la confianza es baja, el agente declara la duda en vez de ampliar sin límite.

La búsqueda debe devolver también procedencia: archivo, sección, fecha y entidad que justificaron la selección.

### 3.6 Actualización semántica

- La nota nueva queda disponible inmediatamente por índice local de texto y entidades.
- Cada cierre encola una actualización incremental de Graphify. El runner agrupa cierres y la ejecuta dentro de los 15 minutos siguientes, como máximo una vez por intervalo; la recuperación inmediata no espera este paso porque usa el índice local.
- `job_cerebro` mantiene la consolidación nocturna completa y el diagnóstico estructural existente.
- `job_sinapsis` continúa proponiendo conexiones para aprobación; no crea vínculos dudosos automáticamente.

## 4. Cotizador multiagente

### 4.1 Expediente único

Cada cotización tiene un `expediente_id` y una ficha maestra. Todos los especialistas leen y escriben campos definidos del mismo expediente. Las salidas libres no constituyen verdad hasta ser consolidadas.

Campos mínimos:

- identidad de trabajo, obra y cliente;
- evidencia y procedencia;
- medidas confirmadas, inferidas y pendientes;
- estado observado;
- alcance propuesto y exclusiones;
- método técnico y contraste de fuentes;
- receta y parámetros;
- costos y fuentes fechadas;
- dudas materiales;
- estado de revisión;
- IDs de App RAVN y rutas del Vault.

### 4.2 Roles

#### Coordinador de cotización

- crea y nombra el expediente;
- evita mezclar trabajos parecidos;
- decide qué especialistas se ejecutan;
- entrega paquetes de contexto mínimos;
- consolida resultados en App RAVN y Obsidian;
- controla estados y bloqueos;
- nunca aprueba ni emite.

#### Diagnosticador técnico

- analiza fotos, videos, medidas, antecedentes y teoría aplicable;
- distingue observado, inferido y pendiente;
- produce una ficha técnica única;
- genera desde esa ficha dos vistas consistentes:
  - diagnóstico para cliente, claro y no técnico;
  - ficha para Fran/proveedor de mano de obra, con metraje, tareas, dificultad, reemplazos y puntos a cotizar.

El mismo diagnosticador es responsable de ambas vistas para impedir diferencias de alcance.

#### Investigador de precios de Internet

- busca precios actuales de materiales, logística, equipos y referencias de mano de obra;
- registra URL, fecha, unidad, zona, impuestos, flete, disponibilidad y rango;
- descarta publicaciones-placeholder o incompatibles;
- no calcula cantidades ni precio final.

#### Analista SISMAT

- busca partidas equivalentes de materiales y mano de obra;
- clasifica cada coincidencia como exacta, aproximada o ausente;
- conserva la descripción original;
- no transforma una referencia aproximada en precio definitivo.

Internet y SISMAT pueden ejecutarse en paralelo.

#### Motor determinístico

- valida parámetros y unidades;
- calcula cantidades, desperdicios, rendimientos y totales;
- produce bandas piso, objetivo y techo según reglas versionadas;
- rechaza fórmulas o parámetros incompletos;
- deja un desglose reproducible.

#### Cotizador

- contrasta fabricante, receta, Internet, SISMAT, maestro de precios y obras anteriores;
- elige referencias y explica divergencias;
- incorpora zona, logística, riesgo, margen y vencimientos;
- no modifica cantidades fuera del motor;
- deja la cotización en `en_revision` únicamente cuando la ficha y el motor pasan validación.

#### Redactor de propuesta

- consume diagnóstico y precio consolidados;
- redacta alcance, exclusiones, condiciones y propuesta comercial;
- usa la plantilla oficial versionada;
- no altera cantidades, precios o método técnico;
- produce borrador no emitido.

#### Revisor final

- compara evidencia, ficha maestra, documentos para cliente/Fran, receta, motor y propuesta;
- detecta contradicciones, faltantes y fuentes vencidas;
- verifica que App RAVN y Vault coincidan;
- confirma que el estado sea `en_revision`, nunca `aprobada` o emitida;
- Ezequiel conserva el gate final.

### 4.3 Flujo

```text
Entrada y evidencia
  → Coordinador crea expediente
  → Diagnosticador genera ficha técnica
      ↳ vista cliente
      ↳ ficha Fran/MO
  → Internet y SISMAT investigan en paralelo
  → Coordinador arma receta paramétrica
  → Motor determinístico calcula
  → Cotizador selecciona referencias y márgenes
  → Redactor genera propuesta borrador
  → Revisor verifica consistencia
  → App RAVN: en_revision
  → Ezequiel aprueba, corrige o rechaza
```

Si un dato no inferible cambia materialmente alcance o precio, el coordinador agrupa las dudas y hace una única ronda breve. No se pide a Ezequiel que diseñe el método ni enumere partidas.

## 5. Formatos canónicos

La consistencia se asegura con esquemas versionados y plantillas, no con instrucciones de estilo aisladas.

Artefactos mínimos:

- `expediente.schema.json`;
- `diagnostico-tecnico.schema.json`;
- `fuente-precio.schema.json`;
- `resultado-motor.schema.json`;
- plantilla de diagnóstico cliente;
- plantilla de ficha Fran/MO;
- plantilla de propuesta;
- checklist de revisión final.

Cada artefacto registra versión. Una propuesta indica qué versiones de ficha, receta, motor y plantilla utilizó.

## 6. Uso de tokens y costos

- Ningún especialista recibe la transcripción completa por defecto.
- Los paquetes se construyen por campos y referencias.
- Las búsquedas de Vault tienen presupuesto estricto y procedencia visible.
- SISMAT y cálculos son determinísticos y no consumen tokens de razonamiento.
- Las fuentes web se deduplican antes de resumirse.
- Los resultados de investigación se cachean con fecha de vencimiento.
- Un especialista no repite trabajo válido y vigente de otro expediente sin una razón explícita.
- El coordinador reutiliza la ficha maestra en vez de volver a narrar el caso a cada agente.

## 7. Errores y estados

Estados de una etapa: `pendiente`, `ejecutando`, `esperando_dato`, `completa`, `error`, `vencida`.

Reglas:

- un fallo parcial no borra resultados anteriores;
- cada etapa puede reintentarse idempotentemente;
- las fuentes vencidas bloquean el cierre de precio, no el diagnóstico;
- una escritura de App RAVN siempre se reconsulta;
- una escritura del Vault siempre se verifica y sincroniza;
- si App y Vault divergen, App manda en estado operativo y se abre una reparación del espejo;
- ninguna falla degrada silenciosamente una cotización a aprobada o emitida.

## 8. Seguridad y privacidad

- filtros de secretos antes de archivar;
- transcripciones crudas marcadas como restringidas y fuera de Graphify;
- rutas y permisos mínimos;
- hashes para comprobar integridad;
- trazabilidad de qué agente escribió cada dato;
- ninguna fuente externa puede introducir instrucciones ejecutables al expediente;
- borrado o retención futura se implementará con política explícita, no de manera accidental.

## 9. Integración con lo existente

Se conservan y amplían:

- Vault de Obsidian como cerebro narrativo;
- git-dir externo y remoto `boveda`;
- `job_cerebro`, actualización Graphify y diagnóstico nocturno;
- `job_sinapsis` con aprobación `UNIR/DESCARTAR`;
- App RAVN/Supabase como verdad operativa;
- tablas de cotizaciones, recetas, lecciones, eventos y trabajos;
- motor determinístico del cotizador;
- gate de revisión de Ezequiel.

No se reactiva el loop artístico del Organismo. Solo se reutiliza la infraestructura útil del cerebro autónomo.

## 10. Entregas por fases

### Fase 1 — memoria compartida mínima confiable

- esquemas de transcripción y cierre;
- adaptadores Codex y Claude;
- comando común de cierre;
- exclusión Graphify del archivo crudo;
- índice local y recuperación limitada;
- verificación, cola de fallos y sincronización del Vault.

### Fase 2 — recuperación automática

- paquete de contexto al inicio de tareas;
- consulta combinada App RAVN + Vault + Graphify;
- ranking, procedencia y presupuesto de tokens;
- incremental inmediato y consolidación nocturna.

### Fase 3 — cotizador multiagente

- expediente y esquemas canónicos;
- coordinador y especialistas;
- ejecución paralela Internet/SISMAT;
- integración con receta y motor;
- doble diagnóstico, propuesta y revisión.

### Fase 4 — endurecimiento y observabilidad

- panel de salud de memoria;
- cobertura de cierres faltantes;
- medición de tokens evitados;
- pruebas de recuperación entre Codex y Claude;
- alertas de divergencia App/Vault.

## 11. Pruebas de aceptación

### Memoria

1. Codex registra una decisión; Claude la recupera en otra conversación sin recibir el chat original.
2. Claude registra un método; Codex lo recupera por entidad y tema.
3. La recuperación usa como máximo el presupuesto configurado y no abre transcripciones crudas sin justificación.
4. Dos trabajos similares no mezclan IDs, superficies, fotos ni partidas.
5. Si falla el push del Vault, el cierre local persiste y aparece un pendiente visible.
6. El mismo hilo procesado dos veces no duplica archivos ni hechos.

### Cotizador

1. Cliente y Fran reciben documentos derivados del mismo diagnóstico y metraje.
2. Internet y SISMAT muestran procedencia, fecha y calidad de coincidencia.
3. Cantidades y totales provienen únicamente del motor.
4. El redactor no puede alterar campos económicos.
5. El revisor detecta una contradicción introducida deliberadamente.
6. El resultado final queda en `en_revision` y requiere acción explícita de Ezequiel.

## 12. Fuera de alcance

- guardar cada salida técnica como conocimiento permanente;
- cargar transcripciones completas en prompts habituales;
- permitir que Graphify cambie datos operativos;
- aprobación o emisión automática de propuestas;
- reemplazar Obsidian por una base vectorial cerrada;
- reactivar o rediseñar la visualización artística del Organismo;
- desplegar antes de validar el circuito local Codex ↔ Vault ↔ Claude.
