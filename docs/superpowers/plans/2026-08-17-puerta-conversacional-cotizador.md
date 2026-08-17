# Puerta conversacional del cotizador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El chat pasa a ser la única puerta de entrada del cotizador: el visor abre en el composer vacío, el primer envío crea el expediente y despacha la ola de reconocimiento, la propuesta vuelve al hilo con el panel editable inline, y el clip de adjuntar vive siempre. El formulario `intake-gate.tsx` se borra.

**Architecture:** Enfoque A del spec (`docs/superpowers/specs/2026-08-17-puerta-conversacional-cotizador-design.md`): la caja conversacional despacha los circuitos EXISTENTES (intake y charla) según el momento del expediente. Cero cambios en contratos de intake, guard de recetas, pase, frontera de credenciales.

**Tech Stack:** Next.js 15 (App Router) + React 19 + Framer Motion, bridge Node (`bridge/server.mjs`), App RAVN por adapters con credenciales read/write. Tests con vitest (`npm test`).

## Global Constraints

- Copy institucional: **"trabajo", nunca "laburo"** en la UI (regla de Eze 17/08).
- **Orden inquebrantable:** primero PERSISTE (borrador/archivos/mensaje), después la ola. Nada se afirma sin verificarse (anti-slop): un aviso solo dice lo que realmente pasó.
- El working tree de `~/Documents/ravn` tiene cambios de OTRAS sesiones (`.ravn/`, `AGENTS.md`, `CLAUDE.md`, `docs/`, `daemon/memoria/`): **commitear SOLO los archivos de cada tarea**, nunca `git add -A`.
- `npm run build` pisa el `.next` del dev server: correr el build con el dev apagado o reiniciar el dev después.
- Verificación completa antes de cerrar: `cd apps/cotizador-ravn && npm test && npx tsc --noEmit && npm run lint && npm run build`, y `npm test` en la raíz (App RAVN). Navegador: `COTIZADOR_PREVIEW_ENABLED=1 npm run dev` → `http://localhost:3010/?preview=1&k=$COTIZADOR_ACCESS_KEY`; camino real con App RAVN local en :3000 y sin `?preview=1`. `TZ=UTC npm run dev` reproduce Vercel.
- **Deploy a producción NO es automático**: se le pide a Eze.
- Todos los paths relativos a `apps/cotizador-ravn/` salvo que se indique lo contrario.

---

### Task 1: Helpers puros de la entrada (`src/lib/entrada.ts`)

**Files:**
- Create: `src/lib/entrada.ts`
- Test: `src/lib/entrada.test.ts`

**Interfaces:**
- Produces:
  - `tituloProvisional(texto: string, nombresArchivos: string[]): string` — primer renglón no vacío del texto recortado a 60 chars; si no hay texto, nombre del primer archivo sin extensión; si no hay nada, `"Cotización nueva"`.
  - `textoConAdjuntos(texto: string, nombresArchivos: string[]): string` — el texto del mensaje con el pie `"Adjunté: a.pdf, b.jpg"`; con texto vacío devuelve solo `"Adjunté: …"`; sin archivos devuelve el texto tal cual.
  - `MomentoExpediente = "entrada" | "reconocimiento" | "charla"` y `momentoDelExpediente(args: { entrada: boolean; legacyState: string; preview: boolean }): MomentoExpediente` — `entrada` si no hay expediente elegido; `reconocimiento` si `legacyState === "borrador"` y no es preview; `charla` en el resto.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/entrada.test.ts
import { describe, expect, it } from "vitest";
import { momentoDelExpediente, textoConAdjuntos, tituloProvisional } from "./entrada";

describe("tituloProvisional", () => {
  it("usa el primer renglón no vacío del texto", () => {
    expect(tituloProvisional("\n Pintura interior 4x3 \ndetalle…", [])).toBe(
      "Pintura interior 4x3"
    );
  });
  it("recorta a 60 caracteres sin partir con puntos suspensivos", () => {
    const largo = "a".repeat(80);
    expect(tituloProvisional(largo, [])).toHaveLength(61); // 60 + "…"
    expect(tituloProvisional(largo, []).endsWith("…")).toBe(true);
  });
  it("sin texto usa el nombre del primer archivo sin extensión", () => {
    expect(tituloProvisional("  ", ["OT-husares.pdf", "foto.jpg"])).toBe("OT-husares");
  });
  it("sin texto ni archivos cae al genérico", () => {
    expect(tituloProvisional("", [])).toBe("Cotización nueva");
  });
});

describe("textoConAdjuntos", () => {
  it("suma el pie de adjuntos al texto", () => {
    expect(textoConAdjuntos("Va el plano.", ["plano.pdf"])).toBe(
      "Va el plano.\n\nAdjunté: plano.pdf"
    );
  });
  it("con texto vacío el mensaje ES el pie", () => {
    expect(textoConAdjuntos("", ["a.pdf", "b.jpg"])).toBe("Adjunté: a.pdf, b.jpg");
  });
  it("sin archivos no toca el texto", () => {
    expect(textoConAdjuntos("hola", [])).toBe("hola");
  });
});

describe("momentoDelExpediente", () => {
  it("entrada manda sobre todo", () => {
    expect(
      momentoDelExpediente({ entrada: true, legacyState: "aprobada", preview: false })
    ).toBe("entrada");
  });
  it("borrador real es reconocimiento", () => {
    expect(
      momentoDelExpediente({ entrada: false, legacyState: "borrador", preview: false })
    ).toBe("reconocimiento");
  });
  it("borrador en preview es charla (demo local)", () => {
    expect(
      momentoDelExpediente({ entrada: false, legacyState: "borrador", preview: true })
    ).toBe("charla");
  });
  it("el resto es charla", () => {
    expect(
      momentoDelExpediente({ entrada: false, legacyState: "en_revision", preview: false })
    ).toBe("charla");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/cotizador-ravn && npx vitest run src/lib/entrada.test.ts`
Expected: FAIL — módulo `./entrada` inexistente.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/entrada.ts
/**
 * Helpers puros de la puerta conversacional (spec 2026-08-17): de qué momento
 * está el expediente sale QUÉ ola despacha la caja, y de acá salen el título
 * provisional del borrador y el pie de adjuntos del mensaje.
 */

const TITULO_MAX = 60;

export function tituloProvisional(texto: string, nombresArchivos: string[]): string {
  const renglon = texto
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (renglon) {
    return renglon.length > TITULO_MAX ? `${renglon.slice(0, TITULO_MAX)}…` : renglon;
  }
  const archivo = nombresArchivos[0];
  if (archivo) return archivo.replace(/\.[^.]+$/, "");
  return "Cotización nueva";
}

export function textoConAdjuntos(texto: string, nombresArchivos: string[]): string {
  if (nombresArchivos.length === 0) return texto;
  const pie = `Adjunté: ${nombresArchivos.join(", ")}`;
  return texto.trim().length > 0 ? `${texto.trimEnd()}\n\nAdjunté: ${nombresArchivos.join(", ")}` : pie;
}

export type MomentoExpediente = "entrada" | "reconocimiento" | "charla";

export function momentoDelExpediente(args: {
  entrada: boolean;
  legacyState: string;
  preview: boolean;
}): MomentoExpediente {
  if (args.entrada) return "entrada";
  if (args.legacyState === "borrador" && !args.preview) return "reconocimiento";
  return "charla";
}
```

Ojo: en `textoConAdjuntos` el pie se construye UNA vez (sacá la duplicación del
template al escribirlo; el test fija el resultado, no la forma).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/entrada.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/cotizador-ravn/src/lib/entrada.ts apps/cotizador-ravn/src/lib/entrada.test.ts
git commit -m "feat(cotizador): helpers puros de la puerta conversacional"
```

---

### Task 2: Mudar el cliente de intake fuera del gate (`src/lib/intake-client.ts`)

El gate se va a borrar (Task 7), pero `subirUno` y `despacharOla` los necesitan
el composer y `reconocimiento-panel.tsx` (que hoy importa `despacharOla` de
`./intake-gate`, línea 10). Mudanza mecánica, sin cambios de lógica.

**Files:**
- Create: `src/lib/intake-client.ts`
- Modify: `src/components/intake-gate.tsx` (queda como re-export transitorio)
- Modify: `src/components/reconocimiento-panel.tsx:10`

**Interfaces:**
- Produces (mismas firmas que hoy en `intake-gate.tsx:30-100`):
  - `subirUno(cotizacionId: string, file: File): Promise<void>`
  - `despacharOla(cotizacionId: string, bridge: BridgeConfig | null): Promise<{ ok: boolean; mensaje: string }>`
  - `MULTIPART_MAX` (const, 4MB) y `jsonDe(res: Response)` quedan internos del módulo nuevo.

- [ ] **Step 1: Crear `src/lib/intake-client.ts`** copiando TAL CUAL de
  `src/components/intake-gate.tsx` las líneas 16-100 (`MULTIPART_MAX`, `jsonDe`,
  `subirUno`, `despacharOla`) con sus imports (`apiUrl` desde `./api-url`,
  `BridgeConfig` desde `../components/live-terminals`). Exportar `subirUno` y
  `despacharOla`.

- [ ] **Step 2: En `intake-gate.tsx`** borrar esas funciones y reemplazar por
  `import { despacharOla, subirUno } from "../lib/intake-client";` +
  `export { despacharOla };` (compatibilidad hasta que la Task 7 borre el
  archivo). En `reconocimiento-panel.tsx:10` cambiar el import a
  `from "../lib/intake-client"`.

- [ ] **Step 3: Verificar que no quedó nada colgado**

Run: `npx tsc --noEmit && npx vitest run && npm run lint`
Expected: typecheck limpio, 196 tests + 11 nuevos verdes, lint limpio.

- [ ] **Step 4: Commit**

```bash
git add apps/cotizador-ravn/src/lib/intake-client.ts apps/cotizador-ravn/src/components/intake-gate.tsx apps/cotizador-ravn/src/components/reconocimiento-panel.tsx
git commit -m "refactor(cotizador): cliente de intake a src/lib, fuera del gate"
```

---

### Task 3: El composer adjunta y despacha según el momento (`control-center.tsx`)

El corazón del cambio. `ControlCenter` gana el momento del expediente y el
composer gana archivos. Tres flujos de envío:

1. **entrada** → crea el expediente: `POST /api/intake` (título provisional) →
   `subirUno` por archivo → `POST /api/mensajes` con el texto (el primer
   mensaje del hilo) → `despacharOla` (intake) → `loadQuote(id)` y salir de
   entrada.
2. **reconocimiento** (borrador real) → `POST /api/mensajes` → `subirUno` por
   archivo → `despacharOla` (intake relanzado; el botón Relanzar del panel
   queda para reintentos).
3. **charla** → flujo actual de `submitMessage` (mensaje → wave charla por
   `setWave`), más subida de archivos si los hay.

**Files:**
- Modify: `src/components/control-center.tsx` (estado en ~247-248, `submitMessage` en 643-707, `ConversationColumn` en 1022-1173, selector en 732-755, columnas en 842-860)

**Interfaces:**
- Consumes: `tituloProvisional`, `textoConAdjuntos`, `momentoDelExpediente` (Task 1); `subirUno`, `despacharOla` (Task 2).
- Produces (para Tasks 4-5): estado `entrada: boolean` (reemplaza `intakeMode`), `momento: MomentoExpediente` calculado; `ConversationColumn` acepta `momento`, `archivos: File[]`, `onArchivos(files: FileList | File[])`, `onQuitarArchivo(index: number)`, `panel?: ReactNode`.

- [ ] **Step 1: Renombrar `intakeMode` → `entrada`** (líneas 247-248, 613, 734,
  737-742, 842) y calcular
  `const momento = momentoDelExpediente({ entrada, legacyState: snapshot.quote.legacyState, preview });`
  después de `const snapshot = data.snapshot;` (línea 253). `boardLive` pasa a
  ser `momento === "charla" && !preview ? true : preview` — mantené la
  semántica actual: el tablero (y su banda de olas) solo vive en charla.

- [ ] **Step 2: Estado de adjuntos del composer** junto a `draft` (línea 241):

```tsx
const [archivos, setArchivos] = useState<File[]>([]);
const agregarArchivos = (nuevos: FileList | File[]) => {
  const lista = Array.from(nuevos).filter((f) => f.size > 0);
  if (lista.length > 0) setArchivos((current) => [...current, ...lista]);
};
const quitarArchivo = (index: number) =>
  setArchivos((current) => current.filter((_, i) => i !== index));
```

Y en el reset por cambio de cotización (useEffect de línea 594-598) sumar
`setArchivos([]);`.

- [ ] **Step 3: Reescribir `submitMessage`** (líneas 643-707) como despachador
  por momento. El caso preview queda idéntico al actual. Estructura:

```tsx
const submitMessage = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  const text = draft.trim();
  if ((!text && archivos.length === 0) || sending) return;

  if (preview) { /* …bloque actual sin cambios (líneas 648-658)… */ return; }

  void (async () => {
    setSending(true);
    try {
      if (momento === "entrada") {
        await enviarDesdeLaEntrada(text);
        return;
      }
      await enviarAlExpediente(text);
    } finally {
      setSending(false);
    }
  })();
};
```

`enviarDesdeLaEntrada` (función interna del componente, puede vivir al lado de
`submitMessage`):

```tsx
const enviarDesdeLaEntrada = async (text: string) => {
  setComposerNotice("Creando el expediente…");
  try {
    const nombres = archivos.map((f) => f.name);
    const res = await fetch(apiUrl("/api/intake"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ titulo: tituloProvisional(text, nombres), texto: text }),
    });
    const payload = (await res.json().catch(() => null)) as {
      cotizacionId?: string; advertencia?: string; error?: string;
    } | null;
    if (!res.ok || typeof payload?.cotizacionId !== "string") {
      throw new Error(payload?.error ?? "El expediente no se pudo crear.");
    }
    const id = payload.cotizacionId;

    let aviso = payload.advertencia ?? null;
    setComposerNotice("Expediente creado · subiendo archivos…");
    for (const file of archivos) {
      try {
        await subirUno(id, file);
      } catch (error) {
        const motivo = error instanceof Error ? error.message : "subida rechazada";
        aviso = `${aviso ? `${aviso} ` : ""}El archivo "${file.name}" no subió (${motivo}).`;
      }
    }

    // El primer mensaje del hilo: el expediente arranca con su historia.
    const mensaje = textoConAdjuntos(text, nombres);
    if (mensaje.trim().length > 0) {
      await fetch(apiUrl(`/api/mensajes?quote=${encodeURIComponent(id)}`), {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ texto: mensaje }),
      }).catch(() => {
        aviso = `${aviso ? `${aviso} ` : ""}El mensaje no quedó en el hilo (el intake sí).`;
      });
    }

    const ola = await despacharOla(id, bridge);
    setDraft("");
    setArchivos([]);
    setEntrada(false);
    setComposerNotice(aviso ? `${aviso} ${ola.mensaje}` : ola.mensaje);
    await loadQuote(id);
  } catch (error) {
    // Nada nació: el borrador no existe y lo escrito sigue en la caja.
    setComposerNotice(
      error instanceof Error ? error.message : "El expediente no se pudo crear."
    );
  }
};
```

`enviarAlExpediente` (momentos reconocimiento y charla — conserva el orden del
actual: mensaje primero, ola después; suma archivos):

```tsx
const enviarAlExpediente = async (text: string) => {
  const nombres = archivos.map((f) => f.name);
  setComposerNotice("Guardando el mensaje en el hilo…");
  try {
    let aviso: string | null = null;
    for (const file of archivos) {
      try {
        await subirUno(quoteId, file);
      } catch (error) {
        const motivo = error instanceof Error ? error.message : "subida rechazada";
        aviso = `${aviso ? `${aviso} ` : ""}El archivo "${file.name}" no subió (${motivo}).`;
      }
    }
    const mensaje = textoConAdjuntos(text, nombres);
    const response = await fetch(apiUrl(`/api/mensajes?quote=${encodeURIComponent(quoteId)}`), {
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ texto: mensaje }),
    });
    const payload = (await response.json().catch(() => null)) as {
      mensajeId?: string; error?: string;
    } | null;
    if (!response.ok || typeof payload?.mensajeId !== "string") {
      throw new Error(payload?.error ?? "El mensaje no se pudo guardar en el hilo.");
    }
    setDraft("");
    setArchivos([]);
    setLocalMessages((current) => [
      ...current,
      { id: `local:${payload.mensajeId}`, text: mensaje, occurredAt: new Date().toISOString() },
    ]);

    if (momento === "reconocimiento") {
      const ola = await despacharOla(quoteId, bridge);
      setComposerNotice(aviso ? `${aviso} ${ola.mensaje}` : ola.mensaje);
      return;
    }
    // charla: la ola sale por la banda del tablero, como hoy (líneas 686-698)
    waveSeq.current += 1;
    setWave({ prompt: mensaje, seq: waveSeq.current, charla: { cotizacionId: quoteId, mensajeId: payload.mensajeId } });
    setComposerNotice(
      aviso ? `${aviso} Mensaje guardado · despachando la ola…` : "Mensaje guardado en el hilo · despachando la ola…"
    );
  } catch (error) {
    setComposerNotice(
      error instanceof Error ? error.message : "El mensaje no se pudo guardar en el hilo."
    );
  }
};
```

Nota de diseño que NO cambia: si la subida de un archivo falla, el aviso lo
canta con el motivo real y el mensaje sale igual (anti-slop: se dice lo que
pasó, no se frena todo por un adjunto).

- [ ] **Step 4: Selector y arranque.** El `onChange` del picker (737-744) usa
  `setEntrada(true)` y además `setMobileTab("conversar")` (la puerta ES la
  conversación). El valor inicial del estado: `useState(initialEntrada)` con la
  prop nueva `initialEntrada: boolean` de `ControlCenter` (la pasa `page.tsx`
  en la Task 6). En entrada, el `value` del select sigue siendo `"__nueva__"`.

- [ ] **Step 5: Verificación de tipos y tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: limpio. (La UI se prueba en navegador en la Task 8.)

- [ ] **Step 6: Commit**

```bash
git add apps/cotizador-ravn/src/components/control-center.tsx
git commit -m "feat(cotizador): el composer adjunta y despacha la ola del momento"
```

---

### Task 4: La caja como pantalla (`ConversationColumn` + CSS)

La columna de conversación gana su variante de puerta (hilo vacío con la
bienvenida), los chips de adjuntos, el clip habilitado, drag & drop, y el slot
del panel de reconocimiento.

**Files:**
- Modify: `src/components/control-center.tsx` (`ConversationColumn`, líneas 1022-1173; render de columnas, 842-860)
- Modify: `src/app/globals.css` (estilos `qz-composer__chips`, `qz-entrada`, panel inline)

**Interfaces:**
- Consumes: props nuevas de Task 3 (`momento`, `archivos`, `onArchivos`, `onQuitarArchivo`, `panel`).

- [ ] **Step 1: Props nuevas de `ConversationColumn`:**

```tsx
function ConversationColumn({
  /* …props actuales… */
  momento,
  archivos,
  onArchivos,
  onQuitarArchivo,
  panel,
}: {
  /* …tipos actuales… */
  momento: MomentoExpediente;
  archivos: File[];
  onArchivos: (files: FileList | File[]) => void;
  onQuitarArchivo: (index: number) => void;
  panel?: ReactNode;
}) {
```

- [ ] **Step 2: Cabecera y estado vacío por momento.** En entrada, la cabecera
  (líneas 1082-1088) no muestra `snapshot.quote.title` (es el expediente
  anterior) sino la bienvenida, y el hilo no lista mensajes viejos:

```tsx
{momento === "entrada" ? (
  <header className="qz-chat__head">
    <h1 id="conversation-title">Nueva cotización</h1>
    <p>Tirá la OT: archivo, foto o contame el trabajo. Con el primer envío nace el expediente.</p>
  </header>
) : (
  /* cabecera actual */
)}
```

y en el cuerpo: `momento === "entrada"` → no renderizar `thread` ni
`localMessages` del expediente anterior; mostrar solo el estado vacío con la
misma frase. El placeholder del textarea en entrada:
`"Ej.: OT baño Pueyrredón — demoler revestimiento, impermeabilizar y…"`;
en los otros momentos queda el actual.

- [ ] **Step 3: El clip vive** (líneas 1145-1153): sacar `disabled` y el
  `title` de excusa; abre un `<input type="file" multiple hidden>` con
  `ref`; `onChange={(e) => e.target.files && onArchivos(e.target.files)}`
  (y resetear `e.target.value` para poder re-elegir el mismo archivo). Chips
  arriba del footer:

```tsx
{archivos.length > 0 ? (
  <ul className="qz-composer__chips">
    {archivos.map((file, i) => (
      <li key={`${file.name}:${i}`}>
        <span>{file.name}</span>
        <button type="button" aria-label={`Quitar ${file.name}`} onClick={() => onQuitarArchivo(i)}>×</button>
      </li>
    ))}
  </ul>
) : null}
```

Drag & drop sobre la sección entera de la columna (mismos handlers que tenía
el gate: `onDragOver` preventDefault + flag, `onDrop` → `onArchivos(e.dataTransfer.files)`).
El botón de enviar (1154-1162) se habilita si hay texto **o** archivos:
`disabled={sending || (draft.trim().length === 0 && archivos.length === 0)}`.

- [ ] **Step 4: El panel en el hilo.** Al final del `qz-thread`, antes de
  cerrar: `{panel ? <div className="qz-thread__panel">{panel}</div> : null}`.
  En el render de `ControlCenter` (842-860): la rama `entrada` deja de montar
  `IntakeGate` y la rama borrador deja de montar el panel a la derecha:

```tsx
<ConversationColumn
  /* …props actuales… */
  momento={momento}
  archivos={archivos}
  onArchivos={agregarArchivos}
  onQuitarArchivo={quitarArchivo}
  panel={
    momento === "reconocimiento" ? (
      <ReconocimientoPanel
        quoteId={snapshot.quote.id}
        bridge={bridge}
        health={health}
        active
        onConfirmada={() => void loadQuote(snapshot.quote.id)}
      />
    ) : undefined
  }
/>
```

La columna derecha: en `entrada` y `reconocimiento` monta una tarjeta quieta
`EstadoColumna` (componente chico nuevo en el mismo archivo — título, una
frase de estado y nada más: en entrada "El expediente nace en la conversación";
en reconocimiento "La propuesta se trabaja en la conversación · el tablero se
enciende al confirmar"); en `charla` sigue `BoardColumn` como hoy. En mobile,
la solapa activa por defecto en entrada/reconocimiento es `"conversar"`.

- [ ] **Step 5: CSS** en `globals.css`, siguiendo los tokens `qz-*` existentes:
  `.qz-composer__chips` (fila de chips con quitar), `.qz-thread__panel`
  (el panel a lo ancho de la columna, separado del hilo con el borde 1px de
  registro), y en `[data-momento="reconocimiento"]` el ancho por defecto de la
  columna de chat sube (`--qz-chat-w` arranca en `CHAT_MAX`) para que el panel
  respire — sigue siendo arrastrable con el splitter. Poner
  `data-momento={momento}` en el `<main className="qz-body">`.

- [ ] **Step 6: Verificación**

Run: `npx tsc --noEmit && npx vitest run && npm run lint`
Expected: limpio.

- [ ] **Step 7: Commit**

```bash
git add apps/cotizador-ravn/src/components/control-center.tsx apps/cotizador-ravn/src/app/globals.css
git commit -m "feat(cotizador): la conversación es la puerta — chips, clip, panel en el hilo"
```

---

### Task 5: La ola ve los archivos y Fable saluda en el hilo (bridge)

Dos cambios del lado de la Mac: (a) la ola de charla recibe los archivos del
expediente (hoy solo la de intake los ve), (b) al persistir la propuesta de
reconocimiento, el bridge deja en el hilo el mensaje resumen de `fable`.

**Files:**
- Modify: `src/app/api/mensajes/route.ts` (el wave de charla gana `archivos`)
- Modify: `bridge/server.mjs` (charla baja archivos; intake persiste resumen)
- Modify: `bridge/charla-prompt.mjs` (sección de archivos)

**Interfaces:**
- Consumes: `loadQuoteArchivos(quoteId)` del adapter de lectura (ya existe, lo usa `GET /api/intake` — devuelve `{ titulo, url }[]` con URL firmada).
- Produces: wave de charla `{ kind: "charla", cotizacionId, mensajeId, texto, archivos: Array<{ titulo: string; url: string }> }`.

- [ ] **Step 1: `POST /api/mensajes`** — importar `loadQuoteArchivos` desde
  `../../../adapters/app-ravn-read-adapter` y sumar los archivos al wave:

```ts
const archivos = await loadQuoteArchivos(quoteId).catch(() => []);
return tallerJson(
  {
    mensajeId: id,
    wave: { kind: "charla", cotizacionId: quoteId, mensajeId: id, texto, archivos },
  },
  201
);
```

El `.catch(() => [])` es deliberado: si la firma de URLs falla, el mensaje ya
persistió y la charla sale sin adjuntos — no se cae la conversación por eso.

- [ ] **Step 2: `bridge/server.mjs` — la charla baja los archivos.** Extraer la
  bajada de archivos que hoy vive dentro de `startIntakeWave` (líneas 291-306:
  el loop de `fetch(archivo.url)` → `archivo-N.ext` en el dir temporal) a una
  función `bajarArchivos(dir, archivos)` que devuelve
  `[{ titulo, pathLocal }]`, y usarla en las DOS olas. En la ola de charla,
  pasar la lista al prompt. La charla ya corre con `Read` permitido (si no,
  sumarlo igual que la de intake, línea 139).

- [ ] **Step 3: `bridge/charla-prompt.mjs`** — sección nueva, solo si hay
  archivos:

```
## Archivos del expediente
Los archivos adjuntos están bajados en disco; leelos con Read si el mensaje
los menciona o si aportan al pedido:
- <titulo> → <pathLocal>
```

- [ ] **Step 4: `bridge/server.mjs` — el resumen de Fable al hilo.** En
  `startIntakeWave`, después del `persistirIntake` exitoso con
  `estado: "propuesta_lista"` (línea ~329), persistir el mensaje con la función
  que ya existe (`persistirMensaje`, línea 239):

```js
const p = propuesta; // la ya validada por el contrato
const resumen =
  `Reconocí "${p.titulo}": ${p.rubros.length} rubro(s), ` +
  `${p.rubros.reduce((n, r) => n + r.items.length, 0)} ítem(s)` +
  (p.preguntas.length > 0
    ? ` y tengo ${p.preguntas.length} pregunta(s). Revisá la propuesta acá abajo.`
    : `. Revisá la propuesta acá abajo.`);
await persistirMensaje(cotizacionId, { autor: "fable", texto: resumen }).catch((e) =>
  pushEvent("wave", "raw", `✗ El resumen no entró al hilo: ${e.message}`)
);
```

**Antes de escribirlo, verificar los nombres reales de los campos de la
propuesta en `src/bridge/intake-contract.ts`** (`titulo` línea 42; confirmar
la forma de `rubros[].items` y `preguntas` en ese archivo) — el resumen se
arma con los campos del contrato, no de memoria. El `.catch` con `pushEvent`
es la regla de siempre: si el resumen no entra, se canta en la terminal y la
propuesta sigue viva.

- [ ] **Step 5: Verificación.** `npx tsc --noEmit && npx vitest run` (la ruta
  de mensajes tiene tipos; el bridge es JS plano — mirarlo con
  `node --check bridge/server.mjs bridge/charla-prompt.mjs`).

- [ ] **Step 6: Commit**

```bash
git add apps/cotizador-ravn/src/app/api/mensajes/route.ts apps/cotizador-ravn/bridge/server.mjs apps/cotizador-ravn/bridge/charla-prompt.mjs
git commit -m "feat(cotizador): la charla ve los archivos y Fable resume el reconocimiento en el hilo"
```

---

### Task 6: El visor abre en la caja (`page.tsx`)

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/control-center.tsx` (prop `initialEntrada`)

- [ ] **Step 1:** `ControlCenter` gana la prop `initialEntrada: boolean` y la
  usa como valor inicial del estado `entrada` (Task 3 Step 4 la dejó lista).

- [ ] **Step 2:** En `page.tsx`, decidir la entrada: se abre en la caja salvo
  que la URL pida una cotización puntual o sea el preview (la demo sigue
  abriendo el tablero sintético):

```tsx
const initialEntrada = !preview && !first(query.quote);
return <ControlCenter initialData={data} preview={preview} bridge={bridge} initialEntrada={initialEntrada} />;
```

- [ ] **Step 3:** Caso borde que hoy revienta: `loadQuoteWorkspace(undefined)`
  con CERO cotizaciones en la base. Mirar qué hace el adapter; si tira
  `QuoteReadError`, la página cae a "Sin estado operativo" y la puerta no
  existe — con la caja como home eso ya no va. Si ese es el comportamiento,
  atrapar ese caso puntual y renderizar `ControlCenter` con un
  `createPreviewData()`-shape vacío NO es aceptable (inventa datos): en
  cambio, dejar que `ControlCenter` acepte `initialData: ControlCenterData | null`
  cuando `initialEntrada` es true y no montar tablero/hilo hasta que nazca el
  primer expediente. Si el adapter ya devuelve algo usable con lista vacía,
  no tocar nada. **Decidirlo leyendo `src/adapters`, no suponiendo.**

- [ ] **Step 4: Verificación**

Run: `npx tsc --noEmit && npx vitest run && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add apps/cotizador-ravn/src/app/page.tsx apps/cotizador-ravn/src/components/control-center.tsx
git commit -m "feat(cotizador): el visor abre en la puerta conversacional"
```

---

### Task 7: Borrar el gate

**Files:**
- Delete: `src/components/intake-gate.tsx`
- Modify: `src/components/control-center.tsx:75` (import muerto)

- [ ] **Step 1:** Confirmar que nadie más lo importa:
  `grep -rn "intake-gate" src/` → solo el import de `control-center.tsx:75`
  (la Task 2 ya sacó el de `reconocimiento-panel`). Borrar archivo e import.

- [ ] **Step 2:** `npx tsc --noEmit && npx vitest run && npm run lint` limpios.

- [ ] **Step 3: Commit**

```bash
git add -u apps/cotizador-ravn/src/components/
git commit -m "chore(cotizador): se borra el formulario gate — la puerta es la conversación"
```

---

### Task 8: Verificación completa + navegador

- [ ] **Step 1: Suites y build, todo:**

```bash
cd apps/cotizador-ravn && npm test && npx tsc --noEmit && npm run lint && npm run build
cd /Users/ezeotero/Documents/ravn && npm test && npx tsc --noEmit
```

Expected: todo verde; First Load JS sin engorde injustificado (base: 176 kB).
(El typecheck raíz importa: el tsconfig de App RAVN incluye el cotizador.)

- [ ] **Step 2: Navegador, camino real** (App RAVN local en :3000 +
  `npm run dev` del cotizador en :3010 + `npm run bridge`), con `TZ=UTC` en el
  dev del cotizador para reproducir Vercel:
  - Abrir `/` → la caja vacía con la bienvenida y el clip vivo.
  - Tirar un archivo + texto → expediente nace, hilo muestra el primer
    mensaje, ola corre, propuesta llega, resumen de Fable en el hilo, panel
    inline debajo; responder una pregunta POR LA CAJA → la ola de
    reconocimiento se relanza; Confirmar → tablero normal con cola.
  - En un expediente en charla: adjuntar un archivo con mensaje → sube, queda
    en el hilo con el pie "Adjunté: …", la ola de charla lo ve.
  - Bridge apagado: enviar desde la entrada → borrador + archivos + mensaje
    persisten y el aviso dice la verdad; Relanzar del panel funciona.
  - Selector: "+ Nueva cotización" vuelve a la caja vacía; cambiar de
    expediente limpia draft, chips y avisos.
  - Capturas del flujo a `.impeccable/finish/puerta-conversacional-*.png`.
  - **Borrar las cotizaciones de prueba** por el camino habitual y verificar
    `select * from cotizador_huerfanos;` → 0 filas.

- [ ] **Step 3:** Actualizar `handoff-cotizador-visor.md` (sección nueva arriba:
  qué quedó construido, commits, qué se probó) y commitearlo.

```bash
git add apps/cotizador-ravn/.impeccable/finish/ handoff-cotizador-visor.md
git commit -m "docs(cotizador): puerta conversacional verificada punta a punta"
```

- [ ] **Step 4:** Avisarle a Eze: construido y verificado en local; **pedirle
  aprobación para el deploy** (los dos proyectos por API con
  `target: production` sobre `home-cards`, como siempre — el push solo NO
  deploya).

---

## Self-review del plan

- **Cobertura del spec:** §1 entrada → Tasks 4+6 · §2 primer envío → Task 3 ·
  §3 despacho → Tasks 1+3 · §4 vuelta al hilo + panel → Tasks 4+5 · §5
  adjuntar siempre → Tasks 3+4+5 · §6 borrar gate / no tocar circuitos →
  Tasks 7 y restricciones globales · Testing → Tasks 1 y 8.
- **Tipos consistentes:** `MomentoExpediente` se define en Task 1 y se consume
  en Tasks 3-4; `subirUno`/`despacharOla` conservan las firmas de hoy (Task 2);
  el wave de charla suma `archivos` con la misma forma `{titulo, url}` que ya
  entrega `loadQuoteArchivos` (Task 5).
- **Puntos que el implementador DEBE verificar en el código antes de escribir**
  (marcados en sus tasks): forma exacta de `rubros[].items`/`preguntas` en el
  contrato (Task 5), comportamiento del adapter con cero cotizaciones (Task 6).
