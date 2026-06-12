# Frente C — Bot 2.0 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el bot de WhatsApp (`ravn-bots`) en el Bot 2.0 del Centro de Mando: eventos-first (nada se pierde), clasificación con destinos nuevos (filosofía + referencia estética), preguntas con opciones numeradas + timeout 4h → Archivados, vault por GitHub Contents API (sin clone), historial persistido, errores nunca silenciosos, reintento con backoff ante fallos de IA (spec §9) y aprobación de cotizaciones por WhatsApp (`OK <id-corto>` / `CORREGIR <id-corto>: …`, spec §6.4).

**Architecture:** `src/index.js` sobrevive como entrypoint (es lo que corre `npm start` en Railway); el árbol duplicado muerto (`webhook.js` → `messageHandler.js` → 5 módulos) se borra. La lógica nueva va en módulos chicos con inyección de dependencias (factories) para que sean testeables con `node:test` sin mockear módulos: `portero.js` (ruteo del owner + aprobación de cotizaciones), `preguntasService.js` (dudas + barrido), `adnService.js` (fotos → moodboard/filosofía), `visionService.js` (Gemini visión), `githubVault.js` (vault por API), `reintento.js` (1 reintento con backoff 2s para Haiku/Gemini). `supabaseService.js` se extiende con `eventos`, `trabajos_cola`, `presupuestos_gastos`, `referencias` y `cotizaciones`/`cotizador_lecciones` (aprobación §6.4) según el contrato de datos canónico.

**Tech Stack:** Node.js (CommonJS, Node ≥20 — local hay v26), Express, axios, `@anthropic-ai/sdk` (Haiku 4.5), Gemini API (audio + visión, key existente), `@supabase/supabase-js` (usuario auth dedicado `BOT_EMAIL`, NO service_role), GitHub Contents API, `node:test` + `node:assert` (cero dependencias nuevas).

---

## Contexto obligatorio antes de arrancar

- **Repo de trabajo:** `/Users/ezeotero/Documents/ravn-bots` (rama `main` deployada en Railway).
- **⚠️ REGLA OPERATIVA: Railway redeploya `main` automáticamente en cada push.** Trabajá TODO este plan en una rama `frente-c-bot-2` (`git checkout -b frente-c-bot-2`) y NO pushees a `main` hasta completar la Tarea 14 y coordinar el deploy (ver "Dudas de frontera" al final).
- **Contrato de datos:** las tablas `eventos`, `trabajos_cola`, `referencias`, `cotizaciones`, `cotizador_lecciones` y el bucket Storage `referencias` las crea el **Frente A** con exactamente los nombres/columnas/estados del contrato (copiados en cada tarea donde se usan). Este plan ASUME que existen. Si al probar contra Supabase real una tabla no está, frenar y avisar — no inventar workarounds.
- **RLS de la aprobación (Tarea 14):** la enmienda acordada del plan A le da al usuario bot SELECT/UPDATE en `cotizaciones` e INSERT en `cotizador_lecciones`. Si esas policies no están aplicadas, la Tarea 14 compila y sus tests pasan (usan mocks), pero contra la base real los UPDATE devuelven 0 filas: frenar y avisar.
- **Decisión de consolidación (tomada acá, documentada en Tarea 1):** sobrevive `src/index.js`. El árbol `src/webhook.js` + `src/messageHandler.js` + `src/whatsappService.js` + `src/claudeService.js` + `src/contacts.js` + `src/inquiryStore.js` + `src/webhookInboundStats.js` está MUERTO: nada de lo que corre lo requiere (`package.json` → `start: node src/index.js`, e `index.js` no importa ninguno de esos archivos; definen un segundo webhook que jamás se monta).
- **Tests:** `npm test` = `node --test test/`. Sin Vitest acá (Vitest es del Frente A en la app Next; este repo es Node puro y `node:test` viene incluido — cero dependencias nuevas).
- Comandos: correrlos siempre desde `/Users/ezeotero/Documents/ravn-bots`.

### Variables de entorno (Railway) — estado final tras este plan

| Variable | Uso | Estado |
|---|---|---|
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WEBHOOK_VERIFY_TOKEN`, `OWNER_PHONE` | WhatsApp Cloud API | ya existen |
| `ANTHROPIC_API_KEY` | Haiku clasificador | ya existe |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | audio (ya) + **visión (nuevo uso, misma key)** | ya existe |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BOT_EMAIL`, `BOT_PASSWORD` | usuario auth dedicado del bot | ya existen |
| `GITHUB_TOKEN` | antes: clone del vault; ahora: **Contents API** (mismo token, scope `repo` / Contents RW sobre `boveda`) | ya existe |
| `VAULT_GITHUB_REPO` | `ravnconstrucciones/boveda` (default en código) | **nueva, opcional** |
| `PREGUNTA_TIMEOUT_HORAS` | timeout del flujo de duda (default `4`) | **nueva, opcional** |
| `QUOTE_TIMEOUT_MS`, `VAULT_REPO`, `VAULT_DIR` | del código muerto / del clone | **se eliminan de .env.example** |

---

### Tarea 1: Consolidación — muere el árbol duplicado

El spec (§5.3 "Código duplicado → consolidar en uno") pide elegir un sobreviviente. Decisión: **`src/index.js` sobrevive** (es el entrypoint real de `npm start`, tiene el flujo vivo de proveedores `/prov`, el dashboard `/health`/`/log`, el portero actual y el cron). Muere el árbol paralelo que nunca se monta.

**Files:**
- Delete: `src/webhook.js`, `src/messageHandler.js`, `src/whatsappService.js`, `src/claudeService.js`, `src/contacts.js`, `src/inquiryStore.js`, `src/webhookInboundStats.js`, `data/contacts.json`, `src/data/contacts.json`
- Modify: `src/index.js` (sacar import muerto), `.env.example`, `RAILWAY-SETUP.md`

- [ ] **Step 1: Crear la rama de trabajo**

```bash
cd /Users/ezeotero/Documents/ravn-bots
git checkout -b frente-c-bot-2
```

Expected: `Switched to a new branch 'frente-c-bot-2'`

- [ ] **Step 2: Verificar que el árbol está realmente muerto**

```bash
grep -rn "require('./webhook')\|require('./messageHandler')\|require('./whatsappService')\|require('./claudeService')\|require('./inquiryStore')\|require('./webhookInboundStats')\|require('./contacts')" src/index.js src/advisorService.js src/vaultService.js src/supabaseService.js src/transcribeService.js
```

Expected: **sin output** (los únicos requires de esos módulos están entre ellos mismos). Si aparece algo, FRENAR y revisar antes de borrar.

- [ ] **Step 3: Borrar los archivos muertos**

```bash
git rm src/webhook.js src/messageHandler.js src/whatsappService.js src/claudeService.js src/contacts.js src/inquiryStore.js src/webhookInboundStats.js data/contacts.json src/data/contacts.json
```

Expected: `rm 'src/webhook.js'` … (9 líneas).

- [ ] **Step 4: Sacar el import muerto de index.js**

En `src/index.js`, reemplazar:

```js
const express = require('express');
const axios   = require('axios');
const { exec } = require('child_process');
```

por:

```js
const express = require('express');
const axios   = require('axios');
```

(`exec` no se usa en ningún lado del archivo.)

- [ ] **Step 5: Limpiar .env.example**

En `.env.example`, eliminar estas líneas (pertenecen al árbol muerto y al clone que se reemplaza en Tarea 6):

```
# Tiempo máximo de espera para cotizaciones (ms). Default: 24hs
QUOTE_TIMEOUT_MS=86400000
```

y reemplazar el bloque del vault:

```
# Acceso al vault (repo boveda) — el asesor lee y escribe acá
GITHUB_TOKEN=
VAULT_REPO=github.com/ravnconstrucciones/boveda.git
```

por:

```
# Acceso al vault (repo boveda) vía GitHub Contents API — sin clone
GITHUB_TOKEN=
VAULT_GITHUB_REPO=ravnconstrucciones/boveda

# Supabase (usuario auth dedicado del bot — NO service_role)
SUPABASE_URL=
SUPABASE_ANON_KEY=
BOT_EMAIL=
BOT_PASSWORD=

# Flujo de duda: horas antes de archivar una pregunta sin respuesta
PREGUNTA_TIMEOUT_HORAS=4
```

- [ ] **Step 6: Documentar la migración en RAILWAY-SETUP.md**

Agregar al final de `RAILWAY-SETUP.md`:

```markdown
## Migración Bot 2.0 (2026-06)

**Consolidación:** sobrevivió `src/index.js` (entrypoint real de `npm start`). Se borró el árbol
duplicado que nunca se montaba: `webhook.js`, `messageHandler.js`, `whatsappService.js`,
`claudeService.js`, `contacts.js`, `inquiryStore.js`, `webhookInboundStats.js` y los
`contacts.json`. El flujo viejo de proveedores sigue vivo en `index.js` detrás de `/prov`
(usa `src/providers.json` vía GitHub, no los contacts borrados).

**Cambios grandes:**
- Eventos-first: todo mensaje entrante crea una fila en `eventos` ANTES de clasificarse
  (dedup por `wa_message_id` — reemplaza el dedup en memoria que se perdía en cada reboot).
- Dudas: opciones numeradas + timeout (`PREGUNTA_TIMEOUT_HORAS`, default 4h) → estado
  `archivado` + aviso. Nada se pierde.
- Vault: GitHub Contents API directa (PUT). Murió el clone en /tmp (`vaultService.js`).
- Cola: el bot escribe en `trabajos_cola` (tipos cotizar/redactar/consulta/orden) en vez de
  `cotizaciones_cola`. El latido de la Mac sigue leyéndose de `cotizaciones_cola` hasta que
  el daemon migre.
- ADN: fotos → Gemini visión → Storage bucket `referencias` + tabla `referencias`
  (estética y filosofía).
```

- [ ] **Step 7: Verificar que el bot sigue parseando**

```bash
node --check src/index.js && node --check src/advisorService.js && node --check src/supabaseService.js && echo OK
```

Expected: `OK`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: consolidación bot — muere el árbol duplicado (webhook/messageHandler), sobrevive index.js

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 2: Harness de tests (node:test) + fakes

**Files:**
- Modify: `package.json`
- Create: `test/helpers/fakes.js`, `test/harness.test.js`
- Modify: `src/supabaseService.js` (hook `__setTestClient`)

- [ ] **Step 1: Agregar el script de test**

En `package.json`, reemplazar:

```json
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
```

por:

```json
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "node --test test/"
  },
```

- [ ] **Step 2: Crear los fakes compartidos**

Crear `test/helpers/fakes.js`:

```js
// fakes.js — stubs mínimos para los tests (sin dependencias externas).

// Cliente Supabase fake: registra la cadena de llamadas y resuelve con lo
// que devuelva `handler(ctx)`, donde ctx = { tabla, pasos: [{m, args}] }.
function crearFakeSupabaseClient(handler) {
  const llamadas = [];
  function from(tabla) {
    const ctx = { tabla, pasos: [] };
    llamadas.push(ctx);
    const chain = {};
    const metodos = ['insert', 'update', 'delete', 'select', 'eq', 'neq', 'in',
      'gte', 'lte', 'lt', 'not', 'or', 'order', 'limit'];
    for (const m of metodos) {
      chain[m] = (...args) => { ctx.pasos.push({ m, args }); return chain; };
    }
    chain.single = (...args) => {
      ctx.pasos.push({ m: 'single', args });
      return Promise.resolve(handler(ctx));
    };
    // Los builders de supabase-js son thenables: `await client().from()...eq()...`
    chain.then = (resolve, reject) =>
      Promise.resolve().then(() => handler(ctx)).then(resolve, reject);
    return chain;
  }
  const storage = {
    from(bucket) {
      return {
        upload(path, buffer, opts) {
          const ctx = { tabla: `storage:${bucket}`, pasos: [{ m: 'upload', args: [path, buffer, opts] }] };
          llamadas.push(ctx);
          return Promise.resolve(handler(ctx));
        },
      };
    },
  };
  return { client: { from, storage }, llamadas };
}

// Devuelve el primer paso de la cadena con ese método (p.ej. el insert con su payload).
function paso(ctx, metodo) {
  return ctx.pasos.find((p) => p.m === metodo);
}

// Captura de mensajes salientes de WhatsApp.
function crearFakeEnviar() {
  const enviados = [];
  const enviar = async (to, texto) => { enviados.push({ to, texto }); return 'wamid.fake'; };
  return { enviar, enviados };
}

module.exports = { crearFakeSupabaseClient, paso, crearFakeEnviar };
```

- [ ] **Step 3: Agregar el hook de test en supabaseService**

En `src/supabaseService.js`, agregar inmediatamente DESPUÉS de la función `ensureAuth()`:

```js
// SOLO PARA TESTS: inyecta un cliente fake y saltea el login.
function __setTestClient(fake) {
  _client = fake;
  _authed = !!fake;
}
```

y agregar `__setTestClient,` al final del `module.exports` existente:

```js
module.exports = {
  insertTarea,
  insertGastoPersonal,
  getTareasVencidas,
  marcarAvisada,
  insertCotizacion,
  borrarUltimo,
  getCotizacionEsperando,
  getCotizacionCancelable,
  responderCotizacion,
  cancelarCotizacion,
  macViva,
  __setTestClient,
};
```

- [ ] **Step 4: Test de humo del harness**

Crear `test/harness.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const sb = require('../src/supabaseService');
const { crearFakeSupabaseClient, paso } = require('./helpers/fakes');

test('el fake de supabase registra la cadena y resuelve', async () => {
  const { client, llamadas } = crearFakeSupabaseClient(() => ({ data: [{ id: 1 }], error: null }));
  sb.__setTestClient(client);
  const { data } = await client.from('tareas').select('*').eq('estado', 'pendiente').limit(1);
  assert.equal(data[0].id, 1);
  assert.equal(llamadas[0].tabla, 'tareas');
  assert.deepEqual(paso(llamadas[0], 'eq').args, ['estado', 'pendiente']);
});
```

- [ ] **Step 5: Correr y verificar que pasa**

```bash
npm test
```

Expected: `# pass 1` … `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add package.json test/ src/supabaseService.js
git commit -m "test: harness node:test + fakes de Supabase/WhatsApp + hook __setTestClient

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 3: supabaseService — tabla `eventos` (eventos-first, dedup, historial)

Contrato (tabla la crea Frente A — referencia):

```sql
create table eventos (
  id uuid primary key default gen_random_uuid(),
  creado_at timestamptz not null default now(),
  origen text not null check (origen in ('whatsapp','tablero','daemon','bot','sistema')),
  tipo text not null,
  estado text not null default 'procesado' check (estado in ('procesado','pendiente_pregunta','archivado','resuelto')),
  titulo text not null,
  contenido jsonb not null default '{}'::jsonb,
  destino_tabla text,
  destino_id uuid,
  wa_message_id text unique
);
```

Tipos de evento que usa el bot: `mensaje_eze` (entrante del owner), `mensaje_entrante` (entrante de terceros/proveedores), `respuesta_asesor` (turno del asesor, para el historial), `no_soportado` (sticker/video/location/reaction/contacts — se registran igual, Tarea 12), `cotizacion_aprobada` y `cotizacion_rechazada` (aprobación por WhatsApp, origen='bot', Tarea 14).

**Files:**
- Test: `test/supabase-eventos.test.js`
- Modify: `src/supabaseService.js`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `test/supabase-eventos.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const sb = require('../src/supabaseService');
const { crearFakeSupabaseClient, paso } = require('./helpers/fakes');

test('insertEvento inserta en eventos con wa_message_id y devuelve id', async () => {
  const { client, llamadas } = crearFakeSupabaseClient(() => ({ data: { id: 'ev-1' }, error: null }));
  sb.__setTestClient(client);
  const r = await sb.insertEvento({
    origen: 'whatsapp', tipo: 'mensaje_eze', titulo: 'hola',
    contenido: { texto: 'hola' }, waMessageId: 'wamid.1',
  });
  assert.deepEqual(r, { ok: true, id: 'ev-1' });
  assert.equal(llamadas[0].tabla, 'eventos');
  const row = paso(llamadas[0], 'insert').args[0];
  assert.equal(row.wa_message_id, 'wamid.1');
  assert.equal(row.estado, 'procesado');
  assert.equal(row.origen, 'whatsapp');
  assert.equal(row.tipo, 'mensaje_eze');
});

test('insertEvento devuelve duplicado=true si choca el unique de wa_message_id', async () => {
  const { client } = crearFakeSupabaseClient(() => ({ data: null, error: { code: '23505', message: 'duplicate key' } }));
  sb.__setTestClient(client);
  const r = await sb.insertEvento({ tipo: 'mensaje_eze', titulo: 'hola', waMessageId: 'wamid.1' });
  assert.equal(r.ok, false);
  assert.equal(r.duplicado, true);
});

test('archivarEvento pone estado=archivado y guarda el motivo en contenido', async () => {
  const { client, llamadas } = crearFakeSupabaseClient((ctx) => {
    if (paso(ctx, 'single')) return { data: { id: 'ev-1', contenido: { texto: 'hola' } }, error: null };
    return { data: null, error: null };
  });
  sb.__setTestClient(client);
  const ok = await sb.archivarEvento('ev-1', 'insert falló');
  assert.equal(ok, true);
  const upd = llamadas.find((c) => paso(c, 'update'));
  const campos = paso(upd, 'update').args[0];
  assert.equal(campos.estado, 'archivado');
  assert.equal(campos.contenido.archivado_motivo, 'insert falló');
  assert.equal(campos.contenido.texto, 'hola'); // no pisa el contenido previo
});

test('getPreguntaPendiente: solo preguntas NO vencidas, contando desde el ENVÍO de la pregunta', async () => {
  const hace2h = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const hace6h = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { client, llamadas } = crearFakeSupabaseClient(() => ({
    data: [
      // evento viejo pero pregunta enviada hace 2h → vigente
      { id: 'ev-9', creado_at: hace6h, contenido: { pregunta: { enviada_at: hace2h, opciones: [] } } },
      // pregunta enviada hace 6h → vencida
      { id: 'ev-8', creado_at: hace6h, contenido: { pregunta: { enviada_at: hace6h, opciones: [] } } },
    ],
    error: null,
  }));
  sb.__setTestClient(client);
  const ev = await sb.getPreguntaPendiente(4);
  assert.equal(ev.id, 'ev-9');
  assert.deepEqual(paso(llamadas[0], 'eq').args, ['estado', 'pendiente_pregunta']);
});

test('getPreguntasVencidas: solo las vencidas, desde enviada_at con fallback a creado_at', async () => {
  const hace2h = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const hace6h = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { client } = crearFakeSupabaseClient(() => ({
    data: [
      { id: 'ev-1', creado_at: hace6h, contenido: { pregunta: { enviada_at: hace6h } } }, // vencida
      { id: 'ev-2', creado_at: hace6h, contenido: { pregunta: { enviada_at: hace2h } } }, // vigente
      { id: 'ev-3', creado_at: hace6h, contenido: {} },                                   // sin enviada_at → creado_at → vencida
    ],
    error: null,
  }));
  sb.__setTestClient(client);
  const vencidas = await sb.getPreguntasVencidas(4);
  assert.deepEqual(vencidas.map((e) => e.id), ['ev-1', 'ev-3']);
});

test('getHistorialEventos mapea a turnos user/assistant, FILTRA eventos sin texto útil y ordena cronológico', async () => {
  const { client } = crearFakeSupabaseClient(() => ({
    data: [
      { tipo: 'respuesta_asesor', contenido: { raw: '{"tipo":"consulta"}' }, creado_at: '3' },
      { tipo: 'mensaje_eze', contenido: { texto: null, media: { id: 'm-1' } }, creado_at: '2' }, // foto sin caption → afuera
      { tipo: 'mensaje_eze', contenido: { texto: 'hola' }, creado_at: '1' },
    ],
    error: null,
  }));
  sb.__setTestClient(client);
  const h = await sb.getHistorialEventos(10);
  assert.deepEqual(h, [
    { role: 'user', content: 'hola' },
    { role: 'assistant', content: '{"tipo":"consulta"}' },
  ]);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
npm test
```

Expected: FAIL — `sb.insertEvento is not a function` (y similares).

- [ ] **Step 3: Implementar las funciones de eventos**

En `src/supabaseService.js`, agregar antes del `module.exports` (después de `cancelarCotizacion`):

```js
// ── Eventos: registro permanente de TODO lo que entra (eventos-first) ────────
// Contrato Centro de Mando: tabla `eventos` (la crea el Frente A).

async function insertEvento({ origen, tipo, titulo, contenido, waMessageId, estado }) {
  try {
    const ok = await ensureAuth();
    if (!ok) return { ok: false, error: 'sin auth' };
    const { data, error } = await client()
      .from('eventos')
      .insert({
        origen: origen || 'whatsapp',
        tipo,
        estado: estado || 'procesado',
        titulo: String(titulo || '').slice(0, 200) || '(sin título)',
        contenido: contenido || {},
        wa_message_id: waMessageId || null,
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') return { ok: false, duplicado: true };
      console.error('[Supabase] insertEvento err:', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data.id };
  } catch (e) {
    console.error('[Supabase] insertEvento err:', e.message);
    return { ok: false, error: e.message };
  }
}

async function getEvento(id) {
  try {
    const ok = await ensureAuth();
    if (!ok || !id) return null;
    const { data, error } = await client().from('eventos').select('*').eq('id', id).limit(1).single();
    if (error) { console.error('[Supabase] getEvento err:', error.message); return null; }
    return data || null;
  } catch (e) {
    console.error('[Supabase] getEvento err:', e.message);
    return null;
  }
}

async function updateEvento(id, campos) {
  try {
    const ok = await ensureAuth();
    if (!ok || !id) return false;
    const { error } = await client().from('eventos').update(campos).eq('id', id);
    if (error) { console.error('[Supabase] updateEvento err:', error.message); return false; }
    return true;
  } catch (e) {
    console.error('[Supabase] updateEvento err:', e.message);
    return false;
  }
}

// Mezcla claves nuevas dentro del jsonb `contenido` sin pisar lo que había.
async function mergeContenidoEvento(id, extra) {
  const ev = await getEvento(id);
  if (!ev) return false;
  return updateEvento(id, { contenido: { ...(ev.contenido || {}), ...extra } });
}

// REGLA DE ORO: nada se pierde. Lo que falla queda archivado con su motivo.
async function archivarEvento(id, motivo) {
  if (!id) return false;
  const ev = await getEvento(id);
  const contenido = { ...((ev && ev.contenido) || {}), archivado_motivo: motivo || null };
  return updateEvento(id, { estado: 'archivado', contenido });
}

async function marcarDestino(id, tabla, destinoId) {
  if (!id) return false;
  return updateEvento(id, { estado: 'procesado', destino_tabla: tabla, destino_id: destinoId || null });
}

// El timeout de una pregunta corre desde que se ENVIÓ la pregunta
// (contenido.pregunta.enviada_at — lo setea preguntasService al preguntar),
// NO desde la llegada del mensaje. Fallback: creado_at del evento.
function inicioPregunta(ev) {
  return new Date(ev.contenido?.pregunta?.enviada_at || ev.creado_at).getTime();
}

// Última pregunta pendiente NO vencida. El filtro por ventana se hace en JS
// (enviada_at vive dentro del jsonb); las pendientes son siempre poquitas.
async function getPreguntaPendiente(timeoutHoras = 4) {
  try {
    const ok = await ensureAuth();
    if (!ok) return null;
    const corte = Date.now() - timeoutHoras * 3600 * 1000;
    const { data, error } = await client()
      .from('eventos')
      .select('*')
      .eq('estado', 'pendiente_pregunta')
      .order('creado_at', { ascending: false })
      .limit(5);
    if (error) { console.error('[Supabase] getPreguntaPendiente err:', error.message); return null; }
    return (data || []).find((ev) => inicioPregunta(ev) >= corte) || null;
  } catch (e) {
    console.error('[Supabase] getPreguntaPendiente err:', e.message);
    return null;
  }
}

// Preguntas vencidas (para el barrido del cron → Archivados).
async function getPreguntasVencidas(timeoutHoras = 4) {
  try {
    const ok = await ensureAuth();
    if (!ok) return [];
    const corte = Date.now() - timeoutHoras * 3600 * 1000;
    const { data, error } = await client()
      .from('eventos')
      .select('*')
      .eq('estado', 'pendiente_pregunta');
    if (error) { console.error('[Supabase] getPreguntasVencidas err:', error.message); return []; }
    return (data || []).filter((ev) => inicioPregunta(ev) < corte);
  } catch (e) {
    console.error('[Supabase] getPreguntasVencidas err:', e.message);
    return [];
  }
}

// Historial de conversación PERSISTIDO (reemplaza el Map en memoria que moría
// en cada reboot de Railway). Lee los últimos turnos de eventos y FILTRA los
// que no aportan texto (foto sin caption, comandos sin respuesta_asesor):
// meten ruido en el contexto del clasificador.
async function getHistorialEventos(n = 10, excluirId = null) {
  try {
    const ok = await ensureAuth();
    if (!ok) return [];
    let q = client()
      .from('eventos')
      .select('tipo, contenido, creado_at')
      .in('tipo', ['mensaje_eze', 'respuesta_asesor'])
      .order('creado_at', { ascending: false })
      .limit(n * 2); // margen: algunos se filtran por no tener texto útil
    if (excluirId) q = q.neq('id', excluirId);
    const { data, error } = await q;
    if (error) { console.error('[Supabase] getHistorialEventos err:', error.message); return []; }
    return (data || [])
      .map((e) => ({
        role: e.tipo === 'mensaje_eze' ? 'user' : 'assistant',
        content: String(e.contenido?.texto || e.contenido?.raw || '').slice(0, 1000),
      }))
      .filter((t) => t.content.trim())
      .slice(0, n)
      .reverse();
  } catch (e) {
    console.error('[Supabase] getHistorialEventos err:', e.message);
    return [];
  }
}
```

y sumar al `module.exports`:

```js
  insertEvento,
  getEvento,
  updateEvento,
  mergeContenidoEvento,
  archivarEvento,
  marcarDestino,
  getPreguntaPendiente,
  getPreguntasVencidas,
  getHistorialEventos,
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
npm test
```

Expected: `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/supabaseService.js test/supabase-eventos.test.js
git commit -m "feat: eventos-first en supabaseService — insert con dedup wa_message_id, archivado con motivo, historial persistido

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 4: supabaseService — `trabajos_cola` (reemplaza `cotizaciones_cola`)

Contrato (la crea Frente A — referencia):

```sql
create table trabajos_cola (
  id uuid primary key default gen_random_uuid(),
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  tipo text not null check (tipo in ('cotizar','redactar','consulta','orden')),
  origen text not null check (origen in ('whatsapp','tablero')),
  estado text not null default 'pendiente' check (estado in ('pendiente','esperando_datos','procesando','en_revision','completado','error','cancelado')),
  prompt text not null,
  contexto jsonb not null default '{}'::jsonb,
  resultado jsonb,
  error text
);
```

**Nota:** `macViva()` NO se toca: el latido de la Mac sigue siendo una fila `estado='latido'` en `cotizaciones_cola` (el contrato de `trabajos_cola` no contempla ese estado). El dueño acordado de la migración del latido (a `sistema_estado`) es el **Frente E**: cuando la haga, actualiza `macViva()` en su propia rama. Anotado en "Dudas de frontera" (al final del plan).

**Files:**
- Test: `test/supabase-trabajos.test.js`
- Modify: `src/supabaseService.js`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `test/supabase-trabajos.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const sb = require('../src/supabaseService');
const { crearFakeSupabaseClient, paso } = require('./helpers/fakes');

test('insertTrabajo inserta tipo/origen/estado/prompt/contexto y devuelve id', async () => {
  const { client, llamadas } = crearFakeSupabaseClient(() => ({ data: { id: 'tr-1' }, error: null }));
  sb.__setTestClient(client);
  const id = await sb.insertTrabajo({ tipo: 'cotizar', prompt: 'cotizame baño en Pilar', contexto: { evento_id: 'ev-1' } });
  assert.equal(id, 'tr-1');
  assert.equal(llamadas[0].tabla, 'trabajos_cola');
  const row = paso(llamadas[0], 'insert').args[0];
  assert.equal(row.tipo, 'cotizar');
  assert.equal(row.origen, 'whatsapp');
  assert.equal(row.estado, 'pendiente');
  assert.equal(row.prompt, 'cotizame baño en Pilar');
  assert.deepEqual(row.contexto, { evento_id: 'ev-1' });
});

test('insertTrabajo devuelve null si el insert falla', async () => {
  const { client } = crearFakeSupabaseClient(() => ({ data: null, error: { message: 'RLS' } }));
  sb.__setTestClient(client);
  assert.equal(await sb.insertTrabajo({ tipo: 'orden', prompt: 'x' }), null);
});

test('responderTrabajo apila la respuesta en contexto.respuestas y vuelve a pendiente', async () => {
  const { client, llamadas } = crearFakeSupabaseClient((ctx) => {
    if (paso(ctx, 'single')) return { data: { contexto: { respuestas: [{ texto: 'antes' }] } }, error: null };
    return { data: null, error: null };
  });
  sb.__setTestClient(client);
  const ok = await sb.responderTrabajo('tr-1', '12 m2');
  assert.equal(ok, true);
  const upd = llamadas.find((c) => paso(c, 'update'));
  const campos = paso(upd, 'update').args[0];
  assert.equal(campos.estado, 'pendiente');
  assert.equal(campos.contexto.respuestas.length, 2);
  assert.equal(campos.contexto.respuestas[1].texto, '12 m2');
  assert.deepEqual(paso(upd, 'eq').args, ['id', 'tr-1']);
});

test('getTrabajoEsperandoDatos filtra estado y ventana de 30 min', async () => {
  const { client, llamadas } = crearFakeSupabaseClient(() => ({ data: [{ id: 'tr-2' }], error: null }));
  sb.__setTestClient(client);
  const tr = await sb.getTrabajoEsperandoDatos();
  assert.equal(tr.id, 'tr-2');
  assert.deepEqual(paso(llamadas[0], 'eq').args, ['estado', 'esperando_datos']);
  assert.equal(paso(llamadas[0], 'gte').args[0], 'actualizado_at');
});
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
npm test
```

Expected: FAIL — `sb.insertTrabajo is not a function`.

- [ ] **Step 3: Implementar las funciones de trabajos_cola**

En `src/supabaseService.js`, agregar después del bloque de eventos:

```js
// ── trabajos_cola: la cola general de trabajo pesado (Centro de Mando) ───────
// Generaliza cotizaciones_cola: cotizar / redactar / consulta / orden.
// El daemon de la Mac la levanta y corre Claude Code headless.

async function insertTrabajo({ tipo, prompt, contexto }) {
  try {
    const ok = await ensureAuth();
    if (!ok) return null;
    const { data, error } = await client()
      .from('trabajos_cola')
      .insert({
        tipo,
        origen: 'whatsapp',
        estado: 'pendiente',
        prompt,
        contexto: contexto || {},
      })
      .select('id')
      .single();
    if (error) { console.error('[Supabase] insertTrabajo err:', error.message); return null; }
    return data.id;
  } catch (e) {
    console.error('[Supabase] insertTrabajo err:', e.message);
    return null;
  }
}

// Fila esperando_datos reciente (≤30 min): el cotizador preguntó algo y el
// próximo mensaje de Eze es la respuesta. Más viejo, vuelve el asesor normal.
async function getTrabajoEsperandoDatos() {
  try {
    const ok = await ensureAuth();
    if (!ok) return null;
    const hace30 = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data, error } = await client()
      .from('trabajos_cola')
      .select('id, contexto')
      .eq('estado', 'esperando_datos')
      .gte('actualizado_at', hace30)
      .order('actualizado_at', { ascending: false })
      .limit(1);
    if (error) { console.error('[Supabase] getTrabajoEsperandoDatos err:', error.message); return null; }
    return data?.[0] || null;
  } catch (e) {
    console.error('[Supabase] getTrabajoEsperandoDatos err:', e.message);
    return null;
  }
}

// Apila la respuesta de Eze en contexto.respuestas y re-encola el trabajo.
async function responderTrabajo(id, respuesta) {
  try {
    const ok = await ensureAuth();
    if (!ok) return false;
    const { data } = await client().from('trabajos_cola').select('contexto').eq('id', id).limit(1).single();
    const contexto = { ...((data && data.contexto) || {}) };
    contexto.respuestas = [...(contexto.respuestas || []), { texto: respuesta, ts: new Date().toISOString() }];
    const { error } = await client()
      .from('trabajos_cola')
      .update({ contexto, estado: 'pendiente', actualizado_at: new Date().toISOString() })
      .eq('id', id)
      .eq('estado', 'esperando_datos');
    if (error) { console.error('[Supabase] responderTrabajo err:', error.message); return false; }
    return true;
  } catch (e) {
    console.error('[Supabase] responderTrabajo err:', e.message);
    return false;
  }
}

// Último trabajo frenable con "cancelar" (pendiente o esperando un dato).
async function getTrabajoCancelable() {
  try {
    const ok = await ensureAuth();
    if (!ok) return null;
    const { data, error } = await client()
      .from('trabajos_cola')
      .select('id, estado')
      .in('estado', ['pendiente', 'esperando_datos'])
      .order('actualizado_at', { ascending: false })
      .limit(1);
    if (error) { console.error('[Supabase] getTrabajoCancelable err:', error.message); return null; }
    return data?.[0] || null;
  } catch (e) {
    console.error('[Supabase] getTrabajoCancelable err:', e.message);
    return null;
  }
}

async function cancelarTrabajo(id) {
  try {
    const ok = await ensureAuth();
    if (!ok) return false;
    const { error } = await client()
      .from('trabajos_cola')
      .update({ estado: 'cancelado', actualizado_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { console.error('[Supabase] cancelarTrabajo err:', error.message); return false; }
    return true;
  } catch (e) {
    console.error('[Supabase] cancelarTrabajo err:', e.message);
    return false;
  }
}
```

y sumar al `module.exports`:

```js
  insertTrabajo,
  getTrabajoEsperandoDatos,
  responderTrabajo,
  getTrabajoCancelable,
  cancelarTrabajo,
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
npm test
```

Expected: `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/supabaseService.js test/supabase-trabajos.test.js
git commit -m "feat: trabajos_cola en supabaseService — insert/esperando_datos/responder/cancelar segun contrato

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 5: supabaseService — obras, gastos de obra, referencias y Storage

Esquemas reales en producción (verificados en la app):
- `presupuestos`: `id, nombre_obra (nullable), nombre_cliente, presupuesto_aprobado (bool), created_at, …`
- `presupuestos_gastos`: `id, presupuesto_id (not null FK), fecha (date, default current_date), rubro_id (text null), descripcion (text, default ''), importe (numeric >= 0), created_at`
- `gastos_personales`: `concepto, monto, categoria, fecha, origen, created_at` (ya lo usa el bot)
- `referencias` + bucket `referencias`: contrato del Centro de Mando (los crea Frente A).

**Files:**
- Test: `test/supabase-gastos-referencias.test.js`
- Modify: `src/supabaseService.js` (funciones nuevas + `insertTarea`/`insertGastoPersonal` ahora devuelven el id)

- [ ] **Step 1: Escribir los tests que fallan**

Crear `test/supabase-gastos-referencias.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const sb = require('../src/supabaseService');
const { crearFakeSupabaseClient, paso } = require('./helpers/fakes');

test('buscarPresupuestosPorNombre busca aprobadas por nombre_obra o nombre_cliente', async () => {
  const { client, llamadas } = crearFakeSupabaseClient(() => ({ data: [{ id: 'p-1', nombre_obra: 'Saavedra' }], error: null }));
  sb.__setTestClient(client);
  const r = await sb.buscarPresupuestosPorNombre('saavedra');
  assert.equal(r.length, 1);
  assert.equal(llamadas[0].tabla, 'presupuestos');
  assert.deepEqual(paso(llamadas[0], 'eq').args, ['presupuesto_aprobado', true]);
  assert.match(paso(llamadas[0], 'or').args[0], /nombre_obra\.ilike\.%saavedra%/);
});

test('insertGastoObra inserta en presupuestos_gastos y devuelve id', async () => {
  const { client, llamadas } = crearFakeSupabaseClient(() => ({ data: { id: 'g-1' }, error: null }));
  sb.__setTestClient(client);
  const id = await sb.insertGastoObra({ presupuesto_id: 'p-1', descripcion: 'cemento (Easy)', importe: 50000, fecha: '2026-06-11' });
  assert.equal(id, 'g-1');
  assert.equal(llamadas[0].tabla, 'presupuestos_gastos');
  const row = paso(llamadas[0], 'insert').args[0];
  assert.equal(row.presupuesto_id, 'p-1');
  assert.equal(row.importe, 50000);
  assert.equal(row.descripcion, 'cemento (Easy)');
});

test('insertReferencia inserta tipo/texto/etiquetas/imagen_path/evento_id', async () => {
  const { client, llamadas } = crearFakeSupabaseClient(() => ({ data: { id: 'r-1' }, error: null }));
  sb.__setTestClient(client);
  const id = await sb.insertReferencia({
    tipo: 'estetica', texto: 'fachada hormigón visto', etiquetas: ['material', 'terminacion'],
    imagen_path: 'whatsapp/123.jpg', evento_id: 'ev-1',
  });
  assert.equal(id, 'r-1');
  assert.equal(llamadas[0].tabla, 'referencias');
  const row = paso(llamadas[0], 'insert').args[0];
  assert.equal(row.tipo, 'estetica');
  assert.deepEqual(row.etiquetas, ['material', 'terminacion']);
  assert.equal(row.evento_id, 'ev-1');
});

test('subirImagenReferencia sube al bucket referencias y devuelve el path', async () => {
  const { client, llamadas } = crearFakeSupabaseClient(() => ({ data: { path: 'x' }, error: null }));
  sb.__setTestClient(client);
  const path = await sb.subirImagenReferencia(Buffer.from('img'), 'image/jpeg');
  assert.match(path, /^whatsapp\/\d+-\d+\.jpg$/);
  assert.equal(llamadas[0].tabla, 'storage:referencias');
});

test('insertGastoPersonal devuelve el id insertado', async () => {
  const { client } = crearFakeSupabaseClient(() => ({ data: { id: 'gp-1' }, error: null }));
  sb.__setTestClient(client);
  const id = await sb.insertGastoPersonal({ concepto: 'nafta', monto: 30000, categoria: 'Combustible', fecha: '2026-06-11' });
  assert.equal(id, 'gp-1');
});
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
npm test
```

Expected: FAIL — `sb.buscarPresupuestosPorNombre is not a function` (y el de `insertGastoPersonal` falla porque hoy devuelve `true`, no el id).

- [ ] **Step 3: Implementar**

En `src/supabaseService.js`:

**(a)** Reemplazar el cuerpo de `insertTarea` para que devuelva el id (los consumidores actuales solo chequean truthiness, así que es retrocompatible):

```js
async function insertTarea({ texto, categoria, fecha, hora }) {
  try {
    const ok = await ensureAuth();
    if (!ok) return null;
    const { data, error } = await client().from('tareas').insert({
      texto,
      categoria: categoria || 'Personal',
      fecha: fecha || null,
      hora: hora || null,
      estado: 'pendiente',
      origen: 'whatsapp',
    }).select('id').single();
    if (error) { console.error('[Supabase] insert err:', error.message); return null; }
    return data.id;
  } catch (e) {
    console.error('[Supabase] insertTarea err:', e.message);
    return null;
  }
}
```

**(b)** Reemplazar el cuerpo de `insertGastoPersonal` igual:

```js
async function insertGastoPersonal({ concepto, monto, categoria, fecha }) {
  try {
    const ok = await ensureAuth();
    if (!ok) return null;
    const { data, error } = await client().from('gastos_personales').insert({
      concepto,
      monto: monto || null,
      categoria: categoria || 'Varios',
      fecha: fecha || null,
      origen: 'whatsapp',
    }).select('id').single();
    if (error) { console.error('[Supabase] insertGastoPersonal err:', error.message); return null; }
    return data.id;
  } catch (e) {
    console.error('[Supabase] insertGastoPersonal err:', e.message);
    return null;
  }
}
```

**(c)** Agregar después del bloque de trabajos_cola:

```js
// ── Obras y gastos de obra (presupuestos / presupuestos_gastos) ──────────────

// Obras candidatas por nombre ("Saavedra", "Bralar"…): matchea nombre_obra o
// nombre_cliente en presupuestos APROBADOS (la noción de "obra activa" del bot).
async function buscarPresupuestosPorNombre(nombre) {
  try {
    const ok = await ensureAuth();
    if (!ok) return [];
    const limpio = String(nombre || '').trim().replace(/[,()]/g, ' ');
    if (!limpio) return [];
    const patron = `%${limpio}%`;
    const { data, error } = await client()
      .from('presupuestos')
      .select('id, nombre_obra, nombre_cliente')
      .eq('presupuesto_aprobado', true)
      .or(`nombre_obra.ilike.${patron},nombre_cliente.ilike.${patron}`)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) { console.error('[Supabase] buscarPresupuestos err:', error.message); return []; }
    return data || [];
  } catch (e) {
    console.error('[Supabase] buscarPresupuestos err:', e.message);
    return [];
  }
}

async function listarObrasActivas(n = 6) {
  try {
    const ok = await ensureAuth();
    if (!ok) return [];
    const { data, error } = await client()
      .from('presupuestos')
      .select('id, nombre_obra, nombre_cliente')
      .eq('presupuesto_aprobado', true)
      .order('created_at', { ascending: false })
      .limit(n);
    if (error) { console.error('[Supabase] listarObrasActivas err:', error.message); return []; }
    return data || [];
  } catch (e) {
    console.error('[Supabase] listarObrasActivas err:', e.message);
    return [];
  }
}

// Gasto real de obra → presupuestos_gastos (alimenta el loop de calibración
// del cotizador). Esquema real: presupuesto_id, fecha, descripcion, importe.
async function insertGastoObra({ presupuesto_id, descripcion, importe, fecha }) {
  try {
    const ok = await ensureAuth();
    if (!ok) return null;
    const { data, error } = await client().from('presupuestos_gastos').insert({
      presupuesto_id,
      fecha: fecha || new Date().toISOString().slice(0, 10),
      descripcion: descripcion || '',
      importe: importe || 0,
    }).select('id').single();
    if (error) { console.error('[Supabase] insertGastoObra err:', error.message); return null; }
    return data.id;
  } catch (e) {
    console.error('[Supabase] insertGastoObra err:', e.message);
    return null;
  }
}

// ── ADN: referencias (filosofía + estética) + Storage ───────────────────────

async function insertReferencia({ tipo, texto, etiquetas, fuente, imagen_path, evento_id }) {
  try {
    const ok = await ensureAuth();
    if (!ok) return null;
    const { data, error } = await client().from('referencias').insert({
      tipo, // 'filosofia' | 'estetica'
      texto: texto || null,
      etiquetas: etiquetas || [],
      fuente: fuente || null,
      imagen_path: imagen_path || null,
      evento_id: evento_id || null,
    }).select('id').single();
    if (error) { console.error('[Supabase] insertReferencia err:', error.message); return null; }
    return data.id;
  } catch (e) {
    console.error('[Supabase] insertReferencia err:', e.message);
    return null;
  }
}

const EXTENSIONES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

// Sube el binario al bucket PRIVADO `referencias` (acceso por signed URLs
// desde la app). Devuelve el path o null.
async function subirImagenReferencia(buffer, mime) {
  try {
    const ok = await ensureAuth();
    if (!ok) return null;
    const ext = EXTENSIONES[mime] || 'jpg';
    const path = `whatsapp/${Date.now()}-${Math.floor(Math.random() * 100000)}.${ext}`;
    const { error } = await client().storage.from('referencias').upload(path, buffer, {
      contentType: mime || 'image/jpeg',
    });
    if (error) { console.error('[Supabase] subirImagenReferencia err:', error.message); return null; }
    return path;
  } catch (e) {
    console.error('[Supabase] subirImagenReferencia err:', e.message);
    return null;
  }
}
```

y sumar al `module.exports`:

```js
  buscarPresupuestosPorNombre,
  listarObrasActivas,
  insertGastoObra,
  insertReferencia,
  subirImagenReferencia,
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
npm test
```

Expected: `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/supabaseService.js test/supabase-gastos-referencias.test.js
git commit -m "feat: gastos de obra a presupuestos_gastos + referencias ADN + upload a Storage

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 6: `githubVault.js` — vault por GitHub Contents API (muere el clone en /tmp)

Reemplaza `vaultService.js` (clone + commit + push en `/tmp` de Railway, frágil y lento) por PUT directo a la Contents API. Lecturas cacheadas 5 min para el contexto del asesor.

**Files:**
- Create: `src/githubVault.js`
- Test: `test/github-vault.test.js`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `test/github-vault.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearGithubVault, mergeInboxSection } = require('../src/githubVault');

test('mergeInboxSection crea el archivo con encabezado si el body está vacío', () => {
  const r = mergeInboxSection('', 'Obra', '- [ ] 10:30 — llamar a Oribe', '2026-06-11');
  assert.match(r, /^# Inbox 2026-06-11/);
  assert.match(r, /## Obra\n- \[ \] 10:30 — llamar a Oribe/);
});

test('mergeInboxSection inserta el bullet bajo la sección existente', () => {
  const body = '# Inbox 2026-06-11\n\n## Obra\n- [ ] 09:00 — medir baño\n';
  const r = mergeInboxSection(body, 'Obra', '- [ ] 10:30 — llamar a Oribe', '2026-06-11');
  const lineas = r.split('\n');
  const idx = lineas.findIndex((l) => l.trim() === '## Obra');
  assert.equal(lineas[idx + 1], '- [ ] 10:30 — llamar a Oribe');
  assert.equal(lineas[idx + 2], '- [ ] 09:00 — medir baño');
});

test('mergeInboxSection agrega una sección nueva al final si no existe', () => {
  const body = '# Inbox 2026-06-11\n\n## Obra\n- [ ] 09:00 — medir baño\n';
  const r = mergeInboxSection(body, 'Salud', '- [ ] 10:30 — turno médico', '2026-06-11');
  assert.match(r, /## Salud\n- \[ \] 10:30 — turno médico\n$/);
});

test('appendTexto hace GET + PUT con sha, y reintenta UNA vez ante 409', async () => {
  let puts = 0;
  const http = {
    get: async () => ({ data: { content: Buffer.from('hola\n').toString('base64'), sha: 'sha-1' } }),
    put: async (url, body) => {
      puts++;
      if (puts === 1) { const e = new Error('conflict'); e.response = { status: 409 }; throw e; }
      assert.equal(body.sha, 'sha-1');
      assert.equal(Buffer.from(body.content, 'base64').toString('utf8'), 'hola\nlinea\n');
      return {};
    },
  };
  const v = crearGithubVault({ http });
  const ok = await v.appendTexto('Inbox/x.md', (b) => b + 'linea\n', 'test');
  assert.equal(ok, true);
  assert.equal(puts, 2);
});

test('appendTexto crea el archivo (PUT sin sha) si el GET da 404', async () => {
  const e404 = new Error('not found'); e404.response = { status: 404 };
  let putBody = null;
  const http = {
    get: async () => { throw e404; },
    put: async (url, body) => { putBody = body; return {}; },
  };
  const v = crearGithubVault({ http });
  await v.appendTexto('Inbox/nuevo.md', (b) => (b || '') + 'primera\n', 'test');
  assert.equal(putBody.sha, undefined);
  assert.equal(Buffer.from(putBody.content, 'base64').toString('utf8'), 'primera\n');
});

test('listRecent ordena por nombre descendente y filtra .md', async () => {
  const http = {
    get: async () => ({ data: [
      { type: 'file', name: '2026-06-01.md' },
      { type: 'file', name: '2026-06-10.md' },
      { type: 'file', name: 'imagen.png' },
      { type: 'dir', name: 'sub' },
    ] }),
  };
  const v = crearGithubVault({ http });
  assert.deepEqual(await v.listRecent('Orientación', 1), ['2026-06-10.md']);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../src/githubVault'`.

- [ ] **Step 3: Implementar githubVault.js**

Crear `src/githubVault.js`:

```js
// githubVault.js — lectura/escritura del vault (repo boveda) vía GitHub
// Contents API. Reemplaza al viejo vaultService.js: NADA de git clone en /tmp,
// PUT directo (cada PUT es un commit).
const axiosLib = require('axios');

const API = 'https://api.github.com';
const REPO = () => process.env.VAULT_GITHUB_REPO || 'ravnconstrucciones/boveda';
const TOKEN = () => process.env.GITHUB_TOKEN || '';
const CACHE_MS = 5 * 60 * 1000;

function ahoraAR() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
  const pad = (n) => String(n).padStart(2, '0');
  return {
    fecha: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hora: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

// PURA (testeable): inserta un bullet bajo "## <categoria>"; crea encabezado
// y/o sección si no existen. Misma semántica que el viejo appendInboxSection.
function mergeInboxSection(body, categoria, bullet, fecha) {
  const heading = `## ${categoria}`;
  const base = body && body.trim() ? body : `# Inbox ${fecha}\n`;
  if (base.includes(heading)) {
    const lines = base.split('\n');
    const idx = lines.findIndex((l) => l.trim() === heading);
    lines.splice(idx + 1, 0, bullet);
    return lines.join('\n');
  }
  return base.replace(/\s*$/, '') + `\n\n${heading}\n${bullet}\n`;
}

function crearGithubVault({ http } = {}) {
  const axios = http || axiosLib;
  const cache = new Map(); // rel -> { texto, ts }

  function headers() {
    const h = { Accept: 'application/vnd.github+json' };
    if (TOKEN()) h.Authorization = `Bearer ${TOKEN()}`;
    return h;
  }

  function urlDe(rel) {
    const partes = rel.split('/').map(encodeURIComponent).join('/');
    return `${API}/repos/${REPO()}/contents/${partes}`;
  }

  // GET contents → { texto, sha } | null si no existe (404).
  async function getFile(rel) {
    try {
      const res = await axios.get(urlDe(rel), { headers: headers(), timeout: 15000 });
      const texto = Buffer.from(res.data.content || '', 'base64').toString('utf8');
      return { texto, sha: res.data.sha };
    } catch (e) {
      if (e.response?.status === 404) return null;
      throw e;
    }
  }

  async function putFile(rel, texto, sha, mensaje) {
    const body = {
      message: mensaje,
      content: Buffer.from(texto, 'utf8').toString('base64'),
      committer: { name: 'Ravn Bot', email: 'bot@ravnconstrucciones.com' },
    };
    if (sha) body.sha = sha;
    await axios.put(urlDe(rel), body, { headers: headers(), timeout: 15000 });
  }

  // Read-modify-write con UN reintento si otro commit pisó el sha (HTTP 409).
  async function appendTexto(rel, transformar, mensaje) {
    for (let intento = 1; intento <= 2; intento++) {
      const f = await getFile(rel);
      const nuevo = transformar(f ? f.texto : '');
      try {
        await putFile(rel, nuevo, f ? f.sha : null, mensaje);
        cache.delete(rel);
        return true;
      } catch (e) {
        if (e.response?.status === 409 && intento === 1) continue;
        throw e;
      }
    }
    return false;
  }

  async function appendInbox(texto) {
    const { fecha, hora } = ahoraAR();
    const rel = `Inbox/${fecha}.md`;
    const linea = `- ${hora} — ${texto}\n`;
    return appendTexto(
      rel,
      (body) => (body && body.trim() ? body.replace(/\s*$/, '\n') + linea : `# Inbox ${fecha}\n\n${linea}`),
      'bot: nota desde WhatsApp'
    );
  }

  async function appendInboxSection(categoria, texto) {
    const { fecha, hora } = ahoraAR();
    const rel = `Inbox/${fecha}.md`;
    const bullet = `- [ ] ${hora} — ${texto}`;
    return appendTexto(
      rel,
      (body) => mergeInboxSection(body, categoria, bullet, fecha),
      `bot: tarea (${categoria}) desde WhatsApp`
    );
  }

  // Lectura cacheada 5 min (contexto del asesor: 3 archivos por mensaje sin
  // pegarle a la API cada vez). Si la API falla, devuelve lo último cacheado.
  async function readFileSafe(rel) {
    const hit = cache.get(rel);
    if (hit && Date.now() - hit.ts < CACHE_MS) return hit.texto;
    try {
      const f = await getFile(rel);
      const texto = f ? f.texto : '';
      cache.set(rel, { texto, ts: Date.now() });
      return texto;
    } catch (e) {
      console.error('[Vault] read err:', rel, e.message);
      return hit ? hit.texto : '';
    }
  }

  // Lista los .md de un directorio por nombre DESC (Inbox/ y Orientación/
  // llevan la fecha en el nombre, así que nombre desc = más reciente primero).
  async function listRecent(dir, n = 5) {
    try {
      const res = await axios.get(urlDe(dir), { headers: headers(), timeout: 15000 });
      return (res.data || [])
        .filter((f) => f.type === 'file' && f.name.endsWith('.md'))
        .map((f) => f.name)
        .sort()
        .reverse()
        .slice(0, n);
    } catch (e) {
      console.error('[Vault] list err:', dir, e.message);
      return [];
    }
  }

  return { getFile, putFile, appendTexto, appendInbox, appendInboxSection, readFileSafe, listRecent };
}

module.exports = { crearGithubVault, mergeInboxSection, ahoraAR };
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
npm test
```

Expected: `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/githubVault.js test/github-vault.test.js
git commit -m "feat: vault por GitHub Contents API — PUT directo con retry 409, cache de lectura 5 min

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 7: `reintento.js` + `visionService.js` — resiliencia §9 y Gemini visión

Dos piezas: (1) **`reintento.js`** — spec §9 ("Claude falla → reintento con backoff y el evento queda archivado"): UN reintento con backoff de 2 s para las llamadas a Haiku y Gemini, ANTES de que el portero archive el evento. Los 4xx (salvo 408/429) no se reintentan: la request está mal, no la red. (2) **`visionService.js`** — Gemini ya transcribe audios con `GEMINI_API_KEY`; acá se usa el mismo endpoint para imágenes (spec §7.2): clasifica la foto (estética / página de libro / factura / obra / otra), la describe, etiqueta y extrae texto si es filosofía.

**Files:**
- Create: `src/reintento.js`, `src/visionService.js`
- Modify: `src/transcribeService.js` (exportar `downloadWhatsappMedia`)
- Test: `test/reintento.test.js`, `test/vision.test.js`

- [ ] **Step 1: Escribir los tests del reintento (fallan)**

Crear `test/reintento.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { conReintento } = require('../src/reintento');

test('si la llamada falla una vez, reintenta y devuelve el resultado', async () => {
  let intentos = 0;
  const r = await conReintento(async () => {
    intentos++;
    if (intentos === 1) { const e = new Error('socket hang up'); throw e; }
    return 'ok';
  }, { esperaMs: 1 });
  assert.equal(r, 'ok');
  assert.equal(intentos, 2);
});

test('si falla siempre, lanza el último error tras 2 intentos', async () => {
  let intentos = 0;
  await assert.rejects(
    () => conReintento(async () => { intentos++; throw new Error('overloaded'); }, { esperaMs: 1 }),
    /overloaded/
  );
  assert.equal(intentos, 2);
});

test('un 4xx (request mal armada / sin permisos) NO se reintenta', async () => {
  let intentos = 0;
  await assert.rejects(
    () => conReintento(async () => {
      intentos++;
      const e = new Error('unauthorized'); e.response = { status: 401 }; throw e;
    }, { esperaMs: 1 }),
    /unauthorized/
  );
  assert.equal(intentos, 1);
});

test('429 (rate limit) SÍ se reintenta', async () => {
  let intentos = 0;
  const r = await conReintento(async () => {
    intentos++;
    if (intentos === 1) { const e = new Error('rate limited'); e.status = 429; throw e; }
    return 'ok';
  }, { esperaMs: 1 });
  assert.equal(r, 'ok');
  assert.equal(intentos, 2);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../src/reintento'`.

- [ ] **Step 3: Implementar reintento.js**

Crear `src/reintento.js`:

```js
// reintento.js — resiliencia (spec §9): ante un fallo de IA (Haiku/Gemini),
// UN reintento con backoff de 2 s antes de rendirse. Si el reintento también
// falla, el error sube y el portero archiva el evento (nada se pierde).
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function conReintento(fn, { intentos = 2, esperaMs = 2000, etiqueta = 'llamada' } = {}) {
  let ultimoError;
  for (let i = 1; i <= intentos; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimoError = e;
      // 4xx = la request está mal (auth, payload), no la red: no reintentar.
      // Excepciones: 408 (timeout) y 429 (rate limit), que sí son transitorios.
      const status = e.status || e.response?.status;
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) throw e;
      if (i < intentos) {
        console.error(`[Reintento] ${etiqueta} falló (${e.message}) — reintento en ${esperaMs}ms`);
        await dormir(esperaMs);
      }
    }
  }
  throw ultimoError;
}

module.exports = { conReintento };
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
npm test
```

Expected: `# fail 0`

- [ ] **Step 5: Escribir los tests de visión (fallan)**

Crear `test/vision.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRespuestaVision, crearVision } = require('../src/visionService');

test('parseRespuestaVision parsea un JSON válido', () => {
  const r = parseRespuestaVision('{"clase":"estetica","descripcion":"fachada de hormigón visto","etiquetas":["material","terminacion"],"texto_extraido":null}');
  assert.equal(r.clase, 'estetica');
  assert.deepEqual(r.etiquetas, ['material', 'terminacion']);
  assert.equal(r.texto_extraido, null);
});

test('parseRespuestaVision tolera texto alrededor del JSON (fences de markdown)', () => {
  const r = parseRespuestaVision('```json\n{"clase":"filosofia","descripcion":"página de libro","etiquetas":[],"texto_extraido":"El obstáculo es el camino."}\n```');
  assert.equal(r.clase, 'filosofia');
  assert.equal(r.texto_extraido, 'El obstáculo es el camino.');
});

test('parseRespuestaVision cae a clase=otra ante basura o clase inválida', () => {
  assert.equal(parseRespuestaVision('no soy json').clase, 'otra');
  assert.equal(parseRespuestaVision('{"clase":"marciano"}').clase, 'otra');
  assert.equal(parseRespuestaVision('').clase, 'otra');
});

test('analizarImagen manda la imagen inline a Gemini y parsea la respuesta', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  let urlLlamada = null;
  let bodyLlamado = null;
  const http = {
    post: async (url, body) => {
      urlLlamada = url; bodyLlamado = body;
      return { data: { candidates: [{ content: { parts: [{ text: '{"clase":"factura","descripcion":"ticket de Easy","etiquetas":[],"texto_extraido":null}' }] } }] } };
    },
  };
  const vision = crearVision({ http });
  const r = await vision.analizarImagen(Buffer.from('img'), 'image/jpeg', 'factura de hoy');
  assert.equal(r.clase, 'factura');
  assert.match(urlLlamada, /generativelanguage\.googleapis\.com/);
  const parts = bodyLlamado.contents[0].parts;
  assert.equal(parts[parts.length - 1].inline_data.mime_type, 'image/jpeg');
  assert.match(parts[1].text, /factura de hoy/);
});

test('analizarImagen reintenta UNA vez si Gemini falla con 5xx (spec §9)', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  let posts = 0;
  const http = {
    post: async () => {
      posts++;
      if (posts === 1) { const e = new Error('server error'); e.response = { status: 500 }; throw e; }
      return { data: { candidates: [{ content: { parts: [{ text: '{"clase":"obra","descripcion":"avance","etiquetas":[],"texto_extraido":null}' }] } }] } };
    },
  };
  const vision = crearVision({ http, esperaMs: 1 });
  const r = await vision.analizarImagen(Buffer.from('img'), 'image/jpeg', null);
  assert.equal(r.clase, 'obra');
  assert.equal(posts, 2);
});
```

- [ ] **Step 6: Correr y verificar que fallan**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../src/visionService'`.

- [ ] **Step 7: Implementar visionService.js**

Crear `src/visionService.js`:

```js
// visionService.js — el ojo del bot: clasifica y describe las fotos que manda
// Eze, con Gemini (misma API y key que la transcripción de audios).
// Resiliencia §9: la llamada a Gemini lleva UN reintento con backoff (2s).
const axiosLib = require('axios');
const { conReintento } = require('./reintento');

const CLASES = ['estetica', 'filosofia', 'factura', 'obra', 'otra'];

const PROMPT_VISION = `Sos el ojo del asistente de Ezequiel Otero (RAVN Construcciones, constructora premium, estética minimalista/arquitectónica).
Mirá la imagen y clasificala en UNA de estas clases:

- "estetica": referencia estética — un edificio, fachada, terminación, material, cartel, tipografía, mueble, espacio o gráfica que a Eze le gustó y quiere guardar como inspiración de marca.
- "filosofia": página o fragmento de un LIBRO o texto — una frase/reflexión para guardar. Extraé el texto COMPLETO legible en texto_extraido.
- "factura": ticket, factura, comprobante de pago o presupuesto de un proveedor.
- "obra": foto de avance/estado de una obra en construcción (sin valor estético de referencia).
- "otra": cualquier otra cosa, o si no estás razonablemente seguro.

Si hay un caption del usuario, pesalo fuerte: "mirá esta tipografía" → estetica; "factura de Easy" → factura; "del libro que estoy leyendo" → filosofia.

Devolvé SOLO un JSON válido, sin texto antes ni después:
{
  "clase": "estetica" | "filosofia" | "factura" | "obra" | "otra",
  "descripcion": "<1-2 frases: qué se ve y qué transmite>",
  "etiquetas": ["<algunas de: tipografia, material, terminacion, espacio, grafica, color, mobiliario>"],
  "texto_extraido": "<solo si clase=filosofia: el texto completo de la página/fragmento; sino null>"
}`;

// PURA (testeable): normaliza la respuesta cruda del modelo.
function parseRespuestaVision(raw) {
  const m = (raw || '').match(/\{[\s\S]*\}/);
  let data = null;
  if (m) { try { data = JSON.parse(m[0]); } catch { data = null; } }
  if (!data || !CLASES.includes(data.clase)) {
    return { clase: 'otra', descripcion: '', etiquetas: [], texto_extraido: null };
  }
  return {
    clase: data.clase,
    descripcion: typeof data.descripcion === 'string' ? data.descripcion : '',
    etiquetas: Array.isArray(data.etiquetas) ? data.etiquetas.filter((e) => typeof e === 'string') : [],
    texto_extraido: typeof data.texto_extraido === 'string' && data.texto_extraido.trim()
      ? data.texto_extraido.trim()
      : null,
  };
}

function crearVision({ http, esperaMs } = {}) {
  const axios = http || axiosLib;
  const KEY = () => process.env.GEMINI_API_KEY || '';
  const MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  async function analizarImagen(buffer, mime, caption) {
    if (!KEY()) throw new Error('Falta GEMINI_API_KEY');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent?key=${KEY()}`;
    const parts = [{ text: PROMPT_VISION }];
    if (caption) parts.push({ text: `Caption del usuario: "${caption}"` });
    parts.push({ inline_data: { mime_type: mime || 'image/jpeg', data: buffer.toString('base64') } });
    const resp = await conReintento(
      () => axios.post(
        url,
        { contents: [{ parts }], generationConfig: { temperature: 0 } },
        { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
      ),
      { etiqueta: 'Gemini visión', esperaMs: esperaMs || 2000 }
    );
    const raw = resp.data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
    return parseRespuestaVision(raw);
  }

  return { analizarImagen };
}

module.exports = { crearVision, parseRespuestaVision, CLASES };
```

- [ ] **Step 8: Exportar downloadWhatsappMedia**

En `src/transcribeService.js`, reemplazar la última línea:

```js
module.exports = { transcribeAudio };
```

por:

```js
module.exports = { transcribeAudio, downloadWhatsappMedia };
```

- [ ] **Step 9: Correr y verificar que pasan**

```bash
npm test
```

Expected: `# fail 0`

- [ ] **Step 10: Commit**

```bash
git add src/reintento.js test/reintento.test.js src/visionService.js src/transcribeService.js test/vision.test.js
git commit -m "feat: reintento con backoff (spec §9) + visión con Gemini — clasifica fotos y extrae texto de páginas

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 8: `advisorService.js` 2.0 — destinos nuevos, dudas, historial en eventos, vault por API

Reescritura del asesor: (1) tipos nuevos `filosofia`, `referencia_estetica`, `redactar` y `duda` (spec §5 y §7.2); (2) historial leído de `eventos` (muere el `Map` en memoria); (3) vault vía `githubVault`; (4) gasto de obra → `presupuestos_gastos` (antes era un hack: tarea + nota en vault); (5) separación `clasificar()` (LLM) / `ejecutar()` (efectos, testeable con stubs); (6) los inserts fallidos LANZAN error (el portero archiva y avisa — regla "nunca silencioso"); (7) la llamada a Haiku va envuelta en `conReintento` (spec §9: reintento con backoff ANTES de archivar).

**Files:**
- Modify: `src/advisorService.js` (reescritura completa)
- Delete: `src/vaultService.js` (su único consumidor era el advisor)
- Test: `test/advisor-ejecutar.test.js`

- [ ] **Step 1: Verificar que vaultService solo lo usa el advisor**

```bash
grep -rn "vaultService" src/*.js
```

Expected: una sola línea — `src/advisorService.js:3:const vault = require('./vaultService');`

- [ ] **Step 2: Escribir los tests que fallan**

Crear `test/advisor-ejecutar.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { ejecutar, DESTINOS_DUDA } = require('../src/advisorService');

function stubSb(overrides = {}) {
  const llamadas = { insertGastoPersonal: [], insertGastoObra: [], insertReferencia: [], insertTarea: [], marcarDestino: [] };
  return {
    llamadas,
    insertTarea: async (t) => { llamadas.insertTarea.push(t); return 't-1'; },
    insertGastoPersonal: async (g) => { llamadas.insertGastoPersonal.push(g); return 'gp-1'; },
    insertGastoObra: async (g) => { llamadas.insertGastoObra.push(g); return 'go-1'; },
    insertReferencia: async (r) => { llamadas.insertReferencia.push(r); return 'r-1'; },
    buscarPresupuestosPorNombre: async () => [],
    listarObrasActivas: async () => [{ id: 'p-1', nombre_obra: 'Saavedra' }, { id: 'p-2', nombre_obra: 'Bralar' }],
    marcarDestino: async (...a) => { llamadas.marcarDestino.push(a); return true; },
    borrarUltimo: async () => 'nafta — $30.000 (Combustible)',
    ...overrides,
  };
}
const stubVault = { appendInbox: async () => true, appendInboxSection: async () => true };
const ctxBase = (sb) => ({ texto: 'mensaje original', eventoId: 'ev-1', sb, vault: stubVault, hoyIso: '2026-06-11' });

test('cotizacion/redactar/pesado devuelven encolar con el tipo del contrato', async () => {
  const sb = stubSb();
  assert.deepEqual((await ejecutar({ tipo: 'cotizacion' }, ctxBase(sb))).encolar, { tipo: 'cotizar', prompt: 'mensaje original' });
  assert.deepEqual((await ejecutar({ tipo: 'redactar' }, ctxBase(sb))).encolar, { tipo: 'redactar', prompt: 'mensaje original' });
  assert.deepEqual((await ejecutar({ tipo: 'pesado' }, ctxBase(sb))).encolar, { tipo: 'orden', prompt: 'mensaje original' });
});

test('gasto personal: inserta y marca destino', async () => {
  const sb = stubSb();
  const r = await ejecutar({ tipo: 'gasto', gasto: { concepto: 'nafta', monto: 30000, es_personal: true, categoria_personal: 'Combustible' } }, ctxBase(sb));
  assert.equal(sb.llamadas.insertGastoPersonal[0].concepto, 'nafta');
  assert.deepEqual(sb.llamadas.marcarDestino[0], ['ev-1', 'gastos_personales', 'gp-1']);
  assert.match(r.reply, /nafta/);
});

test('gasto personal: si el insert falla, LANZA (regla: nunca silencioso)', async () => {
  const sb = stubSb({ insertGastoPersonal: async () => null });
  await assert.rejects(
    () => ejecutar({ tipo: 'gasto', gasto: { concepto: 'nafta', monto: 1, es_personal: true } }, ctxBase(sb)),
    /gastos_personales/
  );
});

test('gasto de obra con única candidata: inserta en presupuestos_gastos', async () => {
  const sb = stubSb({ buscarPresupuestosPorNombre: async () => [{ id: 'p-9', nombre_obra: 'Saavedra' }] });
  const r = await ejecutar({ tipo: 'gasto', gasto: { concepto: 'cemento', monto: 50000, es_personal: false, obra: 'Saavedra' } }, ctxBase(sb));
  assert.equal(sb.llamadas.insertGastoObra[0].presupuesto_id, 'p-9');
  assert.equal(sb.llamadas.insertGastoObra[0].importe, 50000);
  assert.match(r.reply, /Saavedra/);
});

test('gasto de obra sin obra clara: devuelve pregunta con obras numeradas + opción archivar', async () => {
  const sb = stubSb();
  const r = await ejecutar({ tipo: 'gasto', gasto: { concepto: 'cemento', monto: 50000, es_personal: false, obra: null } }, ctxBase(sb));
  assert.ok(r.pregunta);
  assert.equal(r.pregunta.opciones.length, 3); // 2 obras + archivar
  assert.equal(r.pregunta.opciones[0].accion.clase, 'gasto_obra');
  assert.equal(r.pregunta.opciones[0].accion.presupuesto_id, 'p-1');
  assert.equal(r.pregunta.opciones[2].accion.clase, 'archivar');
});

test('filosofia: inserta referencia tipo filosofia y espeja al vault', async () => {
  const sb = stubSb();
  const r = await ejecutar({ tipo: 'filosofia', texto: 'El obstáculo es el camino.', fuente: 'Ryan Holiday' }, ctxBase(sb));
  const ref = sb.llamadas.insertReferencia[0];
  assert.equal(ref.tipo, 'filosofia');
  assert.equal(ref.texto, 'El obstáculo es el camino.');
  assert.equal(ref.fuente, 'Ryan Holiday');
  assert.equal(ref.evento_id, 'ev-1');
  assert.ok(r.reply);
});

test('referencia_estetica: inserta referencia tipo estetica con etiquetas', async () => {
  const sb = stubSb();
  await ejecutar({ tipo: 'referencia_estetica', texto: 'tipografía serif del cartel', etiquetas: ['tipografia'] }, ctxBase(sb));
  const ref = sb.llamadas.insertReferencia[0];
  assert.equal(ref.tipo, 'estetica');
  assert.deepEqual(ref.etiquetas, ['tipografia']);
});

test('duda: arma pregunta con opciones válidas del catálogo', async () => {
  const sb = stubSb();
  const r = await ejecutar({ tipo: 'duda', pregunta: '¿Qué hago con esto?', opciones: ['tarea', 'filosofia', 'inventada'] }, ctxBase(sb));
  assert.equal(r.pregunta.opciones.length, 2); // 'inventada' se filtra
  assert.deepEqual(r.pregunta.opciones[0].accion, { clase: 'forzar_tipo', tipo: 'tarea' });
  assert.equal(r.pregunta.opciones[1].etiqueta, DESTINOS_DUDA.filosofia);
});

test('tarea: inserta en tareas y devuelve confirmación', async () => {
  const sb = stubSb();
  const r = await ejecutar({ tipo: 'tarea', tarea: 'Llamar a Oribe', categoria: 'Obra', recordatorio: { fecha: '2026-06-12', hora: null } }, ctxBase(sb));
  assert.equal(sb.llamadas.insertTarea[0].texto, 'Llamar a Oribe');
  assert.equal(sb.llamadas.insertTarea[0].fecha, '2026-06-12');
  assert.match(r.reply, /Obra/);
});
```

- [ ] **Step 3: Correr y verificar que fallan**

```bash
npm test
```

Expected: FAIL — `ejecutar` no está exportado.

- [ ] **Step 4: Reescribir advisorService.js**

Reemplazar TODO el contenido de `src/advisorService.js` por:

```js
// advisorService.js — asesor personal de Eze por WhatsApp (Haiku).
// v2 Centro de Mando: historial persistido en eventos, vault por GitHub API,
// destinos nuevos (filosofía + referencia estética + redactar) y dudas con
// opciones numeradas. clasificar() decide, ejecutar() hace; los inserts
// fallidos LANZAN error y el portero archiva el evento (nada silencioso).
// Resiliencia §9: la llamada a Haiku lleva UN reintento con backoff (2s).
const Anthropic = require('@anthropic-ai/sdk');
const { crearGithubVault } = require('./githubVault');
const { conReintento } = require('./reintento');
const supabase = require('./supabaseService');

const vaultDefault = crearGithubVault();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CATEGORIAS = ['Obra', 'Contenido de Redes', 'Agencia Publicidad', 'Compras', 'Salud', 'Finanzas Personales', 'Inmobiliario'];

// Destinos que se le pueden ofrecer a Eze cuando el clasificador duda.
const DESTINOS_DUDA = {
  tarea: 'Tarea / pendiente',
  gasto_personal: 'Gasto personal',
  nota: 'Nota al vault',
  filosofia: 'Filosofía (frase/reflexión)',
  referencia_estetica: 'Referencia estética',
  consulta: 'Solo era una consulta',
};

function hoyAR() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return { iso: d.toISOString().slice(0, 10), diaSemana: dias[d.getDay()], hhmm: d.toTimeString().slice(0, 5) };
}

const SYSTEM = `Sos el ASESOR personal y secretario de Ezequiel Otero (dueño de Ravn Construcciones), que le habla por WhatsApp.
Directo, argentino, sin humo, cálido pero no chupamedias.

Tu trabajo: leer lo que Eze te manda (puede ser un audio dictado en la calle, informal o desprolijo) y clasificarlo.

Tenés el historial de la conversación — úsalo para entender respuestas cortas como "esta semana", "Bralar", "sí", "para presentación". Son respuestas a lo que hablaron antes.

TIPOS DE MENSAJE:

1. TAREA / pendiente / recordatorio ("llamar a fulano", "comprar tornillos", "turno médico", "visita a obra"):
   - Clasificala en UNA categoría: ${CATEGORIAS.join(' · ')}
   - Eze es dueño de constructora. Estas palabras SIEMPRE van a Obra, sin importar el nombre de persona que aparezca (el nombre es el cliente, no cambia la categoría):
     * "visita [a quien sea]" → Obra (ej: "visita Fede", "visita Karol", "visitar cliente")
     * "dibujar / dibujá / diseñar / plano de [ambiente]" → Obra (ej: "dibujar baño", "dibujar dormitorio Caro")
     * "reunión / llamar / presupuesto / medir / entregar / supervisar" en contexto de obra → Obra
   - turno médico, médico, doctor → Salud; inmueble, alquiler, comprar propiedad → Inmobiliario.
   - Reescribí la tarea clara y corta (imperativo).
   - Si tiene fecha, resolvela a YYYY-MM-DD. Si dice "esta semana" → viernes de esta semana. Sin fecha → null.
   - GUARDALA DE INMEDIATO. NUNCA pidas más datos. Confirmá en UNA línea seca, sin emojis.

2. GASTO / compra / pago / factura ("gasté X en Y", "compré X por $Y", "pagué la factura de Z"):
   - Extraé: concepto, monto (número solo, sin $), proveedor si lo menciona.
   - Determiná si es PERSONAL o de OBRA:
     * PERSONAL: super, mercado, delivery, nafta, ropa, farmacia, restaurant, salida, taxi, uber — vida cotidiana SIN nombre de obra.
     * OBRA: menciona una obra por nombre ("Saavedra", "Lagomarsino", "Bralar"...), o materiales de construcción / mano de obra / herramientas de obra.
   - Si es de OBRA pero NO nombró la obra → devolvé el gasto igual con obra=null y es_personal=false. NO preguntes vos: el sistema le muestra a Eze las obras numeradas.
   - Categorizá gastos personales: Supermercado · Delivery · Salidas · Combustible · Farmacia · Ropa · Varios

3. CONSULTA / charla / pregunta de negocio: respondé corto y útil.

4. COTIZACIÓN / precio de un laburo ("cotizame X", "cuánto sale hacer X", "cuánto le cobro por X"):
   - NO la respondas vos ni inventes precios. tipo="cotizacion", respuesta="".
   - El sistema la deriva al Cotizador Maestro (corre en la Mac de Eze).

5. REDACTAR un documento (presupuesto formal, detalle de trabajos realizados, propuesta, carta, mail largo: "armame el detalle de...", "redactame la propuesta de..."):
   - tipo="redactar", respuesta="". Lo procesa la Mac con el formato oficial.

6. PEDIDO PESADO (analizar fotos o textos largos, investigar a fondo — laburo de verdad que no es cotizar ni redactar):
   - tipo="pesado", respuesta="".
   - Ante la duda entre consulta y pesado: si se responde bien en 5 líneas es consulta; si requiere laburo de verdad es pesado.

7. NOTA / idea operativa o de negocio que quiere GUARDAR ("anotá esto", "idea:", "me di cuenta de que..."):
   - tipo="nota", texto=<la nota limpia>. respuesta = confirmación seca de UNA línea.

8. FILOSOFÍA — una frase de un libro, una cita, una reflexión de fondo sobre cómo piensa él o qué tiene que ser Ravn ("anotá esta frase: ...", "la impecabilidad es lo que nos diferencia"):
   - tipo="filosofia", texto=<la frase/reflexión limpia>, fuente=<libro/autor/origen o null>.
   - Diferencia con NOTA: la nota es operativa (negocio, ideas de laburo); la filosofía es identidad, valores, cómo ve el mundo.

9. REFERENCIA ESTÉTICA descripta en texto ("me encantó la tipografía del cartel de X", "ese gris cemento para los muebles"):
   - tipo="referencia_estetica", texto=<qué le gustó y qué transmite>, etiquetas=<array, algunas de: tipografia, material, terminacion, espacio, grafica, color, mobiliario>.

10. BORRAR / deshacer lo último ("borrá el último gasto", "eso lo cargué mal, sacalo"):
   - tipo="borrar", objetivo="gasto" o "tarea" — deducilo del mensaje o del historial.

11. DUDA — SOLO si de verdad no podés decidir el destino (menos de 80% de confianza):
   - tipo="duda", pregunta=<pregunta corta y concreta>, opciones=<2 a 4 strings elegidas EXACTAMENTE de: "tarea", "gasto_personal", "nota", "filosofia", "referencia_estetica", "consulta">.
   - El sistema se las muestra a Eze numeradas. NO abuses: si estás razonablemente seguro, clasificá directo.

Devolvé SIEMPRE y SOLO un JSON válido, sin texto antes ni después:
{
  "tipo": "tarea" | "gasto" | "consulta" | "cotizacion" | "redactar" | "pesado" | "nota" | "filosofia" | "referencia_estetica" | "borrar" | "duda",
  "objetivo": "<gasto|tarea — solo si tipo=borrar>",
  "categoria": "<una de la lista — solo si tipo=tarea>",
  "tarea": "<texto de la tarea, solo si tipo=tarea>",
  "texto": "<para nota/filosofia/referencia_estetica: el contenido limpio>",
  "fuente": "<libro/autor/lugar — para filosofia/referencia_estetica, o null>",
  "etiquetas": ["<solo para referencia_estetica>"],
  "pregunta": "<solo si tipo=duda>",
  "opciones": ["<solo si tipo=duda>"],
  "gasto": {
    "concepto": "<qué se compró/pagó>",
    "monto": <número sin símbolo, null si no se mencionó>,
    "proveedor": "<nombre o null>",
    "obra": "<nombre de la obra o null>",
    "es_personal": <true si es gasto de vida cotidiana, false si es de obra>,
    "categoria_personal": "<Supermercado|Delivery|Salidas|Combustible|Farmacia|Ropa|Varios — solo si es_personal=true>"
  },
  "recordatorio": { "fecha": "YYYY-MM-DD" | null, "hora": "HH:MM" | null } | null,
  "respuesta": "<lo que le contestás — para tarea/gasto guardado: UNA línea seca>"
}`;

async function buildContext(vault) {
  const partes = [];
  const lee = async (label, rel, max) => {
    const c = await vault.readFileSafe(rel);
    if (c) partes.push(`### ${label}\n${c.slice(0, max)}`);
  };
  await lee('Identidad de Eze', 'Yo/Identidad.md', 2000);
  await lee('ADN del negocio', 'Ravn/ADN.md', 2000);
  const [orient] = await vault.listRecent('Orientación', 1);
  if (orient) await lee('Última orientación', `Orientación/${orient}`, 2000);
  return partes.join('\n\n');
}

function parseJson(raw) {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function formatGasto(g) {
  const monto = g.monto ? `$${Number(g.monto).toLocaleString('es-AR')}` : 'monto no especificado';
  const prov = g.proveedor ? ` (${g.proveedor})` : '';
  return `${g.concepto}${prov} — ${monto}`;
}

// Llama a Haiku con el historial PERSISTIDO (eventos) y devuelve { raw, data }.
async function clasificar(texto, { excluirId = null, forzarTipo = null, anthropic = null, vault = null } = {}) {
  const cli = anthropic || client;
  const v = vault || vaultDefault;
  let context = '';
  try { context = await buildContext(v); } catch (e) { console.error('[Advisor] context err:', e.message); }
  const { iso, diaSemana, hhmm } = hoyAR();
  const historial = await supabase.getHistorialEventos(10, excluirId);

  let system = SYSTEM + `\n\nFECHA Y HORA ACTUAL (Argentina): hoy es ${diaSemana} ${iso}, ${hhmm}hs.`;
  if (forzarTipo) {
    system += `\n\nIMPORTANTE: Eze ya confirmó que este mensaje es de tipo "${forzarTipo}". Clasificalo con ese tipo sí o sí y extraé los campos correspondientes.`;
  }
  if (context) system += `\n\n--- CONTEXTO DEL VAULT ---\n${context}`;

  // Spec §9: si Haiku falla (red, 5xx, overloaded), UN reintento con backoff
  // de 2s antes de que el error suba y el portero archive el evento.
  const resp = await conReintento(
    () => cli.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 700,
      system,
      messages: [...historial, { role: 'user', content: texto }],
    }),
    { etiqueta: 'Haiku clasificador' }
  );
  const raw = (resp.content || []).map((b) => b.text || '').join('').trim();
  return { raw, data: parseJson(raw) || { tipo: 'consulta', respuesta: raw || 'Listo.' } };
}

// Ejecuta una clasificación ya decidida. Devuelve UNO de:
//   { reply }                      → contestar y listo
//   { encolar: { tipo, prompt } }  → el portero lo mete en trabajos_cola
//   { pregunta: { texto, opciones: [{ etiqueta, accion }] } } → opciones numeradas
// LANZA Error si un insert falla (el portero archiva el evento y avisa).
async function ejecutar(data, ctx) {
  const sb = ctx.sb || supabase;
  const v = ctx.vault || vaultDefault;
  const hoyIso = ctx.hoyIso || hoyAR().iso;
  let reply = (data.respuesta || '').trim();

  switch (data.tipo) {
    case 'cotizacion':
      return { encolar: { tipo: 'cotizar', prompt: ctx.texto } };
    case 'redactar':
      return { encolar: { tipo: 'redactar', prompt: ctx.texto } };
    case 'pesado':
      return { encolar: { tipo: 'orden', prompt: ctx.texto } };

    case 'duda': {
      const validas = (data.opciones || []).filter((o) => DESTINOS_DUDA[o]);
      if (!validas.length) return { reply: reply || 'No te entendí bien — ¿me lo decís de otra forma?' };
      return {
        pregunta: {
          texto: data.pregunta || '¿Qué hago con esto?',
          opciones: validas.map((o) => ({ etiqueta: DESTINOS_DUDA[o], accion: { clase: 'forzar_tipo', tipo: o } })),
        },
      };
    }

    case 'tarea': {
      if (!data.tarea) return { reply: reply || 'No entendí la tarea — ¿me la repetís?' };
      const cat = CATEGORIAS.includes(data.categoria) ? data.categoria : 'Obra';
      const rec = data.recordatorio || {};
      const tareaId = await sb.insertTarea({ texto: data.tarea, categoria: cat, fecha: rec.fecha || null, hora: rec.hora || null });
      if (!tareaId) throw new Error('insert en tareas falló');
      await sb.marcarDestino(ctx.eventoId, 'tareas', tareaId);
      const okVault = await v.appendInboxSection(cat, data.tarea).catch(() => false);
      reply = reply || `Anotado en ${cat}: ${data.tarea}`;
      if (!okVault) reply += '\n(ojo: no pude espejarla en el vault)';
      return { reply };
    }

    case 'gasto': {
      const g = data.gasto || {};
      if (!g.concepto) return { reply: reply || 'No entendí el gasto — ¿me lo repetís con el monto?' };

      if (g.es_personal) {
        const gastoId = await sb.insertGastoPersonal({
          concepto: g.concepto,
          monto: g.monto,
          categoria: g.categoria_personal || 'Varios',
          fecha: hoyIso,
        });
        if (!gastoId) throw new Error('insert en gastos_personales falló');
        await sb.marcarDestino(ctx.eventoId, 'gastos_personales', gastoId);
        const monto = g.monto ? ` — $${Number(g.monto).toLocaleString('es-AR')}` : '';
        return { reply: reply || `Gasto personal anotado: ${g.concepto}${monto} (${g.categoria_personal || 'Varios'})` };
      }

      // Gasto de OBRA → presupuestos_gastos (alimenta la calibración del cotizador).
      const candidatas = g.obra ? await sb.buscarPresupuestosPorNombre(g.obra) : [];
      if (candidatas.length === 1) {
        const gastoId = await sb.insertGastoObra({
          presupuesto_id: candidatas[0].id,
          descripcion: formatGasto(g),
          importe: g.monto || 0,
          fecha: hoyIso,
        });
        if (!gastoId) throw new Error('insert en presupuestos_gastos falló');
        await sb.marcarDestino(ctx.eventoId, 'presupuestos_gastos', gastoId);
        const nombre = candidatas[0].nombre_obra || candidatas[0].nombre_cliente;
        return { reply: `Gasto cargado a ${nombre}: ${formatGasto(g)}` };
      }

      // 0 o varias candidatas → pregunta con obras numeradas (+ archivar).
      const obras = candidatas.length > 1 ? candidatas : await sb.listarObrasActivas(6);
      if (!obras.length) throw new Error('no hay obras activas para asignar el gasto');
      return {
        pregunta: {
          texto: `¿A qué obra cargo "${formatGasto(g)}"?`,
          opciones: [
            ...obras.map((o) => ({
              etiqueta: o.nombre_obra || o.nombre_cliente || String(o.id).slice(0, 8),
              accion: { clase: 'gasto_obra', presupuesto_id: o.id, gasto: g },
            })),
            { etiqueta: 'Ninguna — archivalo', accion: { clase: 'archivar' } },
          ],
        },
      };
    }

    case 'filosofia': {
      const texto = (data.texto || ctx.texto || '').trim();
      const refId = await sb.insertReferencia({ tipo: 'filosofia', texto, fuente: data.fuente || null, evento_id: ctx.eventoId });
      if (!refId) throw new Error('insert en referencias falló');
      await sb.marcarDestino(ctx.eventoId, 'referencias', refId);
      await v.appendInbox(`FILOSOFÍA — ${texto}${data.fuente ? ` (${data.fuente})` : ''}`).catch(() => false);
      return { reply: reply || '📖 Guardada en tu filosofía.' };
    }

    case 'referencia_estetica': {
      const texto = (data.texto || ctx.texto || '').trim();
      const refId = await sb.insertReferencia({
        tipo: 'estetica',
        texto,
        etiquetas: data.etiquetas || [],
        fuente: data.fuente || null,
        evento_id: ctx.eventoId,
      });
      if (!refId) throw new Error('insert en referencias falló');
      await sb.marcarDestino(ctx.eventoId, 'referencias', refId);
      return { reply: reply || '🖼️ Referencia estética guardada en el ADN.' };
    }

    case 'borrar': {
      const objetivo = data.objetivo === 'tarea' ? 'tarea' : 'gasto';
      const borrado = await sb.borrarUltimo(objetivo);
      return {
        reply: borrado
          ? `🗑️ Borrado: ${borrado}`
          : `No pude borrar — o no hay ${objetivo}s recientes o me faltan permisos.`,
      };
    }

    case 'nota': {
      const okN = await v.appendInbox(`(WhatsApp · nota) ${data.texto || ctx.texto}`).catch(() => false);
      if (!okN) throw new Error('append al vault falló');
      return { reply: reply || '📝 Guardado en el vault.' };
    }

    default: { // consulta
      v.appendInbox(`(WhatsApp) Eze: ${ctx.texto}`).catch(() => {});
      return { reply: reply || 'Listo.' };
    }
  }
}

// Punto de entrada del portero: clasifica, persiste el turno del asesor en
// eventos (historial) y ejecuta.
async function advise(texto, eventoId, deps = {}) {
  const { raw, data } = await clasificar(texto, { excluirId: eventoId, anthropic: deps.anthropic, vault: deps.vault });
  await supabase.insertEvento({
    origen: 'bot',
    tipo: 'respuesta_asesor',
    titulo: `asesor: ${data.tipo || 'respuesta'}`,
    contenido: { raw },
  });
  return ejecutar(data, { texto, eventoId, sb: deps.sb, vault: deps.vault });
}

// Re-clasifica con tipo forzado (cuando Eze eligió una opción numerada).
async function ejecutarTipoForzado(tipoElegido, texto, eventoId, deps = {}) {
  const { data } = await clasificar(texto, { excluirId: eventoId, forzarTipo: tipoElegido, anthropic: deps.anthropic, vault: deps.vault });
  data.tipo = tipoElegido === 'gasto_personal' ? 'gasto' : tipoElegido;
  if (tipoElegido === 'gasto_personal') {
    data.gasto = { concepto: texto, monto: null, categoria_personal: 'Varios', ...(data.gasto || {}), es_personal: true };
  }
  return ejecutar(data, { texto, eventoId, sb: deps.sb, vault: deps.vault });
}

module.exports = { advise, clasificar, ejecutar, ejecutarTipoForzado, parseJson, DESTINOS_DUDA, CATEGORIAS };
```

- [ ] **Step 5: Borrar vaultService.js**

```bash
git rm src/vaultService.js
```

- [ ] **Step 6: Correr y verificar que pasan**

```bash
npm test && node --check src/advisorService.js
```

Expected: `# fail 0` y sin errores de sintaxis.

**Nota transitoria:** `src/index.js` todavía llama `advise(text, from)` con la firma vieja — el segundo argumento se ignora sin romper (se usa como eventoId y los updates con id inválido se loguean y devuelven false). El cableado definitivo es la Tarea 12. NO deployar entre medio.

- [ ] **Step 7: Commit**

```bash
git add src/advisorService.js test/advisor-ejecutar.test.js
git commit -m "feat: asesor 2.0 — filosofia/referencia_estetica/redactar/duda, historial en eventos, gasto de obra a presupuestos_gastos, errores que lanzan

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 9: `preguntasService.js` — opciones numeradas + barrido de vencidas (4h → Archivados)

El timeout NO usa `setTimeout` (no sobrevive reboots de Railway): la pregunta queda persistida en el evento (`estado='pendiente_pregunta'`, `contenido.pregunta` con `enviada_at`) y el cron existente de 30 min barre las vencidas → `archivado` + aviso. El timeout corre desde que se **envió la pregunta** (`enviada_at`), no desde la llegada del mensaje (ver `inicioPregunta` en Tarea 3).

**Ventana muerta — comportamiento ACEPTADO (decisión, no bug):** entre que una pregunta vence (4h desde `enviada_at`) y el cron la archiva pueden pasar hasta 30 min. Si Eze responde el número en esa ventana, `resolver()` ya no encuentra la pregunta y el número cae al asesor como texto suelto (que contesta algo genérico). Nada se pierde: el mensaje queda registrado como evento, y la pregunta original termina en Archivados en el próximo barrido, resoluble desde el tablero. Se acepta porque cerrar la ventana exigiría barrer en cada mensaje o acortar el cron, y el caso es marginal.

**Files:**
- Create: `src/preguntasService.js`
- Test: `test/preguntas.test.js`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `test/preguntas.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearPreguntas, renderPregunta } = require('../src/preguntasService');
const { crearFakeEnviar } = require('./helpers/fakes');

const OPCIONES = [
  { etiqueta: 'Tarea / pendiente', accion: { clase: 'forzar_tipo', tipo: 'tarea' } },
  { etiqueta: 'Nota al vault', accion: { clase: 'forzar_tipo', tipo: 'nota' } },
];

function stubSb(overrides = {}) {
  const updates = [];
  const archivados = [];
  return {
    updates,
    archivados,
    getEvento: async (id) => ({ id, contenido: { texto: 'mensaje original' } }),
    updateEvento: async (id, campos) => { updates.push({ id, campos }); return true; },
    archivarEvento: async (id, motivo) => { archivados.push({ id, motivo }); return true; },
    getPreguntaPendiente: async () => null,
    getPreguntasVencidas: async () => [],
    ...overrides,
  };
}

test('renderPregunta numera las opciones y avisa el timeout', () => {
  const txt = renderPregunta('¿Qué hago con esto?', OPCIONES);
  assert.match(txt, /1\. Tarea \/ pendiente/);
  assert.match(txt, /2\. Nota al vault/);
  assert.match(txt, /Archivados/);
});

test('preguntar deja el evento en pendiente_pregunta con las opciones adentro y manda el mensaje', async () => {
  const sb = stubSb();
  const { enviar, enviados } = crearFakeEnviar();
  const p = crearPreguntas({ sb, enviar, ownerPhone: () => '549111' });
  await p.preguntar('ev-1', '¿Qué hago con esto?', OPCIONES);
  assert.equal(sb.updates[0].campos.estado, 'pendiente_pregunta');
  assert.equal(sb.updates[0].campos.contenido.pregunta.opciones.length, 2);
  assert.equal(sb.updates[0].campos.contenido.texto, 'mensaje original'); // no pisa contenido
  assert.ok(sb.updates[0].campos.contenido.pregunta.enviada_at); // el timeout corre desde acá
  assert.equal(enviados[0].to, '549111');
  assert.match(enviados[0].texto, /1\./);
});

test('resolver con número válido ejecuta la acción y marca resuelto', async () => {
  const sb = stubSb({
    getPreguntaPendiente: async () => ({ id: 'ev-1', contenido: { texto: 'orig', pregunta: { texto: '¿?', opciones: OPCIONES } } }),
  });
  const { enviar } = crearFakeEnviar();
  const p = crearPreguntas({ sb, enviar, ownerPhone: () => '549111' });
  const acciones = [];
  const consumido = await p.resolver('2', async (accion, ev) => acciones.push({ accion, ev }));
  assert.equal(consumido, true);
  assert.deepEqual(acciones[0].accion, { clase: 'forzar_tipo', tipo: 'nota' });
  assert.equal(sb.updates.find((u) => u.campos.estado === 'resuelto').id, 'ev-1');
});

test('resolver devuelve false si no hay pregunta pendiente o el texto no es un número', async () => {
  const sb = stubSb();
  const { enviar } = crearFakeEnviar();
  const p = crearPreguntas({ sb, enviar, ownerPhone: () => '549111' });
  assert.equal(await p.resolver('3', async () => {}), false);     // sin pregunta pendiente
  assert.equal(await p.resolver('dale', async () => {}), false);  // no es número
  assert.equal(await p.resolver('2 3', async () => {}), false);   // no es UN número
});

test('resolver con número fuera de rango avisa y consume el mensaje', async () => {
  const sb = stubSb({
    getPreguntaPendiente: async () => ({ id: 'ev-1', contenido: { pregunta: { texto: '¿?', opciones: OPCIONES } } }),
  });
  const { enviar, enviados } = crearFakeEnviar();
  const p = crearPreguntas({ sb, enviar, ownerPhone: () => '549111' });
  assert.equal(await p.resolver('9', async () => {}), true);
  assert.match(enviados[0].texto, /1 al 2/);
});

test('si la acción elegida falla, el evento queda ARCHIVADO y se avisa (nunca silencioso)', async () => {
  const sb = stubSb({
    getPreguntaPendiente: async () => ({ id: 'ev-1', titulo: 'x', contenido: { pregunta: { texto: '¿?', opciones: OPCIONES } } }),
  });
  const { enviar, enviados } = crearFakeEnviar();
  const p = crearPreguntas({ sb, enviar, ownerPhone: () => '549111' });
  await p.resolver('1', async () => { throw new Error('RLS bloqueó'); });
  assert.equal(sb.archivados[0].id, 'ev-1');
  assert.match(enviados[0].texto, /Archivados/);
});

test('barrerVencidas archiva todas las vencidas y manda UN aviso con los títulos', async () => {
  const sb = stubSb({
    getPreguntasVencidas: async () => [
      { id: 'ev-1', titulo: 'gasté 50 lucas' },
      { id: 'ev-2', titulo: '[image]' },
    ],
  });
  const { enviar, enviados } = crearFakeEnviar();
  const p = crearPreguntas({ sb, enviar, ownerPhone: () => '549111' });
  const n = await p.barrerVencidas();
  assert.equal(n, 2);
  assert.equal(sb.archivados.length, 2);
  assert.equal(enviados.length, 1);
  assert.match(enviados[0].texto, /gasté 50 lucas/);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../src/preguntasService'`.

- [ ] **Step 3: Implementar preguntasService.js**

Crear `src/preguntasService.js`:

```js
// preguntasService.js — el flujo de duda del Centro de Mando: el bot pregunta
// con opciones numeradas; si Eze no contesta en N horas, el evento va a
// Archivados (visible en el tablero) y se avisa. NADA se pierde.
//
// El timeout NO usa setTimeout (no sobrevive reboots de Railway): la pregunta
// vive en el evento (estado=pendiente_pregunta) y el cron de 30 min barre.

const TIMEOUT_HORAS = () => parseFloat(process.env.PREGUNTA_TIMEOUT_HORAS || '4');

function renderPregunta(texto, opciones) {
  const lineas = opciones.map((o, i) => `${i + 1}. ${o.etiqueta}`);
  return `🤔 ${texto}\n\n${lineas.join('\n')}\n\nRespondé con el número. Si no contestás en ${TIMEOUT_HORAS()}h lo mando a Archivados (no se pierde, lo resolvés desde el tablero).`;
}

function crearPreguntas({ sb, enviar, ownerPhone }) {
  // sb = supabaseService · enviar = (to, texto) => Promise · ownerPhone = () => string

  // Persiste la pregunta en el evento y la manda numerada. enviada_at marca
  // desde cuándo corre el timeout (no desde la llegada del mensaje).
  async function preguntar(eventoId, texto, opciones) {
    if (eventoId) {
      const ev = await sb.getEvento(eventoId);
      const contenido = {
        ...((ev && ev.contenido) || {}),
        pregunta: { texto, opciones, enviada_at: new Date().toISOString() },
      };
      await sb.updateEvento(eventoId, { estado: 'pendiente_pregunta', contenido });
    }
    await enviar(ownerPhone(), renderPregunta(texto, opciones));
  }

  // Si hay una pregunta pendiente y el texto es UN número, la resuelve.
  // Devuelve true si consumió el mensaje (el portero corta ahí).
  async function resolver(texto, ejecutarAccion) {
    const limpio = String(texto || '').trim();
    if (!/^\d{1,2}$/.test(limpio)) return false;
    const ev = await sb.getPreguntaPendiente(TIMEOUT_HORAS());
    if (!ev) return false;
    const opciones = ev.contenido?.pregunta?.opciones || [];
    const n = parseInt(limpio, 10);
    if (n < 1 || n > opciones.length) {
      await enviar(ownerPhone(), `⚠️ Respondé un número del 1 al ${opciones.length} (o dejá que se archive solo).`);
      return true;
    }
    try {
      await ejecutarAccion(opciones[n - 1].accion, ev);
      await sb.updateEvento(ev.id, { estado: 'resuelto' });
    } catch (e) {
      // REGLA: nunca silencioso — archivado + aviso.
      console.error('[Preguntas] resolver err:', e.message);
      await sb.archivarEvento(ev.id, `falló la opción elegida: ${e.message}`);
      await enviar(ownerPhone(), `⚠️ No pude ejecutar esa opción (${e.message}). Quedó en Archivados — lo ves en el tablero, no se perdió.`);
    }
    return true;
  }

  // Barrido del cron: preguntas vencidas → archivado + UN aviso resumido.
  async function barrerVencidas() {
    const vencidas = await sb.getPreguntasVencidas(TIMEOUT_HORAS());
    for (const ev of vencidas) {
      await sb.archivarEvento(ev.id, 'pregunta vencida sin respuesta');
    }
    if (vencidas.length) {
      const titulos = vencidas.map((e) => `• ${e.titulo}`).join('\n');
      await enviar(
        ownerPhone(),
        `🗄️ Mandé a Archivados (sin respuesta en ${TIMEOUT_HORAS()}h):\n${titulos}\n\nLos resolvés desde el tablero cuando quieras.`
      );
    }
    return vencidas.length;
  }

  return { preguntar, resolver, barrerVencidas };
}

module.exports = { crearPreguntas, renderPregunta };
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
npm test
```

Expected: `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/preguntasService.js test/preguntas.test.js
git commit -m "feat: flujo de duda — opciones numeradas persistidas en eventos + barrido 4h a Archivados

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 10: `adnService.js` — fotos → moodboard / filosofía / cola

Spec §7.2: foto → visión describe y etiqueta → binario a Storage `referencias` → fila en `referencias`. Página de libro → extraer texto → `tipo='filosofia'` (imagen adjunta). Factura/obra → `trabajos_cola` (lo procesa la Mac, como hoy). Duda → opciones numeradas.

**Files:**
- Create: `src/adnService.js`
- Test: `test/adn.test.js`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `test/adn.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearAdn } = require('../src/adnService');

function stubSb(overrides = {}) {
  const llamadas = { referencias: [], uploads: [], trabajos: [], destinos: [] };
  return {
    llamadas,
    subirImagenReferencia: async (buf, mime) => { llamadas.uploads.push({ mime }); return 'whatsapp/1.jpg'; },
    insertReferencia: async (r) => { llamadas.referencias.push(r); return 'r-1'; },
    insertTrabajo: async (t) => { llamadas.trabajos.push(t); return 'tr-1'; },
    marcarDestino: async (...a) => { llamadas.destinos.push(a); return true; },
    ...overrides,
  };
}

const stubVault = { appendInbox: async () => true };
const descargar = async () => ({ buffer: Buffer.from('img'), mime: 'image/jpeg' });
const MEDIA = { id: 'media-1', mime: 'image/jpeg', tipo_wa: 'image' };

function visionQueDevuelve(analisis) {
  return { analizarImagen: async () => analisis };
}

test('foto estética: sube a Storage, crea referencia tipo estetica y confirma', async () => {
  const sb = stubSb();
  const adn = crearAdn({ sb, vision: visionQueDevuelve({ clase: 'estetica', descripcion: 'fachada hormigón visto', etiquetas: ['material'], texto_extraido: null }), vault: stubVault, descargar });
  const r = await adn.procesarFoto({ eventoId: 'ev-1', media: MEDIA, caption: null });
  assert.equal(sb.llamadas.uploads.length, 1);
  const ref = sb.llamadas.referencias[0];
  assert.equal(ref.tipo, 'estetica');
  assert.equal(ref.imagen_path, 'whatsapp/1.jpg');
  assert.equal(ref.evento_id, 'ev-1');
  assert.match(r.reply, /moodboard/i);
});

test('foto estética: si el upload a Storage falla, LANZA', async () => {
  const sb = stubSb({ subirImagenReferencia: async () => null });
  const adn = crearAdn({ sb, vision: visionQueDevuelve({ clase: 'estetica', descripcion: 'x', etiquetas: [], texto_extraido: null }), vault: stubVault, descargar });
  await assert.rejects(() => adn.procesarFoto({ eventoId: 'ev-1', media: MEDIA }), /Storage/);
});

test('foto de página de libro: extrae el texto y crea referencia tipo filosofia', async () => {
  const sb = stubSb();
  const adn = crearAdn({ sb, vision: visionQueDevuelve({ clase: 'filosofia', descripcion: 'página de libro', etiquetas: [], texto_extraido: 'El obstáculo es el camino.' }), vault: stubVault, descargar });
  const r = await adn.procesarFoto({ eventoId: 'ev-1', media: MEDIA, caption: 'Ryan Holiday' });
  const ref = sb.llamadas.referencias[0];
  assert.equal(ref.tipo, 'filosofia');
  assert.equal(ref.texto, 'El obstáculo es el camino.');
  assert.equal(ref.fuente, 'Ryan Holiday');
  assert.match(r.reply, /filosofía/i);
});

test('factura/obra: va a trabajos_cola tipo orden con la media en contexto', async () => {
  const sb = stubSb();
  const adn = crearAdn({ sb, vision: visionQueDevuelve({ clase: 'factura', descripcion: 'ticket', etiquetas: [], texto_extraido: null }), vault: stubVault, descargar });
  const r = await adn.procesarFoto({ eventoId: 'ev-1', media: MEDIA, caption: 'factura de Easy' });
  assert.equal(r.encolado, true);
  const tr = sb.llamadas.trabajos[0];
  assert.equal(tr.tipo, 'orden');
  assert.equal(tr.contexto.media.id, 'media-1');
  assert.deepEqual(sb.llamadas.destinos[0], ['ev-1', 'trabajos_cola', 'tr-1']);
});

test('clase otra: devuelve pregunta con 4 opciones (estética/filosofía/cola/archivar)', async () => {
  const sb = stubSb();
  const adn = crearAdn({ sb, vision: visionQueDevuelve({ clase: 'otra', descripcion: 'no sé qué es', etiquetas: [], texto_extraido: null }), vault: stubVault, descargar });
  const r = await adn.procesarFoto({ eventoId: 'ev-1', media: MEDIA });
  assert.equal(r.pregunta.opciones.length, 4);
  assert.equal(r.pregunta.opciones[0].accion.clase, 'foto');
  assert.equal(r.pregunta.opciones[3].accion.clase, 'archivar');
});

test('procesarFotoForzada con destino estetica guarda la referencia', async () => {
  const sb = stubSb();
  const adn = crearAdn({ sb, vision: visionQueDevuelve({ clase: 'otra', descripcion: 'detalle de herrería', etiquetas: ['material'], texto_extraido: null }), vault: stubVault, descargar });
  const evento = { id: 'ev-1', contenido: { media: MEDIA, texto: null } };
  const reply = await adn.procesarFotoForzada(evento, 'estetica');
  assert.equal(sb.llamadas.referencias[0].tipo, 'estetica');
  assert.ok(reply);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../src/adnService'`.

- [ ] **Step 3: Implementar adnService.js**

Crear `src/adnService.js`:

```js
// adnService.js — capturas de ADN de Ravn (spec §7.2): una foto que manda Eze
// termina en el moodboard (referencia estética) o en su filosofía (página de
// libro → texto extraído), sin que haga nada más que mandarla.
const { downloadWhatsappMedia } = require('./transcribeService');

function crearAdn({ sb, vision, vault, descargar }) {
  const bajar = descargar || downloadWhatsappMedia;

  async function guardarEstetica({ eventoId, buffer, mime, analisis, caption }) {
    const path = await sb.subirImagenReferencia(buffer, mime);
    if (!path) throw new Error('upload a Storage (bucket referencias) falló');
    const refId = await sb.insertReferencia({
      tipo: 'estetica',
      texto: analisis.descripcion || caption || null,
      etiquetas: analisis.etiquetas || [],
      fuente: caption || null,
      imagen_path: path,
      evento_id: eventoId,
    });
    if (!refId) throw new Error('insert en referencias falló');
    await sb.marcarDestino(eventoId, 'referencias', refId);
    const tags = (analisis.etiquetas || []).map((t) => `#${t}`).join(' ');
    return `🖼️ Al moodboard: ${analisis.descripcion || 'referencia guardada'}${tags ? `\n${tags}` : ''}`;
  }

  async function guardarFilosofia({ eventoId, buffer, mime, analisis, caption }) {
    const texto = analisis.texto_extraido || analisis.descripcion || caption;
    if (!texto) throw new Error('no pude extraer texto de la página');
    // La imagen queda adjunta (spec §7.2) — si el upload falla, la frase se guarda igual.
    const path = await sb.subirImagenReferencia(buffer, mime);
    const refId = await sb.insertReferencia({
      tipo: 'filosofia',
      texto,
      fuente: caption || null,
      imagen_path: path,
      evento_id: eventoId,
    });
    if (!refId) throw new Error('insert en referencias falló');
    await sb.marcarDestino(eventoId, 'referencias', refId);
    await vault.appendInbox(`FILOSOFÍA — ${texto.slice(0, 500)}${caption ? ` (${caption})` : ''}`).catch(() => false);
    return `📖 A tu filosofía:\n_"${texto.slice(0, 300)}${texto.length > 300 ? '…' : ''}"_`;
  }

  async function encolarMedia({ eventoId, media, caption }) {
    const trabajoId = await sb.insertTrabajo({
      tipo: 'orden',
      prompt: caption || '[archivo sin texto]',
      contexto: { media, evento_id: eventoId },
    });
    if (!trabajoId) throw new Error('insert en trabajos_cola falló');
    await sb.marcarDestino(eventoId, 'trabajos_cola', trabajoId);
  }

  // Foto del owner. Devuelve { reply } | { encolado: true } | { pregunta }.
  // LANZA si algo falla (el portero archiva el evento y avisa).
  async function procesarFoto({ eventoId, media, caption }) {
    const { buffer, mime } = await bajar(media.id);
    const analisis = await vision.analizarImagen(buffer, mime, caption);
    if (analisis.clase === 'estetica') {
      return { reply: await guardarEstetica({ eventoId, buffer, mime, analisis, caption }) };
    }
    if (analisis.clase === 'filosofia') {
      return { reply: await guardarFilosofia({ eventoId, buffer, mime, analisis, caption }) };
    }
    if (analisis.clase === 'factura' || analisis.clase === 'obra') {
      await encolarMedia({ eventoId, media, caption });
      return { encolado: true };
    }
    // 'otra' → preguntar con opciones (timeout → Archivados, como todo).
    return {
      pregunta: {
        texto: `Recibí la foto${analisis.descripcion ? ` (${analisis.descripcion})` : ''} — ¿qué hago con ella?`,
        opciones: [
          { etiqueta: 'Referencia estética (moodboard)', accion: { clase: 'foto', destino: 'estetica' } },
          { etiqueta: 'Filosofía (extraer el texto)', accion: { clase: 'foto', destino: 'filosofia' } },
          { etiqueta: 'Procesarla en la Mac (factura/obra)', accion: { clase: 'foto', destino: 'cola' } },
          { etiqueta: 'Nada — archivala', accion: { clase: 'archivar' } },
        ],
      },
    };
  }

  // Ejecuta el destino que Eze eligió para una foto que estaba en duda.
  async function procesarFotoForzada(evento, destino) {
    const media = evento.contenido?.media;
    if (!media) throw new Error('el evento no tiene media adjunta');
    const caption = evento.contenido?.texto || null;
    if (destino === 'cola') {
      await encolarMedia({ eventoId: evento.id, media, caption });
      return '🛠️ Tomado. Lo proceso en la Mac y te aviso.';
    }
    const { buffer, mime } = await bajar(media.id);
    const analisis = await vision.analizarImagen(buffer, mime, caption);
    if (destino === 'estetica') return guardarEstetica({ eventoId: evento.id, buffer, mime, analisis, caption });
    if (destino === 'filosofia') return guardarFilosofia({ eventoId: evento.id, buffer, mime, analisis, caption });
    throw new Error(`destino de foto desconocido: ${destino}`);
  }

  return { procesarFoto, procesarFotoForzada };
}

module.exports = { crearAdn };
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
npm test
```

Expected: `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/adnService.js test/adn.test.js
git commit -m "feat: capturas ADN — foto a moodboard/filosofía con visión, Storage y tabla referencias

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 11: `portero.js` — ruteo de todos los mensajes del owner

El portero orquesta: pregunta pendiente → cancelar → fotos/documentos → atajo cotizame → trabajo esperando datos → asesor. Cualquier excepción ⇒ evento `archivado` + aviso por WhatsApp (regla "nunca silencioso").

**Files:**
- Create: `src/portero.js`
- Test: `test/portero.test.js`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `test/portero.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearPortero } = require('../src/portero');
const { crearFakeEnviar } = require('./helpers/fakes');

function stubSb(overrides = {}) {
  const llamadas = { trabajos: [], archivados: [], destinos: [] };
  return {
    llamadas,
    insertTrabajo: async (t) => { llamadas.trabajos.push(t); return 'tr-1'; },
    marcarDestino: async (...a) => { llamadas.destinos.push(a); return true; },
    archivarEvento: async (id, motivo) => { llamadas.archivados.push({ id, motivo }); return true; },
    getTrabajoCancelable: async () => null,
    cancelarTrabajo: async () => true,
    getTrabajoEsperandoDatos: async () => null,
    responderTrabajo: async () => true,
    insertGastoObra: async () => 'go-1',
    macViva: async () => true,
    ...overrides,
  };
}

function armar({ sb, advisor, preguntas, adn }) {
  const { enviar, enviados } = crearFakeEnviar();
  const portero = crearPortero({
    sb,
    advisor: advisor || { advise: async () => ({ reply: 'Listo.' }), ejecutarTipoForzado: async () => ({ reply: 'ok' }) },
    preguntas: preguntas || { resolver: async () => false, preguntar: async () => {} },
    adn: adn || { procesarFoto: async () => ({ reply: 'ok' }), procesarFotoForzada: async () => 'ok' },
    enviar,
    ownerPhone: () => '549111',
  });
  return { portero, enviados };
}

test('atajo cotizame: encola tipo cotizar y manda el ack', async () => {
  const sb = stubSb();
  const { portero, enviados } = armar({ sb });
  await portero.manejar({ texto: 'cotizame baño completo en Pilar', media: null, eventoId: 'ev-1' });
  assert.equal(sb.llamadas.trabajos[0].tipo, 'cotizar');
  assert.equal(sb.llamadas.trabajos[0].prompt, 'cotizame baño completo en Pilar');
  assert.equal(sb.llamadas.trabajos[0].contexto.evento_id, 'ev-1');
  assert.deepEqual(sb.llamadas.destinos[0], ['ev-1', 'trabajos_cola', 'tr-1']);
  assert.match(enviados[0].texto, /Cotizador Maestro/);
});

test('pregunta pendiente: si resolver consume el mensaje, no sigue el ruteo', async () => {
  const sb = stubSb();
  let advised = false;
  const { portero } = armar({
    sb,
    preguntas: { resolver: async () => true, preguntar: async () => {} },
    advisor: { advise: async () => { advised = true; return { reply: 'x' }; }, ejecutarTipoForzado: async () => ({}) },
  });
  await portero.manejar({ texto: '2', media: null, eventoId: 'ev-1' });
  assert.equal(advised, false);
});

test('trabajo esperando datos: el mensaje es la respuesta', async () => {
  const sb = stubSb({ getTrabajoEsperandoDatos: async () => ({ id: 'tr-9' }) });
  const respuestas = [];
  sb.responderTrabajo = async (id, t) => { respuestas.push({ id, t }); return true; };
  const { portero, enviados } = armar({ sb });
  await portero.manejar({ texto: '12 m2 con terminación premium', media: null, eventoId: 'ev-1' });
  assert.deepEqual(respuestas[0], { id: 'tr-9', t: '12 m2 con terminación premium' });
  assert.match(enviados[0].texto, /Anotado/);
});

test('asesor con pregunta: el portero la manda numerada', async () => {
  const sb = stubSb();
  const preguntasHechas = [];
  const { portero } = armar({
    sb,
    advisor: {
      advise: async () => ({ pregunta: { texto: '¿A qué obra?', opciones: [{ etiqueta: 'Saavedra', accion: { clase: 'gasto_obra', presupuesto_id: 'p-1', gasto: {} } }] } }),
      ejecutarTipoForzado: async () => ({}),
    },
    preguntas: { resolver: async () => false, preguntar: async (id, txt, ops) => preguntasHechas.push({ id, txt, ops }) },
  });
  await portero.manejar({ texto: 'gasté 50 lucas en cemento', media: null, eventoId: 'ev-1' });
  assert.equal(preguntasHechas[0].id, 'ev-1');
  assert.equal(preguntasHechas[0].ops.length, 1);
});

test('si el asesor LANZA: evento archivado + aviso con "Archivados" (nunca silencioso)', async () => {
  const sb = stubSb();
  const { portero, enviados } = armar({
    sb,
    advisor: { advise: async () => { throw new Error('insert en tareas falló'); }, ejecutarTipoForzado: async () => ({}) },
  });
  await portero.manejar({ texto: 'llamar a Oribe', media: null, eventoId: 'ev-1' });
  assert.equal(sb.llamadas.archivados[0].id, 'ev-1');
  assert.match(sb.llamadas.archivados[0].motivo, /tareas/);
  assert.match(enviados[0].texto, /Archivados/);
});

test('documento del owner: va a la cola tipo orden con la media en contexto', async () => {
  const sb = stubSb();
  const { portero, enviados } = armar({ sb });
  const media = { id: 'doc-1', mime: 'application/pdf', filename: 'factura.pdf', tipo_wa: 'document' };
  await portero.manejar({ texto: 'factura de Easy', media, eventoId: 'ev-1' });
  assert.equal(sb.llamadas.trabajos[0].tipo, 'orden');
  assert.equal(sb.llamadas.trabajos[0].contexto.media.id, 'doc-1');
  assert.match(enviados[0].texto, /Recibido/);
});

test('cancelar: frena el último trabajo cancelable', async () => {
  const cancelados = [];
  const sb = stubSb({ getTrabajoCancelable: async () => ({ id: 'tr-5', estado: 'pendiente' }) });
  sb.cancelarTrabajo = async (id) => { cancelados.push(id); return true; };
  const { portero, enviados } = armar({ sb });
  await portero.manejar({ texto: 'cancelar', media: null, eventoId: 'ev-1' });
  assert.deepEqual(cancelados, ['tr-5']);
  assert.match(enviados[0].texto, /cancelado/i);
});

test('cancel (en inglés) también frena el trabajo — paridad con el bot viejo', async () => {
  // Hoy index.js:567 acepta 'cancelar' Y 'cancel' para frenar la cola.
  const cancelados = [];
  const sb = stubSb({ getTrabajoCancelable: async () => ({ id: 'tr-6', estado: 'esperando_datos' }) });
  sb.cancelarTrabajo = async (id) => { cancelados.push(id); return true; };
  const { portero } = armar({ sb });
  await portero.manejar({ texto: 'cancel', media: null, eventoId: 'ev-1' });
  assert.deepEqual(cancelados, ['tr-6']);
});

test('ejecutarAccion gasto_obra: inserta el gasto con el presupuesto elegido', async () => {
  const sb = stubSb();
  const gastos = [];
  sb.insertGastoObra = async (g) => { gastos.push(g); return 'go-1'; };
  const { portero, enviados } = armar({ sb });
  await portero.ejecutarAccion(
    { clase: 'gasto_obra', presupuesto_id: 'p-1', gasto: { concepto: 'cemento', monto: 50000 } },
    { id: 'ev-1', contenido: { texto: 'gasté 50 lucas en cemento' } }
  );
  assert.equal(gastos[0].presupuesto_id, 'p-1');
  assert.equal(gastos[0].importe, 50000);
  assert.match(enviados[0].texto, /cemento/);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../src/portero'`.

- [ ] **Step 3: Implementar portero.js**

Crear `src/portero.js`:

```js
// portero.js — ruteo de TODOS los mensajes del owner (texto ya transcripto si
// era audio, o media si era foto/documento). El flujo viejo de proveedores
// (/prov) vive en index.js, no acá.
//
// REGLA DE ORO: cualquier error ⇒ evento archivado + aviso. Nada silencioso,
// nada perdido.
function crearPortero({ sb, advisor, preguntas, adn, enviar, ownerPhone }) {

  async function ackCola(tipo) {
    const viva = await sb.macViva().catch(() => false);
    const base =
      tipo === 'cotizar'
        ? '📋 Tomado. El Cotizador Maestro está laburando (Seia + SISMAT + precios de internet) — en unos minutos te llega. Si me falta un dato, te pregunto.'
        : tipo === 'media'
          ? '📎 Recibido. Lo proceso y te digo qué hice con eso.'
          : '🛠️ Tomado. Lo proceso en la Mac y te traigo el resultado en unos minutos.';
    return viva ? base : base + '\n\n💤 La compu está apagada, así que queda en cola — no se pierde, lo proceso apenas la prendas y te aviso.';
  }

  async function encolar({ tipo, prompt, contexto, eventoId, ack }) {
    const trabajoId = await sb.insertTrabajo({ tipo, prompt, contexto: { ...(contexto || {}), evento_id: eventoId } });
    if (!trabajoId) throw new Error('insert en trabajos_cola falló');
    await sb.marcarDestino(eventoId, 'trabajos_cola', trabajoId);
    await enviar(ownerPhone(), await ackCola(ack || tipo));
  }

  // Ejecutor de las acciones de las opciones numeradas (preguntasService).
  async function ejecutarAccion(accion, evento) {
    const texto = evento.contenido?.texto || '';
    switch (accion.clase) {
      case 'archivar':
        await sb.archivarEvento(evento.id, 'archivado por elección de Eze');
        await enviar(ownerPhone(), '🗄️ Archivado. Lo ves en el tablero cuando quieras.');
        return;

      case 'forzar_tipo': {
        const r = await advisor.ejecutarTipoForzado(accion.tipo, texto, evento.id);
        if (r.encolar) return encolar({ ...r.encolar, eventoId: evento.id });
        if (r.reply) await enviar(ownerPhone(), r.reply);
        return;
      }

      case 'gasto_obra': {
        const g = accion.gasto || {};
        const gastoId = await sb.insertGastoObra({
          presupuesto_id: accion.presupuesto_id,
          descripcion: [g.concepto || texto, g.proveedor ? `(${g.proveedor})` : ''].filter(Boolean).join(' '),
          importe: g.monto || 0,
        });
        if (!gastoId) throw new Error('insert en presupuestos_gastos falló');
        await sb.marcarDestino(evento.id, 'presupuestos_gastos', gastoId);
        await enviar(ownerPhone(), `✅ Gasto cargado: ${g.concepto || texto}${g.monto ? ` — $${Number(g.monto).toLocaleString('es-AR')}` : ''}`);
        return;
      }

      case 'foto': {
        const reply = await adn.procesarFotoForzada(evento, accion.destino);
        if (reply) await enviar(ownerPhone(), reply);
        return;
      }

      default:
        throw new Error(`acción desconocida: ${accion.clase}`);
    }
  }

  // Punto de entrada (desde index.js). texto ya viene transcripto si era audio.
  async function manejar({ texto, media, eventoId }) {
    const t = (texto || '').trim();
    try {
      // 1) ¿Está respondiendo una pregunta numerada?
      if (t && (await preguntas.resolver(t, ejecutarAccion))) return;

      // 2) Cancelar el último trabajo en cola ('cancelar' o 'cancel', como hoy)
      if (/^cancel(ar)?$/i.test(t) && !media) {
        const tr = await sb.getTrabajoCancelable();
        if (tr) {
          await sb.cancelarTrabajo(tr.id);
          await enviar(ownerPhone(), '👍 Pedido cancelado — no se procesa.');
        } else {
          await enviar(ownerPhone(), '⚠️ No hay nada en cola para cancelar (si ya se está procesando, ignorá la respuesta cuando llegue).');
        }
        return;
      }

      // 3) Fotos → ADN (visión decide); documentos → cola directa
      if (media) {
        if (media.tipo_wa === 'image') {
          const r = await adn.procesarFoto({ eventoId, media, caption: t || null });
          if (r.pregunta) return preguntas.preguntar(eventoId, r.pregunta.texto, r.pregunta.opciones);
          if (r.encolado) return enviar(ownerPhone(), await ackCola('media'));
          if (r.reply) return enviar(ownerPhone(), r.reply);
          return;
        }
        return encolar({ tipo: 'orden', prompt: t || '[archivo sin texto]', contexto: { media }, eventoId, ack: 'media' });
      }

      // 4) Atajo explícito al Cotizador Maestro (cero ambigüedad)
      if (/^(cotizame|cotiza|cotizá|cotizarme|presupuestame|presupuestá|presupuesta)\b/i.test(t)) {
        return encolar({ tipo: 'cotizar', prompt: t, eventoId });
      }

      // 5) ¿Hay un trabajo esperando un dato? Este mensaje es la respuesta.
      const esperando = await sb.getTrabajoEsperandoDatos();
      if (esperando) {
        const ok = await sb.responderTrabajo(esperando.id, t);
        await enviar(ownerPhone(), ok ? '👍 Anotado, sigo con eso...' : '⚠️ No pude registrar tu respuesta. Mandala de nuevo.');
        if (ok) await sb.marcarDestino(eventoId, 'trabajos_cola', esperando.id);
        return;
      }

      // 6) Asesor (Haiku): clasifica y ejecuta
      const r = await advisor.advise(t, eventoId);
      if (r.encolar) return encolar({ ...r.encolar, eventoId });
      if (r.pregunta) return preguntas.preguntar(eventoId, r.pregunta.texto, r.pregunta.opciones);
      await enviar(ownerPhone(), r.reply || 'Listo.');
    } catch (e) {
      console.error('[Portero] err:', e.stack || e.message);
      await sb.archivarEvento(eventoId, e.message).catch(() => {});
      await enviar(ownerPhone(), `⚠️ No pude procesar eso (${e.message}). Quedó en Archivados — lo ves en el tablero, no se perdió.`).catch(() => {});
    }
  }

  return { manejar, ejecutarAccion, ackCola };
}

module.exports = { crearPortero };
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
npm test
```

Expected: `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add src/portero.js test/portero.test.js
git commit -m "feat: portero 2.0 — ruteo del owner con preguntas, cola trabajos_cola, ADN y errores a Archivados

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 12: Cableado en `index.js` — eventos-first + cron de barrido + baja de `cotizaciones_cola`

Acá se conecta todo: el webhook registra el evento ANTES de clasificar (dedup por `wa_message_id` — de paso reemplaza el dedup en memoria que se perdía en reboots), el owner pasa por el portero, el cron de 30 min barre preguntas vencidas, y el bot deja de escribir en `cotizaciones_cola`.

**Files:**
- Modify: `src/index.js`
- Modify: `src/supabaseService.js` (borrar funciones de `cotizaciones_cola` salvo `macViva`)
- Test: `test/webhook-media-guard.test.js` (orden del ruteo: media nunca cae en comandos)

- [ ] **Step 1: Agregar el wiring de servicios en index.js**

En `src/index.js`, después del bloque de constantes (después de la línea `const BOT_START_TIME = Date.now();` y del chequeo `if (!PHONE_NUMBER_ID || !ACCESS_TOKEN)`), agregar:

```js
// ── Servicios del Bot 2.0 (Centro de Mando) ─────────────────────────────────
const sb = require('./supabaseService');
const advisor = require('./advisorService');
const { crearGithubVault } = require('./githubVault');
const { crearVision } = require('./visionService');
const { crearPreguntas } = require('./preguntasService');
const { crearAdn } = require('./adnService');
const { crearPortero } = require('./portero');
const { conReintento } = require('./reintento');

const ownerPhone = () => OWNER_PHONE;
const enviar = (to, body) => sendMessage(to, body); // sendMessage se define más abajo (hoisting de function declarations)
const vault = crearGithubVault();
const vision = crearVision();
const preguntas = crearPreguntas({ sb, enviar, ownerPhone });
const adn = crearAdn({ sb, vision, vault });
const portero = crearPortero({ sb, advisor, preguntas, adn, enviar, ownerPhone });
```

- [ ] **Step 2: Borrar los helpers viejos de cola en index.js**

Eliminar de `src/index.js` el bloque completo (entre el comentario `// ── Cola de trabajos pesados...` y la función `saludo()` exclusive):

```js
// ── Cola de trabajos pesados (los procesa la Mac de Eze con Claude Code) ────
async function ackCola(tipo, sb) { ... }

async function encolarPesado(from, texto, tipo, sb) { ... }
```

(`ackCola`/`encolar` viven ahora en `portero.js`. La función `saludo()` queda — no se toca.)

- [ ] **Step 3: Reescribir el handler POST /webhook**

Reemplazar el handler COMPLETO `app.post('/webhook', async (req, res) => { ... });` por este (el bloque de proveedores y los comandos del owner se conservan tal cual estaban, reubicados):

```js
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return;
  const value   = body.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (value?.statuses) return;
  if (!message) return;
  const esOwner = OWNER_PHONE && message.from === OWNER_PHONE;

  // ── Spec §5.1: TODO mensaje genera fila en eventos — también los tipos que
  // el bot no procesa (sticker, video, location, reaction, contacts...).
  // Quedan estado='procesado' con título descriptivo, visibles en Actividad.
  const soportado = ['text', 'image', 'audio'].includes(message.type)
    || (message.type === 'document' && esOwner);
  if (!soportado) {
    console.log(`📩 Mensaje de ${message.from} [${message.type}] — tipo no soportado, solo se registra`);
    await sb.insertEvento({
      origen: 'whatsapp',
      tipo: 'no_soportado',
      estado: 'procesado',
      titulo: `[${message.type}] de ${message.from} (tipo no soportado por el bot)`,
      contenido: { from: message.from, tipo_wa: message.type },
      waMessageId: message.id,
    });
    return;
  }

  const from = message.from;
  let text = message.type === 'text' ? message.text.body.trim() : '';
  let norm = normalize(text);
  let media = null;
  if (message.type === 'image' || message.type === 'document') {
    const m = message[message.type];
    media = { id: m.id, mime: m.mime_type || null, filename: m.filename || null, tipo_wa: message.type };
    text = (m.caption || '').trim();
    norm = normalize(text);
  }
  console.log(`📩 Mensaje de ${from} [${message.type}]: "${text}"`);

  // ── EVENTOS-FIRST: registrar SIEMPRE antes de clasificar ──────────────────
  // Dedup por wa_message_id (reemplaza el dedup en memoria, que moría en cada
  // reboot). Si el insert falla, se avisa y se procesa igual (no se bloquea).
  const evento = await sb.insertEvento({
    origen: 'whatsapp',
    tipo: esOwner ? 'mensaje_eze' : 'mensaje_entrante',
    titulo: text || `[${message.type}]`,
    contenido: { from, tipo_wa: message.type, texto: text || null, media },
    waMessageId: message.id,
  });
  if (evento.duplicado) {
    console.log(`[Eventos] webhook duplicado ignorado: ${message.id}`);
    return;
  }
  const eventoId = evento.ok ? evento.id : null;
  if (!evento.ok && esOwner) {
    await sendMessage(from, '⚠️ Ojo: no pude registrar este mensaje en la base (eventos). Lo proceso igual — revisá los logs de Railway.');
  }

  // ── Mensajes de proveedores (flujo viejo /prov — SIN CAMBIOS) ─────────────
  if (OWNER_PHONE && from !== OWNER_PHONE) {
    const prov = providers.find(p => p.phone === from);
    if (prov) {
      totalRecv++;
      lastInboundFrom[from] = Date.now();
      lastProviderResponse = { phone: from, name: prov.name, _lastQuestion: message.type === 'text' ? text : null };

      if (pendingJobMessage[from]) {
        const pending = pendingJobMessage[from];
        delete pendingJobMessage[from];
        const msgId = await sendMessage(from, pending);
        if (msgId) pendingDelete.push({ msgId, name: prov.name });
        await sendMessage(OWNER_PHONE, `📨 Mensaje de trabajo enviado a *${prov.name}* (respondió la plantilla)`);
        addLog({ dir: 'out', to: from, name: prov.name, text: pending, msgId, ok: !!msgId });
      }

      if (message.type === 'text' && jobAnswers.length > 0) {
        const normMsg = normalize(text);
        const match = jobAnswers.find(qa => {
          const normQ = normalize(qa.question);
          const words = normQ.split(/\s+/).filter(w => w.length >= 4);
          return words.some(w => normMsg.includes(w));
        });
        if (match) {
          addLog({ dir: 'in', from, name: prov.name, text, ok: true });
          await sendMessage(from, match.answer);
          await sendMessage(OWNER_PHONE,
            `🤖 *Auto-reply a ${prov.name}*\nPreguntó: _"${text}"_\nRespondí: _"${match.answer}"_`
          );
          await logToSheets({ jobId: '', proveedor: prov.name, numero: from, rubro: prov.specialties.join(', '), mensaje: match.answer, respuesta: text, estado: 'auto-reply' });
          return;
        }
      }

      if (message.type === 'image') {
        const imageId = message.image.id;
        const caption = message.image?.caption || '';
        addLog({ dir: 'in', from, name: prov.name, text: '[imagen]' + (caption ? ` "${caption}"` : ''), ok: true });
        const imgFwdId = await sendImage(OWNER_PHONE, imageId, `📸 *${prov.name}* envió una foto${caption ? `:\n_"${caption}"_` : ''}`);
        if (imgFwdId) msgIdToProvider[imgFwdId] = { phone: from, name: prov.name, lastQuestion: null };
        await logToSheets({ jobId: '', proveedor: prov.name, numero: from, rubro: prov.specialties.join(', '), mensaje: '', respuesta: '[foto]' + (caption ? ` "${caption}"` : ''), estado: 'foto recibida' });
      } else if (message.type === 'audio') {
        const audioId = message.audio.id;
        addLog({ dir: 'in', from, name: prov.name, text: '[audio]', ok: true });
        await sendAudio(OWNER_PHONE, audioId, `🎙️ *${prov.name}* envió un audio`);
        await logToSheets({ jobId: '', proveedor: prov.name, numero: from, rubro: prov.specialties.join(', '), mensaje: '', respuesta: '[audio]', estado: 'audio recibido' });
      } else {
        addLog({ dir: 'in', from, name: prov.name, text, ok: true });
        const normt = normalize(text);
        const confirmo = ['si', 'dale', 'ok', 'bueno', 'perfecto', 'disponible', 'puedo', 'voy', 'obvio', 'claro', 'copado'].some(w => normt.includes(w));
        let fwdId;
        if (confirmo) {
          fwdId = await sendMessage(OWNER_PHONE, `✅ *${prov.name}* confirmó disponibilidad!\n\n_"${text}"_`);
        } else {
          fwdId = await sendMessage(OWNER_PHONE, `📨 *${prov.name}* respondió:\n\n_"${text}"_`);
        }
        if (fwdId) msgIdToProvider[fwdId] = { phone: from, name: prov.name, lastQuestion: text };
        await logToSheets({ jobId: '', proveedor: prov.name, numero: from, rubro: prov.specialties.join(', '), mensaje: '', respuesta: text, estado: confirmo ? 'confirmó' : 'respondió' });
      }
    }
    return;
  }

  // ── GUARDIA DE MEDIA (owner): foto/documento va DIRECTO al portero ────────
  // NUNCA pasa por los comandos ni por los estados del flujo de proveedores.
  // Sin esta guardia: una foto con caption "borrar" / "lista ..." caería en un
  // comando y la foto moriría (evento procesado, sin destino, ni siquiera en
  // Archivados); y con awaitingMessage activo, el caption iría a los
  // proveedores. Replica el early-return del código viejo (index.js:465-478,
  // media ANTES de comandos). Test: test/webhook-media-guard.test.js (Step 7).
  if (media) {
    await portero.manejar({ texto: text, media, eventoId });
    return;
  }

  // ── Audio del owner → transcribir con Gemini y seguir como texto ──────────
  // (con reintento §9: un fallo transitorio de Gemini no manda el audio a
  // Archivados de una; recién tras el segundo intento fallido)
  if (message.type === 'audio' && message.audio?.id) {
    try {
      const { transcribeAudio } = require('./transcribeService');
      text = (await conReintento(() => transcribeAudio(message.audio.id), { etiqueta: 'Gemini transcripción' })).trim();
      norm = normalize(text);
      console.log(`🎙️→📝 Audio del owner transcripto: "${text}"`);
      if (eventoId) await sb.mergeContenidoEvento(eventoId, { texto: text, transcripto: true });
      await sendMessage(from, `🎙️ _Te escuché:_ "${text}"`);
    } catch (e) {
      console.error('[Transcribe] err:', e.response?.data || e.message);
      if (eventoId) await sb.archivarEvento(eventoId, 'no se pudo transcribir el audio');
      await sendMessage(from, '🎙️ No pude transcribir el audio. Quedó en Archivados — probá de nuevo o escribime.');
      return;
    }
  }

  // ── REPLY NATIVO: el owner responde directo al mensaje del proveedor ──────
  const replyToId = message.context?.id;
  if (replyToId && msgIdToProvider[replyToId]) {
    const target = msgIdToProvider[replyToId];
    await sendMessage(target.phone, text);
    await sendMessage(from, `✅ Enviado a *${target.name}*:\n_"${text}"_`);
    if (target.lastQuestion) {
      jobAnswers.push({ question: target.lastQuestion, answer: text });
      lastProviderResponse = { phone: target.phone, name: target.name, _lastQuestion: target.lastQuestion };
    }
    await logToSheets({ jobId: '', proveedor: target.name, numero: target.phone, rubro: '', mensaje: text, respuesta: '', estado: 'reply-nativo' });
    return;
  }

  // ── Comandos owner (flujo proveedores — SIN CAMBIOS) ──────────────────────
  if (norm.startsWith('probar plantilla') || norm.startsWith('test plantilla')) {
    const partes = text.trim().split(/\s+/);
    const destino = partes.length >= 3 ? partes[partes.length - 1].replace(/\D/g, '') : from;
    const esPropio = destino === from;
    await sendMessage(from, `🧪 Probando plantilla _${FIRST_MSG_TEMPLATE}_ (idioma: ${FIRST_MSG_TEMPLATE_LANG}) hacia ${esPropio ? 'tu número' : destino}...`);
    const tpl = await sendTemplate(destino, FIRST_MSG_TEMPLATE, FIRST_MSG_TEMPLATE_LANG);
    if (tpl.ok) {
      await sendMessage(from,
        `✅ API aceptó — MsgId: ${tpl.msgId}\n` +
        `Response: ${JSON.stringify(tpl.raw)}\n\n` +
        `${esPropio ? '¿Te llegó el mensaje?' : `¿Le llegó a ${destino}?`} Si no llega en 30s → Meta no entrega (plantilla en revisión o número sin WhatsApp)`
      );
    } else {
      await sendMessage(from,
        `❌ *Error de API al enviar a ${destino}*\nCódigo: ${tpl.code}\nError: ${tpl.error}\nRaw: ${JSON.stringify(tpl.raw)}`
      );
    }
    return;
  }

  if (norm.startsWith('respuesta')) {
    const msg = text.replace(/^respuesta[:\s]*/i, '').trim();
    if (!lastProviderResponse) { await sendMessage(from, '⚠️ No hay ningún proveedor activo.'); return; }
    if (!msg) { await sendMessage(from, '⚠️ Escribí el mensaje después de Respuesta. Ej: _Respuesta: 5 m2_'); return; }
    await sendMessage(lastProviderResponse.phone, msg);
    await sendMessage(from, `✅ Enviado a *${lastProviderResponse.name}*:\n_"${msg}"_`);
    if (lastProviderResponse._lastQuestion) {
      jobAnswers.push({ question: lastProviderResponse._lastQuestion, answer: msg });
    }
    return;
  }

  if (norm === 'borrar' || norm === 'eliminar') {
    if (pendingDelete.length === 0) { await sendMessage(from, '⚠️ No hay mensajes pendientes de borrar.'); return; }
    for (const { msgId } of pendingDelete) await deleteMessage(msgId);
    const nombres = pendingDelete.map(m => `• ${m.name}`).join('\n');
    const count = pendingDelete.length;
    pendingDelete = [];
    await sendMessage(from, `🗑️ *Borrados ${count} mensajes*\n\n${nombres}`);
    return;
  }

  if (norm === 'actualizar' || norm === 'actualizar contactos' || norm === 'reload') {
    await sendMessage(from, '🔄 Actualizando base de contactos...');
    const ok = await refreshProviders();
    await sendMessage(from, ok ? `✅ *Contactos actualizados*\n\n${providers.length} proveedores cargados.` : '❌ No pude actualizar. Reintentá en unos minutos.');
    return;
  }

  if (norm.startsWith('lista')) {
    const rubroQuery = text.slice(5).trim();
    if (!rubroQuery) {
      const rubros = [...new Set(providers.flatMap(p => p.specialties))].sort().join(', ');
      await sendMessage(from, `📋 *Rubros disponibles:*\n\n${rubros}\n\nEjemplo: _lista plomero_`);
      return;
    }
    const specialties = detectSpecialties(rubroQuery) || [];
    const matched = specialties.length
      ? getMatchingProviders(specialties)
      : providers.filter(p => p.specialties.some(s => normalize(s).includes(normalize(rubroQuery))));
    if (!matched.length) { await sendMessage(from, `⚠️ No encontré proveedores para: _${rubroQuery}_`); return; }
    const lista = matched.map(p => `• *${p.name}* — +${p.phone}`).join('\n');
    await sendMessage(from, `📋 *Proveedores — ${rubroQuery}* (${matched.length}):\n\n${lista}`);
    return;
  }

  // cancelar de la SELECCIÓN de proveedores (el cancelar de trabajos lo maneja el portero)
  if ((norm === 'cancelar' || norm === 'cancel') && awaitingSelection) {
    awaitingSelection = null;
    await sendMessage(from, '❌ Selección cancelada.');
    return;
  }

  if (awaitingMessage) {
    const { providers: selected, specialties } = awaitingMessage;
    awaitingMessage = null;
    await contactarProveedores(from, selected, specialties, text);
    return;
  }

  if (awaitingSelection) {
    const age = Date.now() - awaitingSelection.timestamp;
    if (age > 10 * 60 * 1000) {
      awaitingSelection = null;
    } else {
      const { providers: opts, text: jobText, specialties } = awaitingSelection;
      let selected = [];
      if (norm === 'todos' || norm === 'all') {
        selected = opts;
      } else {
        const nums = text.split(/[\s,\-]+/).map(n => parseInt(n, 10)).filter(n => !isNaN(n));
        for (const n of nums) {
          if (n >= 1 && n <= opts.length) {
            const c = opts[n - 1];
            if (!selected.find(s => s.phone === c.phone)) selected.push(c);
          }
        }
      }
      if (selected.length > 0) {
        awaitingSelection = null;
        awaitingMessage = { providers: selected, specialties };
        const nombres = selected.map(p => `• *${p.name}*`).join('\n');
        await sendMessage(from,
          `✅ Seleccionados (${selected.length}):\n${nombres}\n\n` +
          `📝 *¿Qué mensaje les mandamos?*\n` +
          `Escribí el texto exacto y lo envío.`
        );
      } else {
        const opciones = opts.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
        await sendMessage(from, `⚠️ No entendí. Respondé con números (ej: *1 3*), *todos* o *cancelar*.\n\n${opciones}`);
      }
      return;
    }
  }

  // ── /prov → flujo viejo de proveedores ────────────────────────────────────
  if (/^\/(prov|proveedor|cotizar)\b/i.test(text.trim())) {
    const pedido = text.replace(/^\/\S+\s*/, '');
    if (providers.length === 0) {
      await sendMessage(from, '⚠️ La base de contactos aún está cargando. Mandá *actualizar* e intentá de nuevo.');
      return;
    }
    const specialties = detectSpecialties(pedido);
    if (!specialties.length) {
      await sendMessage(from,
        `🤖 *Ravn Bot*\n\nNo detecté ningún rubro.\n\n` +
        `Probá: plomero, electricista, pintura, gas, cerrajero, aire acondicionado, ` +
        `flete, limpieza, jardinero, pisos, revestimientos, herrería, etc.\n\n` +
        `Ejemplo: _"/prov necesito un plomero urgente"_`
      );
      return;
    }
    const matched = getMatchingProviders(specialties);
    if (!matched.length) { await sendMessage(from, `⚠️ No encontré proveedores para: ${specialties.join(', ')}`); return; }
    awaitingSelection = { providers: matched, text: pedido, specialties, timestamp: Date.now() };
    const lista = matched.map((p, i) => `${i + 1}. *${p.name}*`).join('\n');
    await sendMessage(from,
      `🔍 Rubro: *${specialties.join(', ')}*\n\n` +
      `👷 Proveedores (${matched.length}):\n${lista}\n\n──────────────\n` +
      `Respondé con los números · *todos* · *cancelar*\n` +
      `Ej: _1 3_ para contactar solo al 1 y al 3`
    );
    return;
  }

  // ── PORTERO 2.0 (default): eventos, preguntas, ADN, cola, asesor ──────────
  await portero.manejar({ texto: text, media, eventoId });
});
```

**Cambios de comportamiento documentados:**
1. El flujo `/prov` pasa a ser una rama explícita y TODO lo demás va al portero (igual semántica, estructura directa).
2. **Detección de rubro de `/prov` — cambio menor deliberado, NO paridad exacta:** el código viejo pasaba el texto COMPLETO (con el prefijo `/prov`) a `detectSpecialties` (index.js:665) y guardaba ese texto completo en `awaitingSelection` (index.js:679). Acá se usa `pedido` (el texto SIN el prefijo). Funcionalmente equivalente — los keywords de rubro nunca matchean `/prov` — pero más limpio para el mensaje que después se les manda a los proveedores.
3. **Media nunca llega a comandos ni a estados de proveedores** (guardia de media, arriba) — preserva el orden del código viejo donde media tenía early-return antes de los comandos.
4. **Tipos no soportados ahora SÍ se registran** en `eventos` (`tipo='no_soportado'`) antes del return — el código viejo los descartaba sin rastro (spec §5.1: todo mensaje genera fila).

- [ ] **Step 4: Sumar el barrido de preguntas al cron de 30 min**

En `src/index.js`, reemplazar:

```js
setInterval(checkTareasVencidas, 30 * 60 * 1000);
```

por:

```js
async function cronTick() {
  await checkTareasVencidas();
  try {
    await preguntas.barrerVencidas();
  } catch (e) {
    console.error('[Cron] barrerVencidas err:', e.message);
  }
}
setInterval(cronTick, 30 * 60 * 1000);
```

y dentro de `app.listen(...)`, reemplazar:

```js
  setTimeout(checkTareasVencidas, 5 * 60 * 1000);
```

por:

```js
  setTimeout(cronTick, 5 * 60 * 1000);
```

También en `checkTareasVencidas`, reemplazar la línea:

```js
    const { getTareasVencidas, marcarAvisada } = require('./supabaseService');
```

por:

```js
    const { getTareasVencidas, marcarAvisada } = sb;
```

- [ ] **Step 5: Borrar las funciones de cotizaciones_cola en supabaseService**

En `src/supabaseService.js`, borrar COMPLETAS las funciones `insertCotizacion`, `getCotizacionEsperando`, `responderCotizacion`, `getCotizacionCancelable` y `cancelarCotizacion` (con sus comentarios). **`macViva` se queda** (el latido de la Mac sigue en `cotizaciones_cola` hasta que el daemon migre — actualizar el comentario de `macViva` así):

```js
// El daemon de la Mac refresca una fila "latido" en cada pasada (~45s).
// OJO: el latido sigue viviendo en cotizaciones_cola (trabajos_cola no tiene
// estado 'latido' en su check). Cuando el daemon migre el latido, actualizar.
```

Quitar del `module.exports`: `insertCotizacion`, `getCotizacionEsperando`, `getCotizacionCancelable`, `responderCotizacion`, `cancelarCotizacion`.

Verificar que nadie las usa más:

```bash
grep -rn "insertCotizacion\|getCotizacionEsperando\|responderCotizacion\|getCotizacionCancelable\|cancelarCotizacion" src/
```

Expected: **sin output**.

- [ ] **Step 6: Suite completa + chequeo de sintaxis**

```bash
npm test && node --check src/index.js && echo SINTAXIS-OK
```

Expected: `# fail 0` y `SINTAXIS-OK`.

- [ ] **Step 7: Test de la guardia de media (integración del orden del ruteo)**

La guardia vive en `index.js` (que no se puede importar sin levantar el server), así que el test lo levanta como proceso hijo con TODAS las credenciales pisadas por dummies — `dotenv` NO pisa variables ya seteadas, así que el `.env` real del repo (que SÍ tiene `ANTHROPIC_API_KEY` real) no se filtra. Las únicas conexiones salientes son intentos con tokens dummy que fallan con 401 (cero gasto de API).

Crear `test/webhook-media-guard.test.js`:

```js
// Verifica el ORDEN del ruteo en index.js: una imagen del owner cuyo caption
// matchea un comando ("borrar") tiene que llegar al PORTERO, no al comando.
// Sin la guardia de media, el comando la interceptaría y la foto moriría.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = 3997;

function esperarEnLog(getLog, regex, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const timer = setInterval(() => {
      if (regex.test(getLog())) { clearInterval(timer); resolve(); }
      else if (Date.now() - t0 > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`timeout esperando ${regex} en:\n${getLog()}`));
      }
    }, 100);
  });
}

test('guardia de media: imagen con caption "borrar" va al portero, no al comando', async (t) => {
  let log = '';
  const proc = spawn(process.execPath, ['src/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      PATH: process.env.PATH,
      PORT: String(PORT),
      WHATSAPP_PHONE_NUMBER_ID: 'x',
      WHATSAPP_ACCESS_TOKEN: 'x',
      WEBHOOK_VERIFY_TOKEN: 'testtoken',
      OWNER_PHONE: '549111',
      // dummies que PISAN el .env real (dotenv no sobreescribe lo ya seteado):
      ANTHROPIC_API_KEY: 'dummy',
      GEMINI_API_KEY: 'dummy',
      GITHUB_TOKEN: 'dummy',
      SUPABASE_URL: '',
      SUPABASE_ANON_KEY: '',
      BOT_EMAIL: '',
      BOT_PASSWORD: '',
    },
  });
  t.after(() => proc.kill());
  proc.stdout.on('data', (d) => { log += d.toString(); });
  proc.stderr.on('data', (d) => { log += d.toString(); });
  await esperarEnLog(() => log, new RegExp(`Puerto ${PORT}`));

  await fetch(`http://localhost:${PORT}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { messages: [{
        id: 'wamid.guardia1', from: '549111', type: 'image',
        image: { id: 'media-guardia-1', mime_type: 'image/jpeg', caption: 'borrar' },
      }] } }] }],
    }),
  });

  // La descarga de la media falla (token dummy) → el PORTERO captura y archiva:
  // ver '[Portero] err:' en el log prueba que el mensaje LLEGÓ al portero
  // (el comando "borrar" habría hecho return antes, sin pasar por ahí).
  await esperarEnLog(() => log, /\[Portero\] err:/);
  assert.match(log, /\[image\]: "borrar"/);
});
```

Correr:

```bash
npm test
```

Expected: `# fail 0` (el test nuevo incluido; tarda ~2-3 s por el proceso hijo).

- [ ] **Step 8: Smoke test local del webhook (entorno AISLADO — no quemar API)**

⚠️ Regla de Eze: no pegarle a APIs reales sin aviso. `index.js` hace `require('dotenv').config()` y el `.env` local TIENE la `ANTHROPIC_API_KEY` real — un POST "hola" llegaría hasta Haiku de verdad. Por eso el server se levanta con `env -i` + TODAS las variables sensibles pisadas con dummies/vacíos (`dotenv` no sobreescribe lo ya seteado). El POST "hola" recorre el camino completo hasta el asesor, que falla con 401 de Anthropic (key dummy: cero gasto, error controlado).

```bash
env -i PATH="$PATH" HOME="$HOME" \
  PORT=3999 WHATSAPP_PHONE_NUMBER_ID=x WHATSAPP_ACCESS_TOKEN=x WEBHOOK_VERIFY_TOKEN=testtoken \
  OWNER_PHONE=549111 ANTHROPIC_API_KEY=dummy GEMINI_API_KEY=dummy GITHUB_TOKEN=dummy \
  SUPABASE_URL= SUPABASE_ANON_KEY= BOT_EMAIL= BOT_PASSWORD= \
  node src/index.js &
sleep 2
curl -s "http://localhost:3999/webhook?hub.mode=subscribe&hub.verify_token=testtoken&hub.challenge=ping123"
echo ""
curl -s -X POST http://localhost:3999/webhook -H 'Content-Type: application/json' -d '{"object":"whatsapp_business_account","entry":[{"changes":[{"value":{"messages":[{"id":"wamid.test1","from":"549111","type":"text","text":{"body":"hola"}}]}}]}]}'
sleep 4
kill %1
```

Expected: la primera curl devuelve `ping123`; la segunda devuelve vacío (200) y en los logs del server se ve `📩 Mensaje de 549111 [text]: "hola"` seguido de `[Portero] err:` (401 de Anthropic con la key dummy — la key real ni se cargó) y el intento de aviso por WhatsApp fallando controlado. Lo importante: el proceso NO crashea y NINGUNA API real recibió una key válida.

- [ ] **Step 9: Commit**

```bash
git add src/index.js src/supabaseService.js test/webhook-media-guard.test.js
git commit -m "feat: cableado Bot 2.0 — eventos-first (incl. no_soportado), guardia de media, portero, cron de barrido, baja de cotizaciones_cola

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 13: Verificación final contra el spec + checklist de deploy

**Files:**
- Modify: `RAILWAY-SETUP.md` (solo si falta algo del checklist)

- [ ] **Step 1: Suite completa y sintaxis de todos los fuentes**

```bash
npm test
for f in src/*.js; do node --check "$f" || echo "FALLA: $f"; done; echo CHECK-OK
```

Expected: `# fail 0` y `CHECK-OK` sin ninguna línea `FALLA:`.

- [ ] **Step 2: Checklist de cobertura del spec (verificar a mano, marcar acá)**

- [ ] §5.1 — Todo mensaje entrante crea fila en `eventos` antes de clasificar, dedup por `wa_message_id`, INCLUIDOS los tipos no soportados (sticker/video/location/reaction/contacts → `tipo='no_soportado'`, `estado='procesado'`) → `index.js` POST /webhook (Tarea 12).
- [ ] §9 — Resiliencia: las llamadas a Haiku (clasificador), Gemini visión y Gemini transcripción llevan UN reintento con backoff 2s (`conReintento`) ANTES de que el evento se archive → Tareas 7, 8, 12.
- [ ] §5.2 — Clasificación Haiku con destinos: gasto obra → `presupuestos_gastos`, gasto personal → `gastos_personales`, tarea → `tareas`, nota → vault Inbox, filosofía → `referencias` (+Inbox), referencia estética → `referencias`+Storage → `advisorService.ejecutar` (Tarea 8) + `adnService` (Tarea 10).
- [ ] §5.2 — Duda → opciones numeradas + timeout 4h configurable → `archivado` + aviso, sin `setTimeout` (cron de 30 min) → `preguntasService` (Tarea 9) + `cronTick` (Tarea 12).
- [ ] §5.3 — Vault sin clone en /tmp → `githubVault.js` (Tarea 6), `vaultService.js` borrado (Tarea 8).
- [ ] §5.3 — Inserts rechazados nunca silenciosos → `throw` en `ejecutar`/`adnService` + catch del portero → `archivarEvento` + aviso (Tareas 8, 10, 11).
- [ ] §5.3 — Código duplicado consolidado → Tarea 1 (sobrevive `index.js`).
- [ ] §5.3 — Historial persistido en eventos → `getHistorialEventos` + `respuesta_asesor` (Tareas 3, 8).
- [ ] §7.2 — Foto → visión describe/etiqueta → Storage `referencias` → fila `referencias`; página de libro → texto → `tipo='filosofia'` con imagen adjunta → Tareas 7 y 10.
- [ ] Contrato — el bot escribe SOLO en: `eventos`, `trabajos_cola` (tipos `cotizar/redactar/consulta/orden`, origen `whatsapp`, estados del check), `referencias`, `tareas`, `gastos_personales`, `presupuestos_gastos`, y (desde la Tarea 14) `cotizaciones` (UPDATE `en_revision→aprobada/rechazada` §6.4) + `cotizador_lecciones` (INSERT `tipo='rechazo'`). Verificar con: `grep -n "\.from('" src/supabaseService.js` — las tablas que aparecen con insert/update deben ser esas + `presupuestos` (solo select) + `cotizaciones_cola` (solo select del latido en `macViva`).

- [ ] **Step 3: Verificación opcional contra Supabase real (si Frente A ya migró)**

⚠️ **El `.env` local del repo NO alcanza** (verificado): solo tiene `WHATSAPP_*`, `WEBHOOK_VERIFY_TOKEN`, `ANTHROPIC_API_KEY`, `OWNER_PHONE`, `QUOTE_TIMEOUT_MS` y `PORT`. Las credenciales de Supabase (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BOT_EMAIL`, `BOT_PASSWORD`) viven SOLO en Railway. Sin ellas, `ensureAuth()` devuelve `false` e `insertEvento` da `{ ok: false, error: 'sin auth' }` SIEMPRE — eso NO significa que el Frente A no migró.

**3a. Traer las credenciales de Railway a un archivo temporal:**

1. Abrir [railway.app](https://railway.app) → proyecto del bot → servicio `ravn-bots` → pestaña **Variables**.
2. Copiar los valores reales en un archivo local `.env.verificacion` (cada `<...>` se pega a mano desde Railway — son secretos, no van en el plan):

```bash
cd /Users/ezeotero/Documents/ravn-bots
cat > .env.verificacion <<'EOF'
SUPABASE_URL=<valor de Railway>
SUPABASE_ANON_KEY=<valor de Railway>
BOT_EMAIL=<valor de Railway>
BOT_PASSWORD=<valor de Railway>
EOF
echo ".env.verificacion" >> .gitignore
```

(El `.gitignore` actual solo ignora `.env` exacto — la línea nueva evita commitear credenciales por accidente.)

**3b. Correr la verificación con ese archivo:**

```bash
node -e "
require('dotenv').config({ path: '.env.verificacion' });
const sb = require('./src/supabaseService');
(async () => {
  const r = await sb.insertEvento({ origen: 'whatsapp', tipo: 'mensaje_eze', titulo: 'test frente C', contenido: { texto: 'test' }, waMessageId: 'wamid.test-' + Date.now() });
  console.log('insertEvento:', r);
  if (r.ok) { await sb.archivarEvento(r.id, 'test de verificación'); console.log('archivado OK'); }
})();
"
```

Expected: `insertEvento: { ok: true, id: '...' }` y `archivado OK`. Diagnóstico:
- `{ ok: false, error: 'sin auth' }` → credenciales mal copiadas (o `[Supabase] auth err:` en el log) — NO es un problema del Frente A.
- Error de tabla inexistente o RLS → el Frente A todavía no corrió las migraciones/policies: ANOTARLO y no mergear.

**3c. Borrar el archivo temporal al terminar (SIEMPRE, ande o no ande):**

```bash
rm .env.verificacion && echo CREDENCIALES-BORRADAS
```

Expected: `CREDENCIALES-BORRADAS`.

- [ ] **Step 4: Commit final de la rama (NO mergear a main todavía)**

```bash
git add -A
git commit -m "chore: verificación final Frente C — checklist spec completo" --allow-empty
git log --oneline main..HEAD
```

Expected: ~12 commits listados. El merge a `main` (= deploy a Railway) NO se hace acá: las condiciones de coordinación están en **"Dudas de frontera"** al final del plan. Hasta que se cumplan, la rama queda lista sin mergear. (Queda la Tarea 14 — aprobación por WhatsApp — antes de dar el plan por terminado.)

---

### Tarea 14: Aprobación de cotizaciones por WhatsApp (`OK` / `CORREGIR`) — spec §6.4

El spec §6.4 pide: "Por WhatsApp: resumen + «OK / corregir X»". El daemon (Frente D), al dejar una cotización `en_revision`, manda el resumen por WhatsApp terminando EXACTAMENTE con:

> *"Respondé OK \<id-corto\> para aprobar, o CORREGIR \<id-corto\>: \<qué corregir\>"*

**GRAMÁTICA DE APROBACIÓN (acordada, idéntica en los planes C y D):** `id-corto` = primeros 8 caracteres del uuid de la cotización. El bot reconoce dos respuestas del owner:

| Respuesta | Efecto |
|---|---|
| `OK <id-corto>` | `cotizaciones.estado`: `en_revision → aprobada` (UPDATE guardado con `.eq('estado','en_revision')` + verificación de fila afectada — sin éxito fantasma) |
| `CORREGIR <id-corto>: <detalle>` | `estado → rechazada` + `motivo_rechazo` + INSERT en `cotizador_lecciones` (`tipo='rechazo'`) + trabajo nuevo en `trabajos_cola` (`tipo='cotizar'`, `contexto.correccion` y `contexto.cotizacion_anterior`) |

Ambas acciones registran evento y confirman por WhatsApp. RLS: la enmienda del plan A le da al bot SELECT/UPDATE en `cotizaciones` e INSERT en `cotizador_lecciones` — si no está aplicada, los tests (mocks) pasan igual pero contra la base real el UPDATE devuelve 0 filas: frenar y avisar.

(Esta tarea va después de la verificación de la Tarea 13 porque entró por enmienda — por eso re-corre la suite completa y el checklist §6.4 al final.)

**Files:**
- Modify: `src/supabaseService.js` (funciones de `cotizaciones` + `cotizador_lecciones`)
- Modify: `src/portero.js` (reconocer `OK` / `CORREGIR` en el ruteo)
- Modify: `RAILWAY-SETUP.md` (documentar la gramática)
- Test: `test/supabase-cotizaciones.test.js`, `test/aprobacion-cotizaciones.test.js`

Contrato de referencia (tablas las crea Frente A): `cotizaciones(id uuid, creado_at, trabajo_id, titulo text not null, zona, estado check in ('borrador','en_revision','aprobada','rechazada','documento_emitido'), receta_id, ficha jsonb, desglose jsonb, total_min, total_max, revision jsonb, motivo_rechazo text, presupuesto_id)` · `cotizador_lecciones(id uuid, creado_at, tipo check in ('contraste_obra','auto_critica','rechazo'), receta_nombre, cotizacion_id, obra_presupuesto_id, leccion text not null, ajuste jsonb)`.

- [ ] **Step 1: Escribir los tests de supabaseService (fallan)**

Crear `test/supabase-cotizaciones.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const sb = require('../src/supabaseService');
const { crearFakeSupabaseClient, paso } = require('./helpers/fakes');

test('getCotizacionEnRevisionPorIdCorto matchea el prefijo del uuid (case-insensitive)', async () => {
  const { client, llamadas } = crearFakeSupabaseClient(() => ({
    data: [
      { id: 'ffff0000-1111-2222-3333-444455556666', titulo: 'Otra', estado: 'en_revision' },
      { id: 'abc12345-6789-4abc-8def-001122334455', titulo: 'Baño Pilar', estado: 'en_revision' },
    ],
    error: null,
  }));
  sb.__setTestClient(client);
  const cot = await sb.getCotizacionEnRevisionPorIdCorto('ABC12345');
  assert.equal(cot.titulo, 'Baño Pilar');
  assert.equal(llamadas[0].tabla, 'cotizaciones');
  assert.deepEqual(paso(llamadas[0], 'eq').args, ['estado', 'en_revision']);
});

test('aprobarCotizacion: UPDATE guardado con eq(estado,en_revision) y verifica la fila afectada', async () => {
  const { client, llamadas } = crearFakeSupabaseClient(() => ({ data: [{ id: 'c-1' }], error: null }));
  sb.__setTestClient(client);
  const ok = await sb.aprobarCotizacion('c-1');
  assert.equal(ok, true);
  const ctx = llamadas[0];
  assert.equal(ctx.tabla, 'cotizaciones');
  assert.deepEqual(paso(ctx, 'update').args[0], { estado: 'aprobada' });
  const eqs = ctx.pasos.filter((p) => p.m === 'eq').map((p) => p.args);
  assert.deepEqual(eqs, [['id', 'c-1'], ['estado', 'en_revision']]);
});

test('aprobarCotizacion devuelve false si el UPDATE afecta 0 filas (carrera) — sin éxito fantasma', async () => {
  const { client } = crearFakeSupabaseClient(() => ({ data: [], error: null }));
  sb.__setTestClient(client);
  assert.equal(await sb.aprobarCotizacion('c-1'), false);
});

test('rechazarCotizacion guarda estado=rechazada + motivo_rechazo con el mismo guard', async () => {
  const { client, llamadas } = crearFakeSupabaseClient(() => ({ data: [{ id: 'c-1' }], error: null }));
  sb.__setTestClient(client);
  const ok = await sb.rechazarCotizacion('c-1', 'MO baja');
  assert.equal(ok, true);
  const campos = paso(llamadas[0], 'update').args[0];
  assert.equal(campos.estado, 'rechazada');
  assert.equal(campos.motivo_rechazo, 'MO baja');
});

test('insertLeccionRechazo inserta tipo=rechazo con cotizacion_id y leccion', async () => {
  const { client, llamadas } = crearFakeSupabaseClient(() => ({ data: { id: 'lec-1' }, error: null }));
  sb.__setTestClient(client);
  const id = await sb.insertLeccionRechazo({ cotizacion_id: 'c-1', leccion: 'Rechazo de Eze: MO baja' });
  assert.equal(id, 'lec-1');
  assert.equal(llamadas[0].tabla, 'cotizador_lecciones');
  const row = paso(llamadas[0], 'insert').args[0];
  assert.equal(row.tipo, 'rechazo');
  assert.equal(row.cotizacion_id, 'c-1');
});
```

- [ ] **Step 2: Correr y verificar que fallan**

```bash
npm test
```

Expected: FAIL — `sb.getCotizacionEnRevisionPorIdCorto is not a function` (y similares).

- [ ] **Step 3: Implementar las funciones en supabaseService**

En `src/supabaseService.js`, agregar después del bloque de ADN/referencias:

```js
// ── Cotizaciones: aprobación por WhatsApp (mesa de revisión, spec §6.4) ─────
// El daemon (Frente D) deja la cotización en_revision y manda el resumen por
// WhatsApp cerrando con: "Respondé OK <id-corto> para aprobar, o
// CORREGIR <id-corto>: <qué corregir>". id-corto = primeros 8 caracteres del
// uuid. RLS: enmienda del plan A (bot SELECT/UPDATE en cotizaciones, INSERT
// en cotizador_lecciones).

// Busca entre las en_revision recientes la que empieza con el id-corto.
// (PostgREST no filtra por prefijo de uuid sin castear; con ≤20 filas en
// revisión, matchear en JS es trivial y suficiente.)
async function getCotizacionEnRevisionPorIdCorto(idCorto) {
  try {
    const ok = await ensureAuth();
    if (!ok) return null;
    const { data, error } = await client()
      .from('cotizaciones')
      .select('id, titulo, estado, total_min, total_max')
      .eq('estado', 'en_revision')
      .order('creado_at', { ascending: false })
      .limit(20);
    if (error) { console.error('[Supabase] getCotizacionEnRevisionPorIdCorto err:', error.message); return null; }
    const corto = String(idCorto || '').toLowerCase();
    if (!corto) return null;
    return (data || []).find((c) => String(c.id).toLowerCase().startsWith(corto)) || null;
  } catch (e) {
    console.error('[Supabase] getCotizacionEnRevisionPorIdCorto err:', e.message);
    return null;
  }
}

// Transición guardada contra carreras: el UPDATE exige estado=en_revision y
// verifica la fila afectada con .select() — 0 filas = otro proceso la movió
// entre el SELECT y el UPDATE → false (NUNCA éxito fantasma).
async function transicionCotizacion(id, cambio) {
  try {
    const ok = await ensureAuth();
    if (!ok) return false;
    const { data, error } = await client()
      .from('cotizaciones')
      .update(cambio)
      .eq('id', id)
      .eq('estado', 'en_revision')
      .select('id');
    if (error) { console.error('[Supabase] transicionCotizacion err:', error.message); return false; }
    return (data || []).length === 1;
  } catch (e) {
    console.error('[Supabase] transicionCotizacion err:', e.message);
    return false;
  }
}

const aprobarCotizacion = (id) => transicionCotizacion(id, { estado: 'aprobada' });
const rechazarCotizacion = (id, motivo) =>
  transicionCotizacion(id, { estado: 'rechazada', motivo_rechazo: motivo || null });

async function insertLeccionRechazo({ cotizacion_id, leccion }) {
  try {
    const ok = await ensureAuth();
    if (!ok) return null;
    const { data, error } = await client().from('cotizador_lecciones').insert({
      tipo: 'rechazo',
      cotizacion_id: cotizacion_id || null,
      receta_nombre: null, // el bot no conoce el nombre de la receta (es del daemon)
      leccion,
    }).select('id').single();
    if (error) { console.error('[Supabase] insertLeccionRechazo err:', error.message); return null; }
    return data.id;
  } catch (e) {
    console.error('[Supabase] insertLeccionRechazo err:', e.message);
    return null;
  }
}
```

y sumar al `module.exports`:

```js
  getCotizacionEnRevisionPorIdCorto,
  aprobarCotizacion,
  rechazarCotizacion,
  insertLeccionRechazo,
```

- [ ] **Step 4: Correr y verificar que pasan**

```bash
npm test
```

Expected: `# fail 0`

- [ ] **Step 5: Escribir los tests del portero (fallan)**

Crear `test/aprobacion-cotizaciones.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearPortero } = require('../src/portero');
const { crearFakeEnviar } = require('./helpers/fakes');

const COT = {
  id: 'abc12345-6789-4abc-8def-001122334455',
  titulo: 'Baño completo Pilar',
  estado: 'en_revision',
  total_min: 4200000,
  total_max: 5100000,
};

function stubSb(overrides = {}) {
  const llamadas = { aprobadas: [], rechazadas: [], lecciones: [], trabajos: [], eventos: [], destinos: [], archivados: [] };
  return {
    llamadas,
    getCotizacionEnRevisionPorIdCorto: async (idCorto) =>
      COT.id.startsWith(String(idCorto).toLowerCase()) ? { ...COT } : null,
    aprobarCotizacion: async (id) => { llamadas.aprobadas.push(id); return true; },
    rechazarCotizacion: async (id, motivo) => { llamadas.rechazadas.push({ id, motivo }); return true; },
    insertLeccionRechazo: async (l) => { llamadas.lecciones.push(l); return 'lec-1'; },
    insertTrabajo: async (t) => { llamadas.trabajos.push(t); return 'tr-1'; },
    insertEvento: async (e) => { llamadas.eventos.push(e); return { ok: true, id: 'ev-bot' }; },
    marcarDestino: async (...a) => { llamadas.destinos.push(a); return true; },
    archivarEvento: async (id, motivo) => { llamadas.archivados.push({ id, motivo }); return true; },
    getTrabajoCancelable: async () => null,
    cancelarTrabajo: async () => true,
    getTrabajoEsperandoDatos: async () => null,
    responderTrabajo: async () => true,
    insertGastoObra: async () => 'go-1',
    macViva: async () => true,
    ...overrides,
  };
}

function armar({ sb, advisor } = {}) {
  const { enviar, enviados } = crearFakeEnviar();
  const portero = crearPortero({
    sb,
    advisor: advisor || { advise: async () => ({ reply: 'Listo.' }), ejecutarTipoForzado: async () => ({ reply: 'ok' }) },
    preguntas: { resolver: async () => false, preguntar: async () => {} },
    adn: { procesarFoto: async () => ({ reply: 'ok' }), procesarFotoForzada: async () => 'ok' },
    enviar,
    ownerPhone: () => '549111',
  });
  return { portero, enviados };
}

test('OK <id-corto> aprueba la cotización en revisión, registra evento y confirma', async () => {
  const sb = stubSb();
  const { portero, enviados } = armar({ sb });
  await portero.manejar({ texto: 'OK abc12345', media: null, eventoId: 'ev-1' });
  assert.deepEqual(sb.llamadas.aprobadas, [COT.id]);
  assert.deepEqual(sb.llamadas.destinos[0], ['ev-1', 'cotizaciones', COT.id]);
  assert.equal(sb.llamadas.eventos[0].tipo, 'cotizacion_aprobada');
  assert.match(enviados[0].texto, /Aprobada/);
});

test('ok ABC12345 — mayúsculas/minúsculas dan igual', async () => {
  const sb = stubSb();
  const { portero } = armar({ sb });
  await portero.manejar({ texto: 'ok ABC12345', media: null, eventoId: 'ev-1' });
  assert.equal(sb.llamadas.aprobadas.length, 1);
});

test('CORREGIR <id-corto>: <detalle> rechaza, guarda lección y re-encola con la corrección', async () => {
  const sb = stubSb();
  const { portero, enviados } = armar({ sb });
  await portero.manejar({ texto: 'CORREGIR abc12345: la MO de plomería está baja, subila 20%', media: null, eventoId: 'ev-1' });
  assert.equal(sb.llamadas.rechazadas[0].id, COT.id);
  assert.match(sb.llamadas.rechazadas[0].motivo, /plomería/);
  assert.equal(sb.llamadas.lecciones[0].cotizacion_id, COT.id);
  assert.match(sb.llamadas.lecciones[0].leccion, /plomería/);
  const tr = sb.llamadas.trabajos[0];
  assert.equal(tr.tipo, 'cotizar');
  assert.match(tr.contexto.correccion, /plomería/);
  assert.equal(tr.contexto.cotizacion_anterior, COT.id);
  assert.equal(sb.llamadas.eventos[0].tipo, 'cotizacion_rechazada');
  assert.match(enviados[0].texto, /re-cotizar/i);
});

test('OK con id que no matchea ninguna en_revision: avisa y consume el mensaje', async () => {
  const sb = stubSb();
  let advised = false;
  const { portero, enviados } = armar({
    sb,
    advisor: { advise: async () => { advised = true; return { reply: 'x' }; }, ejecutarTipoForzado: async () => ({}) },
  });
  await portero.manejar({ texto: 'OK 99999999', media: null, eventoId: 'ev-1' });
  assert.equal(advised, false);
  assert.equal(sb.llamadas.aprobadas.length, 0);
  assert.match(enviados[0].texto, /No encontré/);
});

test('carrera: si el UPDATE no afecta filas (ya no estaba en_revision), NO hay éxito fantasma', async () => {
  const sb = stubSb({ aprobarCotizacion: async () => false });
  const { portero, enviados } = armar({ sb });
  await portero.manejar({ texto: 'OK abc12345', media: null, eventoId: 'ev-1' });
  // el throw cae en el catch del portero: archivado + aviso (nunca silencioso)
  assert.equal(sb.llamadas.archivados[0].id, 'ev-1');
  assert.match(enviados[0].texto, /Archivados/);
});

test('un "ok" suelto (sin id-corto) NO es aprobación: sigue al asesor', async () => {
  const sb = stubSb();
  let advised = false;
  const { portero } = armar({
    sb,
    advisor: { advise: async () => { advised = true; return { reply: 'dale' }; }, ejecutarTipoForzado: async () => ({}) },
  });
  await portero.manejar({ texto: 'ok', media: null, eventoId: 'ev-1' });
  assert.equal(advised, true);
  assert.equal(sb.llamadas.aprobadas.length, 0);
});
```

- [ ] **Step 6: Correr y verificar que fallan**

```bash
npm test
```

Expected: FAIL — los tests de `OK`/`CORREGIR` caen al asesor (el portero todavía no reconoce la gramática), p.ej. `aprobadas.length` da 0 donde se espera 1.

- [ ] **Step 7: Implementar la aprobación en portero.js**

En `src/portero.js` (creado en la Tarea 11), hacer TRES ediciones:

**(a)** Después del cierre de `ejecutarAccion` (el `}` que sigue a `throw new Error(\`acción desconocida: ...\`)`) y ANTES del comentario `// Punto de entrada (desde index.js)...`, insertar:

```js
  // ── Aprobación de cotizaciones por WhatsApp (mesa de revisión, spec §6.4) ──
  // GRAMÁTICA (idéntica a la que emite el daemon del Frente D al final del
  // resumen): "Respondé OK <id-corto> para aprobar, o CORREGIR <id-corto>:
  // <qué corregir>". id-corto = primeros 8 caracteres del uuid.
  const RE_APROBAR = /^ok\s+([0-9a-f]{8})\s*$/i;
  const RE_CORREGIR = /^corregir\s+([0-9a-f]{8})\s*:\s*([\s\S]+)$/i;

  // Devuelve true si consumió el mensaje. LANZA si algo falla a mitad de
  // camino (el catch de manejar() archiva el evento y avisa).
  async function manejarAprobacion(t, eventoId) {
    const mOk = t.match(RE_APROBAR);
    const mCor = t.match(RE_CORREGIR);
    if (!mOk && !mCor) return false;

    const idCorto = (mOk ? mOk[1] : mCor[1]).toLowerCase();
    const cot = await sb.getCotizacionEnRevisionPorIdCorto(idCorto);
    if (!cot) {
      await enviar(ownerPhone(), `⚠️ No encontré ninguna cotización en revisión con id *${idCorto}*. Fijate el id-corto en el resumen que te mandé, o resolvela desde el tablero.`);
      return true;
    }

    if (mOk) {
      const ok = await sb.aprobarCotizacion(cot.id);
      if (!ok) throw new Error(`la cotización ${idCorto} ya no estaba en revisión (¿la tocó otro proceso?)`);
      await sb.marcarDestino(eventoId, 'cotizaciones', cot.id);
      await sb.insertEvento({
        origen: 'bot',
        tipo: 'cotizacion_aprobada',
        titulo: `cotización aprobada por WhatsApp: ${cot.titulo}`,
        contenido: { cotizacion_id: cot.id },
      });
      await enviar(ownerPhone(), `✅ Aprobada: *${cot.titulo}*. El documento final se emite desde el tablero.`);
      return true;
    }

    const detalle = mCor[2].trim();
    const okR = await sb.rechazarCotizacion(cot.id, detalle);
    if (!okR) throw new Error(`la cotización ${idCorto} ya no estaba en revisión (¿la tocó otro proceso?)`);
    // Lección de rechazo (loop de mejora §6.5). Si falla, NO se frena el flujo:
    // el motivo ya quedó en motivo_rechazo; se avisa en la confirmación.
    const leccionId = await sb.insertLeccionRechazo({
      cotizacion_id: cot.id,
      leccion: `Rechazo de Eze en la mesa ("${cot.titulo}"): ${detalle}`,
    });
    const trabajoId = await sb.insertTrabajo({
      tipo: 'cotizar',
      prompt: `Re-cotizar "${cot.titulo}" aplicando esta corrección de Eze: ${detalle}`,
      contexto: { correccion: detalle, cotizacion_anterior: cot.id, evento_id: eventoId },
    });
    if (!trabajoId) throw new Error('insert en trabajos_cola falló (la re-cotización no se encoló)');
    await sb.marcarDestino(eventoId, 'cotizaciones', cot.id);
    await sb.insertEvento({
      origen: 'bot',
      tipo: 'cotizacion_rechazada',
      titulo: `cotización a corregir: ${cot.titulo}`,
      contenido: { cotizacion_id: cot.id, motivo: detalle, trabajo_id: trabajoId },
    });
    let msg = `🔄 Anotado. Rechacé *${cot.titulo}* con tu corrección y la mandé a re-cotizar — te llega la versión nueva a revisión.`;
    if (!leccionId) msg += '\n(ojo: no pude guardar la lección del rechazo — revisá los logs)';
    await enviar(ownerPhone(), msg);
    return true;
  }
```

**(b)** Dentro de `manejar()`, reemplazar:

```js
      // 1) ¿Está respondiendo una pregunta numerada?
      if (t && (await preguntas.resolver(t, ejecutarAccion))) return;
```

por:

```js
      // 1) ¿Está respondiendo una pregunta numerada?
      if (t && (await preguntas.resolver(t, ejecutarAccion))) return;

      // 1bis) ¿Está aprobando o corrigiendo una cotización en revisión? (§6.4)
      // Va ANTES que "trabajo esperando datos" para que un "OK abc12345" no
      // se trague como respuesta de ficha.
      if (t && !media && (await manejarAprobacion(t, eventoId))) return;
```

**(c)** Reemplazar la última línea del factory:

```js
  return { manejar, ejecutarAccion, ackCola };
```

por:

```js
  return { manejar, ejecutarAccion, ackCola, manejarAprobacion };
```

- [ ] **Step 8: Correr y verificar que pasan**

```bash
npm test && node --check src/portero.js && node --check src/supabaseService.js && echo OK
```

Expected: `# fail 0` y `OK`.

- [ ] **Step 9: Documentar la gramática en RAILWAY-SETUP.md**

Agregar al final de la sección "Migración Bot 2.0 (2026-06)" de `RAILWAY-SETUP.md`:

```markdown
- Aprobación de cotizaciones por WhatsApp (spec §6.4): el daemon manda el
  resumen de la mesa de revisión terminando con "Respondé OK <id-corto> para
  aprobar, o CORREGIR <id-corto>: <qué corregir>" (id-corto = primeros 8
  caracteres del uuid). El bot reconoce:
  - "OK <id-corto>" → cotizaciones.estado: en_revision → aprobada
  - "CORREGIR <id-corto>: <detalle>" → rechazada + motivo_rechazo + lección
    (cotizador_lecciones tipo=rechazo) + re-cotización en trabajos_cola con
    contexto.correccion y contexto.cotizacion_anterior.
  El documento final NUNCA se emite sin la aprobación explícita (gate §6.4).
```

- [ ] **Step 10: Checklist §6.4 + suite completa final**

- [ ] §6.4 — "Por WhatsApp: resumen + «OK / corregir X»" → el bot reconoce `OK <id-corto>` y `CORREGIR <id-corto>: <detalle>` (esta tarea); el resumen con la frase final lo emite el daemon (Frente D, gramática idéntica).
- [ ] §6.4 — El documento final NO se genera acá: solo la transición `en_revision → aprobada/rechazada`. Emitir es del Frente D, siempre tras `aprobada`.
- [ ] Rechazo alimenta lecciones (§6.5 loop 4): INSERT en `cotizador_lecciones` `tipo='rechazo'` con la corrección textual de Eze.

```bash
npm test
for f in src/*.js; do node --check "$f" || echo "FALLA: $f"; done; echo CHECK-OK
```

Expected: `# fail 0` y `CHECK-OK` sin líneas `FALLA:`.

- [ ] **Step 11: Commit**

```bash
git add src/supabaseService.js src/portero.js RAILWAY-SETUP.md test/supabase-cotizaciones.test.js test/aprobacion-cotizaciones.test.js
git commit -m "feat: aprobación de cotizaciones por WhatsApp — OK/CORREGIR <id-corto> (mesa de revisión §6.4)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Dudas de frontera (coordinación con los otros frentes)

- **Deploy / merge a `main`:** Railway redeploya `main` en cada push. El merge SOLO se hace cuando: (1) las migraciones del Frente A estén aplicadas (tablas `eventos`, `trabajos_cola`, `referencias`, `cotizaciones`, `cotizador_lecciones` + bucket Storage + policies), y (2) el daemon del Frente D esté leyendo `trabajos_cola`. Hasta entonces, la rama `frente-c-bot-2` queda terminada sin mergear.
- **Latido de la Mac:** `macViva()` sigue leyendo la fila `estado='latido'` de `cotizaciones_cola`. El dueño acordado de la migración del latido (a `sistema_estado`) es el **Frente E** — cuando la haga, actualiza `macViva()` sobre esta misma rama. Este plan NO toca el latido.
- **RLS de la aprobación (Tarea 14):** el bot necesita SELECT/UPDATE en `cotizaciones` e INSERT en `cotizador_lecciones` — acordado en la enmienda del plan A. Sin esas policies, los UPDATE de la Tarea 14 devuelven 0 filas contra la base real (los tests con mocks pasan igual): frenar y avisar.
- **Gramática de aprobación:** la frase final del resumen ("Respondé OK \<id-corto\> para aprobar, o CORREGIR \<id-corto\>: \<qué corregir\>") la emite el **daemon del Frente D** y debe ser EXACTAMENTE la que parsea la Tarea 14 (id-corto = primeros 8 caracteres del uuid). Si D la cambia, C se entera acá.
- **Ventana muerta de preguntas vencidas (≤30 min):** comportamiento aceptado por decisión — ver la nota en la Tarea 9.

---

## Self-review (hecho al escribir el plan)

- **Cobertura:** §5 completo (eventos-first INCLUYENDO tipos no soportados, clasificación, duda+timeout, fixes de fragilidad, historial filtrado), §7.2 completo (filosofía + estética por texto y foto), §9 (reintento con backoff en Haiku/Gemini antes de archivar), §6.4 lado bot (aprobación `OK`/`CORREGIR` por WhatsApp — Tarea 14), consolidación de código, errores nunca silenciosos, tests de clasificación y ruteo con mocks. Fuera de alcance respetado: ni migraciones (A), ni UI (B), ni motor del cotizador / emisión de documento (D), ni jobs del daemon / latido (E).
- **Consistencia de tipos:** `insertEvento → {ok, id, duplicado?}`; `insertTrabajo/insertTarea/insertGastoPersonal/insertGastoObra/insertReferencia/insertLeccionRechazo → id|null`; `aprobarCotizacion/rechazarCotizacion → bool (false = 0 filas afectadas)`; `ejecutar → {reply}|{encolar}|{pregunta}`; `opcion = {etiqueta, accion}`; `accion.clase ∈ {forzar_tipo, gasto_obra, foto, archivar}`; `conReintento(fn, {intentos, esperaMs, etiqueta})` — usados igual en Tareas 7, 8, 9, 10, 11, 12, 14.
- **Estados del contrato respetados:** eventos `procesado/pendiente_pregunta/archivado/resuelto`; trabajos_cola `pendiente/esperando_datos/cancelado` (el bot no toca `procesando/en_revision/completado/error` — son del daemon); cotizaciones: el bot SOLO hace las transiciones `en_revision → aprobada` y `en_revision → rechazada` (§6.4, guardadas contra carreras) — nunca crea ni emite.
