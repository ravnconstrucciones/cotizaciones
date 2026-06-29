# Diseño: Arnés de Contexto para Claude Code
**Fecha:** 2026-05-27  
**Problema:** Ventana de contexto se llena desde el arranque porque el CLAUDE.md global carga 5+ archivos del vault de Obsidian en toda sesión, sin importar si es una sesión de código, estrategia o kaizen.

---

## Objetivo

Reducir el consumo de ventana de contexto haciendo que Claude solo cargue lo que es relevante al tipo de sesión. El vault de Obsidian actúa como índice inteligente, no como dump total al arranque.

---

## Arquitectura — 3 piezas

```
[CLAUDE.md global]
    └── lee siempre: _harness.md
                          │
              ┌───────────┴───────────┐
           CODE mode           ESTRATEGIA/KAIZEN mode
           (cero vault)         _chips/identidad-chip.md
                                _chips/ravn-chip.md
                                _chips/orientacion.md
                                (+ Inbox si "procesá inbox")
```

### Pieza 1: `CLAUDE.md` global (reemplazado)

Reducido a ~5 líneas. Su único trabajo es apuntar al harness:

```markdown
# Contexto global — Ezequiel Otero

Leer el archivo de despacho de contexto y seguir sus instrucciones exactamente:
`/Users/ezeotero/Library/Mobile Documents/iCloud~md~obsidian/Documents/ravn-seguimiento/_harness.md`
```

### Pieza 2: `_harness.md` en el vault (el dispatcher)

Archivo nuevo en la raíz del vault. Siempre pequeño (~80 líneas). Solo contiene reglas de ruteo, nunca contenido de negocio.

```markdown
# Arnés de Contexto — Dispatcher

## Reglas de detección

### MODO CODE
Activar cuando:
- El directorio de trabajo es un proyecto técnico (/ravn u otro repo)
- Y el primer mensaje es técnico (código, bugs, features, Next.js, Supabase, etc.)

→ No leer nada del vault. El CLAUDE.md del proyecto es suficiente.

### MODO ESTRATEGIA/KAIZEN (mismo flujo)
Activar cuando:
- No hay directorio técnico activo, O
- El primer mensaje menciona: negocio, Ravn, estrategia, decisión,
  kaizen, inbox, procesá, orientación, qué hago, cómo voy, cómo estoy

→ Leer en este orden:
  1. _chips/identidad-chip.md
  2. _chips/ravn-chip.md
  3. _chips/orientacion.md

→ Si el mensaje menciona "procesá" o "inbox":
  leer también Inbox/[archivo del día más reciente].md

## Override
Si el directorio es técnico pero el primer mensaje es claramente
estratégico/personal → activar MODO ESTRATEGIA/KAIZEN igual.
```

### Pieza 3: Chip files en `_chips/`

Versiones comprimidas de los archivos largos del vault. Los originales quedan intactos para lectura humana; los chips son exclusivamente para Claude.

**`_chips/identidad-chip.md`** — compresión de `Yo/Identidad.md` + `Yo/Patrones.md`  
Target: ≤200 palabras. Incluir: motor personal, valores centrales, patrones de comportamiento clave, cómo toma decisiones bajo presión.

**`_chips/ravn-chip.md`** — compresión de `Ravn/ADN.md` + `Ravn/Posicionamiento.md`  
Target: ≤200 palabras. Incluir: qué es Ravn, cliente ideal, diferencial, zona, modelo de negocio actual, visión inmobiliaria.

**`_chips/orientacion.md`** — archivo único sobreescrito al final de cada sesión kaizen  
Target: ≤150 palabras. Formato fijo: estado actual, patrón detectado, siguiente paso recomendado. NO es archivo de fecha, es un "estado presente" siempre vigente.

---

## Resultado esperado

| Tipo de sesión | Contexto cargado hoy | Contexto cargado con el arnés |
|---|---|---|
| Código (RAVN app) | ~1.500+ palabras (vault completo) | 0 palabras del vault |
| Estrategia/Kaizen | ~1.500+ palabras | ~550 palabras (3 chips) |

---

## Protocolo de mantenimiento

- **`_chips/identidad-chip.md` y `ravn-chip.md`**: actualizar cuando los archivos fuente cambien significativamente (no en cada sesión).
- **`_chips/orientacion.md`**: sobreescribir al final de cada sesión kaizen con el estado actual.
- **`_harness.md`**: actualizar cuando aparezcan nuevos tipos de sesión o nuevos nodos de contexto relevantes.

---

## Implementación — pasos

1. Crear `_harness.md` en la raíz del vault con el contenido de Pieza 2.
2. Crear carpeta `_chips/` en el vault.
3. Redactar `identidad-chip.md` y `ravn-chip.md` leyendo los archivos fuente y comprimiendo.
4. Crear `orientacion.md` con el estado actual (puede ser la última Orientación comprimida).
5. Reemplazar el contenido del CLAUDE.md global con las ~5 líneas de Pieza 1.
6. Verificar en una sesión de código que el vault no se carga.
7. Verificar en una sesión de estrategia que los 3 chips se cargan correctamente.
