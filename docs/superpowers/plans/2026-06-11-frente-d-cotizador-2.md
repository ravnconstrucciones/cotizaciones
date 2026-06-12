# Frente D — Cotizador 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Motor determinístico del cotizador (la IA piensa, el código suma), mesa de revisión con gate obligatorio de Eze en la app, daemon que procesa `trabajos_cola`, loop de contraste con obras reales y skill `cotizador-maestro` actualizado a la jerarquía de fuentes del spec.

**Architecture:** Toda la aritmética vive en `src/lib/cotizador/` (TypeScript puro, testeado con Vitest, sin dependencias de red); un CLI (`scripts/cotizador/instanciar.ts`) lo expone para que Claude Code headless lo invoque desde el daemon. La app suma páginas `/cotizaciones` y `/cotizaciones/[id]/revision` + API routes sobre la tabla `cotizaciones` del contrato (Frente A). El daemon `~/.ravn-cotizador/daemon.py` se extiende para procesar `trabajos_cola` por tipo y dejar las cotizaciones SIEMPRE en `en_revision` (nunca emite solo).

**Tech Stack:** Next.js 15 (App Router, repo `/Users/ezeotero/Documents/ravn`), Supabase (REST + supabase-js), Vitest, tsx (CLI), Python 3 + `certifi` (daemon — único paquete de terceros, ya instalado en la Mac porque el daemon actual lo usa; el resto es stdlib), Claude Code headless.

**Contrato de datos:** las tablas `cotizaciones`, `recetas`, `cotizador_lecciones`, `trabajos_cola` las crea el **Frente A** (migraciones en `supabase/migrations/`, SQL canónico del contrato). Este plan las consume con esos nombres y estados EXACTOS. Si al ejecutar no existen todavía, frenar y coordinar con Frente A.

---

## Estructura de archivos

```
src/lib/cotizador/
  tipos.ts            ← shapes TS espejo de los jsonb del contrato (recetas.etapas/parametros, cotizaciones.ficha/desglose/revision)
  texto.ts            ← normalizar() compartido
  formula.ts          ← evaluador seguro de fórmulas (sin eval)
  instanciar.ts       ← receta + parámetros + precios → ItemDesglose[]
  totales.ts          ← totales min/max, imprevistos, factor zona
  vencimiento.ts      ← precios vencidos (15d mat / 30d MO)
  checklist.ts        ← checklist anti-olvidos (global + receta)
  sanidad.ts          ← sanidad física: rangos + banda $/m² por rubro
  cotizar.ts          ← orquestador puro: EntradaCotizacion → CotizacionCalculada
  estado.ts           ← transiciones aprobar/rechazar/emitir (gate §6.4)
  contraste.ts        ← desglose vs gastos reales → lección + ajuste
  contraste-obra.ts   ← helper server-side (Supabase) usado al cerrar obra
  __tests__/*.test.ts ← tests Vitest de cada módulo
scripts/cotizador/instanciar.ts  ← CLI determinístico para Claude headless
src/app/api/dolar/route.ts       ← la ruta del dólar (movida desde /api/cotizaciones)
src/app/api/cotizaciones/route.ts            ← GET lista / POST crear borrador
src/app/api/cotizaciones/[id]/route.ts       ← GET detalle (receta + presupuesto joineados) / PATCH vínculo obra
src/app/api/cotizaciones/[id]/aprobar/route.ts
src/app/api/cotizaciones/[id]/rechazar/route.ts
src/app/api/cotizaciones/[id]/emitir/route.ts
src/app/cotizaciones/page.tsx + cotizaciones-screen.tsx        ← lista + estados
src/app/cotizaciones/[id]/revision/page.tsx + revision-screen.tsx  ← mesa de revisión
src/app/cotizaciones/[id]/documento/page.tsx ← documento oficial print-ready
(sin migraciones nuevas: el usuario auth dedicado del daemon pasa las policies del plan A — Task 17)
/Users/ezeotero/.ravn-cotizador/daemon.py    ← extensión trabajos_cola (FUERA del repo git)
/Users/ezeotero/.claude/skills/cotizador-maestro/SKILL.md  ← reescritura (FUERA del repo git)
```

**Convenciones fijas de este plan:**
- Imports dentro de `src/lib/cotizador/` y en tests: **relativos** (no dependen del alias `@`).
- Dinero: redondeo a 2 decimales con `roundArs2` de `src/lib/format-currency.ts` (ya existe); totales finales a entero.
- Fechas de precios: string `YYYY-MM-DD`.
- `daemon.py` y `SKILL.md` viven fuera del repo: esos tasks NO commitean — hacen backup `.bak` y verificación manual.
- **Decisión de testing (explícita):** TDD completo en la lógica pura (`src/lib/cotizador/*` — 10 archivos de test Vitest). Las API routes, `contraste-obra.ts` y las pantallas (Tasks 12–16) NO llevan tests automatizados en este frente: testearlas exigiría un harness de integración (mock de Supabase/SSR) que el repo no tiene; se verifican con `npx tsc --noEmit`, `npm run build` y el E2E del Task 20. Si más adelante se suma un harness, esas rutas son las primeras candidatas.
- **Steps auto-contenidos:** cada step de bash re-deriva sus variables (credenciales, tokens, IDs) al inicio del bloque — en ejecución subagente cada step corre en una shell nueva y NO hereda variables del step anterior.

---

### Task 1: Liberar la ruta `/api/cotizaciones` (mover el dólar a `/api/dolar`)

Hoy `/api/cotizaciones` devuelve cotizaciones del DÓLAR (DolarAPI/Bluelytics/CriptoYa). El contrato necesita esa ruta para las cotizaciones de obra. Se mueve el archivo sin tocar su lógica y se actualizan los 2 consumidores.

**Files:**
- Create: `src/app/api/dolar/route.ts` (mover el contenido actual de `src/app/api/cotizaciones/route.ts`)
- Delete: `src/app/api/cotizaciones/route.ts` (se recrea en Task 13 Step 5 con la API de cotizaciones)
- Modify: `src/app/obras/[id]/gastos/gastos-screen.tsx:335`
- Modify: `src/app/rentabilidad/rentabilidad-screen.tsx:138`

- [ ] **Step 1: Mover la ruta**

```bash
cd /Users/ezeotero/Documents/ravn
mkdir -p src/app/api/dolar
git mv src/app/api/cotizaciones/route.ts src/app/api/dolar/route.ts
```

- [ ] **Step 2: Actualizar los consumidores**

En `src/app/obras/[id]/gastos/gastos-screen.tsx` línea 335, reemplazar:

```ts
      const url = base ? `${base}/api/cotizaciones` : "/api/cotizaciones";
```

por:

```ts
      const url = base ? `${base}/api/dolar` : "/api/dolar";
```

En `src/app/rentabilidad/rentabilidad-screen.tsx` línea 138, hacer el mismo reemplazo (texto idéntico).

- [ ] **Step 3: Verificar que no quedó ningún consumidor viejo**

Run: `grep -rn "api/cotizaciones" src --include='*.ts' --include='*.tsx' | grep -v 'app/api/cotizaciones'`
Expected: sin resultados (exit 1 de grep).

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores (mismo estado que antes del cambio).

- [ ] **Step 5: Commit**

```bash
git add -A src/app/api/dolar src/app/api/cotizaciones src/app/obras src/app/rentabilidad
git commit -m "refactor: mover cotización del dólar a /api/dolar (libera /api/cotizaciones para el cotizador)"
```

---

### Task 2: Bootstrap Vitest (si falta) + tipos del cotizador

El Frente A trae "Vitest base"; este paso es **idempotente**: si ya está configurado, se saltean los sub-pasos de instalación. Después se crean los tipos TS espejo del contrato.

**Files:**
- Create (si no existen): `vitest.config.ts`, devDependency `vitest`
- Create: `src/lib/cotizador/tipos.ts`
- Create: `src/lib/cotizador/texto.ts`
- Test: `src/lib/cotizador/__tests__/texto.test.ts`

- [ ] **Step 1: Verificar/instalar Vitest**

Run: `cd /Users/ezeotero/Documents/ravn && npx vitest --version`
Si imprime versión → seguir al Step 3. Si falla:

```bash
npm i -D vitest
```

- [ ] **Step 2: Crear `vitest.config.ts` SOLO si no existe** (si Frente A ya lo creó, no tocarlo)

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 3: Escribir el test que falla (texto.ts)**

Crear `src/lib/cotizador/__tests__/texto.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizar } from "../texto";

describe("normalizar", () => {
  it("baja a minúsculas y saca acentos", () => {
    expect(normalizar("Látex Interior ALBA")).toBe("latex interior alba");
    expect(normalizar("Albañilería")).toBe("albanileria");
  });
  it("colapsa espacios", () => {
    expect(normalizar("  flete   y  descarga ")).toBe("flete y descarga");
  });
});
```

- [ ] **Step 4: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/cotizador/__tests__/texto.test.ts`
Expected: FAIL — "Cannot find module '../texto'" (o equivalente).

- [ ] **Step 5: Implementar `src/lib/cotizador/texto.ts`**

```ts
/** Normaliza texto para matching: minúsculas, sin acentos, espacios colapsados. */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
```

- [ ] **Step 6: Correr el test y verificar que pasa**

Run: `npx vitest run src/lib/cotizador/__tests__/texto.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Crear `src/lib/cotizador/tipos.ts`** (solo tipos, sin lógica — el chequeo es `tsc`)

```ts
/**
 * Tipos del Cotizador 2.0 — espejo EXACTO de los jsonb del contrato de datos
 * (tablas `recetas` y `cotizaciones`, migraciones del Frente A).
 * Regla madre (spec §6.2.1): la IA elige receta y precios; este código hace
 * TODA la aritmética. La IA NUNCA suma.
 */

export type Unidad =
  | "m2"
  | "ml"
  | "u"
  | "kg"
  | "l"
  | "bolsa"
  | "caja"
  | "m3"
  | "rollo"
  | "dia"
  | "global";

export type TipoItem = "material" | "mano_de_obra";

/** recetas.parametros — qué datos pide la receta para instanciarse. */
export type ParametroReceta = {
  nombre: string; // identificador usable en fórmulas: "superficie_m2"
  etiqueta: string; // "Superficie a pintar (m²)"
  tipo: "numero" | "texto" | "opcion";
  requerido: boolean;
  opciones?: string[]; // solo tipo "opcion"
};

/** Rango físico admisible de cantidad relativa a un parámetro (sanidad física §6.2.7). */
export type RangoFisico = {
  parametro: string; // ej. "superficie_m2"
  min: number; // cantidad mínima admisible por unidad del parámetro
  max: number; // cantidad máxima admisible por unidad del parámetro
};

/** Ítem de una etapa de la receta. La fórmula se evalúa con los parámetros numéricos. */
export type ItemReceta = {
  nombre: string; // "Látex interior 20L"
  tipo: TipoItem;
  unidad: Unidad;
  formula: string; // "ceil(superficie_m2 / 10)" — ver formula.ts
  desperdicio_pct?: number; // 0–100; default 0
  redondeo?: "arriba" | "ninguno"; // default: "arriba" material, "ninguno" MO
  rango_fisico?: RangoFisico;
  notas?: string;
};

export type EtapaReceta = {
  nombre: string; // "Preparación de superficie"
  orden: number;
  items: ItemReceta[];
  dias_min?: number;
  dias_max?: number;
  cuadrilla?: number; // personas
};

export type FuenteReceta = {
  titulo: string; // "Ficha técnica Weber Superflex"
  tipo: "fabricante" | "seia" | "internet" | "tarifario" | "obra";
  url?: string;
  fecha: string; // YYYY-MM-DD
};

/** Fila completa de `recetas` (espejo de la tabla del contrato). */
export type Receta = {
  id?: string;
  nombre: string; // slug único: "pintura-interior"
  titulo: string; // "Pintura interior completa"
  estado: "investigada" | "confiable";
  parametros: ParametroReceta[];
  etapas: EtapaReceta[];
  checklist: string[]; // anti-olvidos propios del tipo de laburo
  fuentes: FuenteReceta[];
  version: number;
};

/** Todo precio del desglose lleva valor + fuente + fecha (vencimiento §6.2.4). */
export type PrecioFechado = {
  valor: number;
  fuente: string; // "SISMAT", "easy.com.ar", "ficha Weber", url, etc.
  fecha: string; // YYYY-MM-DD — cuándo se obtuvo
};

/** Doble precio por ítem: SISMAT referencia + internet vivo (el que exista). */
export type PrecioItem = {
  sismat?: PrecioFechado;
  internet?: PrecioFechado;
};

export type ItemDesglose = {
  nombre: string;
  etapa: string;
  tipo: TipoItem;
  unidad: Unidad;
  formula: string;
  cantidad_base: number; // resultado crudo de la fórmula
  desperdicio_pct: number;
  cantidad: number; // con desperdicio y redondeo aplicados
  precios: PrecioItem;
  precio_min: number | null; // min entre fuentes disponibles (null = sin precio)
  precio_max: number | null;
  subtotal_min: number;
  subtotal_max: number;
  divergencia_pct: number | null; // |a-b|/menor*100 si hay ambos precios
  sin_precio: boolean;
  rango_fisico?: RangoFisico;
  notas?: string;
};

/** Extra fuera de receta (flete, volquete, …): monto directo con fuente fechada. */
export type ExtraDesglose = {
  nombre: string;
  monto_min: number;
  monto_max: number;
  fuente: string;
  fecha: string; // YYYY-MM-DD
};

export type TotalesDesglose = {
  materiales_min: number;
  materiales_max: number;
  mano_de_obra_min: number;
  mano_de_obra_max: number;
  extras_min: number;
  extras_max: number;
  subtotal_min: number;
  subtotal_max: number; // antes de imprevistos y zona
  imprevistos_pct: number;
  factor_zona_min: number; // 1 si no aplica
  factor_zona_max: number;
  total_min: number; // enteros, redondeados
  total_max: number;
};

/** cotizaciones.desglose — lo que la mesa de revisión muestra ítem por ítem. */
export type Desglose = {
  receta_nombre: string;
  receta_version: number;
  parametros: Record<string, number | string>;
  items: ItemDesglose[];
  extras: ExtraDesglose[];
  totales: TotalesDesglose;
  tiempo: { dias_min: number; dias_max: number; cuadrilla_max: number };
  generado_at: string; // ISO
};

export type ResultadoChecklist = {
  item: string;
  estado: "cubierto" | "faltante" | "no_aplica";
  detalle: string;
};

export type ResultadoSanidad = {
  chequeo: string;
  estado: "ok" | "fuera_de_rango" | "sin_datos";
  detalle: string;
};

export type AvisoVencido = {
  item: string;
  fuente: string;
  fecha: string;
  dias: number; // antigüedad del precio
  limite: number; // 15 (material) o 30 (MO)
};

export type Divergencia = {
  item: string;
  sismat: number;
  internet: number;
  divergencia_pct: number;
};

/** Datos del documento final (los carga Eze al emitir desde la mesa). */
export type DatosDocumento = {
  cliente: string;
  lugar: string;
  forma_pago: string[];
  plazo: string[];
  notas: string[];
};

/** cotizaciones.revision — resultado del revisor para la mesa (§6.4). */
export type Revision = {
  checklist: ResultadoChecklist[];
  sanidad: ResultadoSanidad[];
  precios_vencidos: AvisoVencido[];
  divergencias: Divergencia[]; // solo >25%
  dudas: string[]; // preguntas abiertas de la IA para Eze
  aprobacion?: { fecha: string; importe_final?: number };
  documento?: DatosDocumento;
};

/** cotizaciones.ficha — los datos que mueven el precio (§6.2.6). */
export type Ficha = {
  trabajo: string;
  zona?: string;
  estado_actual?: string;
  calidad?: string;
  acceso?: string;
  parametros: Record<string, number | string>; // valores de receta.parametros
};

/** Estados de cotizaciones (contrato). */
export type EstadoCotizacion =
  | "borrador"
  | "en_revision"
  | "aprobada"
  | "rechazada"
  | "documento_emitido";

/** Fila de la tabla cotizaciones tal como la consume la app. */
export type CotizacionRow = {
  id: string;
  creado_at: string;
  trabajo_id: string | null;
  titulo: string;
  zona: string | null;
  estado: EstadoCotizacion;
  receta_id: string | null;
  ficha: Ficha;
  desglose: Desglose | Record<string, never>;
  total_min: number | null;
  total_max: number | null;
  revision: Revision | null;
  motivo_rechazo: string | null;
  presupuesto_id: string | null;
};
```

- [ ] **Step 8: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 9: Commit**

```bash
git add vitest.config.ts package.json package-lock.json src/lib/cotizador
git commit -m "feat(cotizador): tipos espejo del contrato + normalizar() con tests (base Frente D)"
```

---

### Task 3: Evaluador seguro de fórmulas (`formula.ts`)

Las cantidades de cada ítem salen de una fórmula declarada en la receta (`"superficie_m2 * 1.05"`, `"ceil(superficie_m2 / 10)"`). Se evalúa con un parser propio — **prohibido `eval`/`Function`** (la fórmula viene de un jsonb que escribió la IA).

**Files:**
- Create: `src/lib/cotizador/formula.ts`
- Test: `src/lib/cotizador/__tests__/formula.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/cotizador/__tests__/formula.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { evaluarFormula, FormulaError } from "../formula";

describe("evaluarFormula", () => {
  it("opera con precedencia y paréntesis", () => {
    expect(evaluarFormula("2 + 3 * 4", {})).toBe(14);
    expect(evaluarFormula("(2 + 3) * 4", {})).toBe(20);
    expect(evaluarFormula("10 / 4", {})).toBe(2.5);
    expect(evaluarFormula("-3 + 5", {})).toBe(2);
  });

  it("resuelve variables (parámetros de la receta)", () => {
    expect(evaluarFormula("superficie_m2 * 1.05", { superficie_m2: 80 })).toBeCloseTo(84);
    expect(evaluarFormula("ml_zocalo + 2", { ml_zocalo: 10 })).toBe(12);
  });

  it("soporta funciones ceil, floor, redondear, max, min", () => {
    expect(evaluarFormula("ceil(superficie_m2 / 10)", { superficie_m2: 81 })).toBe(9);
    expect(evaluarFormula("floor(7.9)", {})).toBe(7);
    expect(evaluarFormula("redondear(7.5)", {})).toBe(8);
    expect(evaluarFormula("max(2, superficie_m2 / 100)", { superficie_m2: 80 })).toBe(2);
    expect(evaluarFormula("min(5, 3)", {})).toBe(3);
  });

  it("tira FormulaError ante variable desconocida", () => {
    expect(() => evaluarFormula("superficie_m2 * 2", {})).toThrow(FormulaError);
    expect(() => evaluarFormula("superficie_m2 * 2", {})).toThrow(/superficie_m2/);
  });

  it("tira FormulaError ante sintaxis inválida o división por cero", () => {
    expect(() => evaluarFormula("2 +", {})).toThrow(FormulaError);
    expect(() => evaluarFormula("2 ** 3", {})).toThrow(FormulaError);
    expect(() => evaluarFormula("rm(-rf)", {})).toThrow(FormulaError);
    expect(() => evaluarFormula("1 / 0", {})).toThrow(FormulaError);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/cotizador/__tests__/formula.test.ts`
Expected: FAIL — "Cannot find module '../formula'".

- [ ] **Step 3: Implementar `src/lib/cotizador/formula.ts`** (parser recursivo descendente, completo)

```ts
/**
 * Evaluador seguro de fórmulas de receta. Soporta: números, + - * / ( ),
 * menos unario, identificadores (parámetros) y funciones ceil/floor/redondear/max/min.
 * SIN eval: tokenizador + parser recursivo descendente.
 */

export class FormulaError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "FormulaError";
  }
}

type Token =
  | { tipo: "num"; valor: number }
  | { tipo: "id"; nombre: string }
  | { tipo: "op"; op: "+" | "-" | "*" | "/" | "(" | ")" | "," };

const FUNCIONES: Record<string, (...args: number[]) => number> = {
  ceil: (x) => Math.ceil(x),
  floor: (x) => Math.floor(x),
  redondear: (x) => Math.round(x),
  max: (...xs) => Math.max(...xs),
  min: (...xs) => Math.min(...xs),
};

const RE_NUM = /^\d+(\.\d+)?/;
const RE_ID = /^[a-z_][a-z0-9_]*/i;

function tokenizar(src: string): Token[] {
  const tokens: Token[] = [];
  let resto = src;
  while (resto.length > 0) {
    const ws = resto.match(/^\s+/);
    if (ws) {
      resto = resto.slice(ws[0].length);
      continue;
    }
    const ch = resto[0];
    if ("+-*/(),".includes(ch)) {
      tokens.push({ tipo: "op", op: ch as "+" | "-" | "*" | "/" | "(" | ")" | "," });
      resto = resto.slice(1);
      continue;
    }
    const num = resto.match(RE_NUM);
    if (num) {
      tokens.push({ tipo: "num", valor: Number(num[0]) });
      resto = resto.slice(num[0].length);
      continue;
    }
    const id = resto.match(RE_ID);
    if (id) {
      tokens.push({ tipo: "id", nombre: id[0] });
      resto = resto.slice(id[0].length);
      continue;
    }
    throw new FormulaError(`Carácter inválido en fórmula: "${ch}"`);
  }
  return tokens;
}

export function evaluarFormula(
  formula: string,
  vars: Record<string, number>
): number {
  const tokens = tokenizar(formula);
  let pos = 0;

  const mirar = (): Token | undefined => tokens[pos];
  const consumir = (): Token => {
    const t = tokens[pos];
    if (!t) throw new FormulaError(`Fórmula incompleta: "${formula}"`);
    pos += 1;
    return t;
  };
  const esperarOp = (op: string): void => {
    const t = consumir();
    if (t.tipo !== "op" || t.op !== op) {
      throw new FormulaError(`Se esperaba "${op}" en fórmula: "${formula}"`);
    }
  };

  function expr(): number {
    let v = term();
    let t = mirar();
    while (t && t.tipo === "op" && (t.op === "+" || t.op === "-")) {
      consumir();
      const rhs = term();
      v = t.op === "+" ? v + rhs : v - rhs;
      t = mirar();
    }
    return v;
  }

  function term(): number {
    let v = factor();
    let t = mirar();
    while (t && t.tipo === "op" && (t.op === "*" || t.op === "/")) {
      consumir();
      const rhs = factor();
      if (t.op === "/") {
        if (rhs === 0) throw new FormulaError(`División por cero en: "${formula}"`);
        v = v / rhs;
      } else {
        v = v * rhs;
      }
      t = mirar();
    }
    return v;
  }

  function factor(): number {
    const t = consumir();
    if (t.tipo === "num") return t.valor;
    if (t.tipo === "op" && t.op === "-") return -factor();
    if (t.tipo === "op" && t.op === "(") {
      const v = expr();
      esperarOp(")");
      return v;
    }
    if (t.tipo === "id") {
      const sig = mirar();
      if (sig && sig.tipo === "op" && sig.op === "(") {
        const fn = FUNCIONES[t.nombre];
        if (!fn) throw new FormulaError(`Función desconocida: "${t.nombre}"`);
        esperarOp("(");
        const args: number[] = [expr()];
        let cont = mirar();
        while (cont && cont.tipo === "op" && cont.op === ",") {
          consumir();
          args.push(expr());
          cont = mirar();
        }
        esperarOp(")");
        return fn(...args);
      }
      const valor = vars[t.nombre];
      if (typeof valor !== "number" || !Number.isFinite(valor)) {
        throw new FormulaError(
          `Parámetro faltante o no numérico en fórmula: "${t.nombre}"`
        );
      }
      return valor;
    }
    throw new FormulaError(`Token inesperado en fórmula: "${formula}"`);
  }

  const resultado = expr();
  if (pos !== tokens.length) {
    throw new FormulaError(`Sintaxis inválida en fórmula: "${formula}"`);
  }
  if (!Number.isFinite(resultado)) {
    throw new FormulaError(`Resultado no finito en fórmula: "${formula}"`);
  }
  return resultado;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/lib/cotizador/__tests__/formula.test.ts`
Expected: PASS (5 tests). Nota: `"2 ** 3"` falla porque el segundo `*` arranca un factor que no existe → FormulaError; `"rm(-rf)"` falla por función desconocida.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cotizador/formula.ts src/lib/cotizador/__tests__/formula.test.ts
git commit -m "feat(cotizador): evaluador seguro de fórmulas de receta (sin eval)"
```

---

### Task 4: Instanciador de recetas (`instanciar.ts`)

Receta + parámetros + precios fechados → ítems del desglose con cantidad (fórmula + desperdicio + redondeo), doble precio min/max y divergencia.

**Files:**
- Create: `src/lib/cotizador/instanciar.ts`
- Test: `src/lib/cotizador/__tests__/instanciar.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/cotizador/__tests__/instanciar.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { instanciarItems, parametrosNumericos, validarParametros } from "../instanciar";
import type { Receta, PrecioItem } from "../tipos";

const RECETA: Receta = {
  nombre: "pintura-interior",
  titulo: "Pintura interior completa",
  estado: "confiable",
  version: 1,
  parametros: [
    { nombre: "superficie_m2", etiqueta: "Superficie (m²)", tipo: "numero", requerido: true },
    { nombre: "calidad", etiqueta: "Calidad", tipo: "opcion", requerido: false, opciones: ["estandar", "premium"] },
  ],
  checklist: ["enduido en paredes con imperfecciones"],
  fuentes: [{ titulo: "Seia — pintura interior", tipo: "seia", fecha: "2026-06-01" }],
  etapas: [
    {
      nombre: "Pintura",
      orden: 1,
      dias_min: 3,
      dias_max: 5,
      cuadrilla: 2,
      items: [
        {
          nombre: "Latex interior 20L",
          tipo: "material",
          unidad: "u",
          formula: "ceil(superficie_m2 * 2 / 80)",
          desperdicio_pct: 10,
        },
        {
          nombre: "Pintor por m2",
          tipo: "mano_de_obra",
          unidad: "m2",
          formula: "superficie_m2",
        },
      ],
    },
  ],
};

const PRECIOS: Record<string, PrecioItem> = {
  "Latex interior 20L": {
    sismat: { valor: 90000, fuente: "SISMAT", fecha: "2026-06-08" },
    internet: { valor: 120000, fuente: "easy.com.ar", fecha: "2026-06-11" },
  },
  "Pintor por m2": {
    sismat: { valor: 5500, fuente: "SISMAT", fecha: "2026-06-08" },
  },
};

describe("parametrosNumericos", () => {
  it("filtra solo los numéricos", () => {
    expect(parametrosNumericos({ superficie_m2: 80, calidad: "premium" })).toEqual({
      superficie_m2: 80,
    });
  });
});

describe("validarParametros", () => {
  it("reclama los requeridos que faltan", () => {
    expect(validarParametros(RECETA, {})).toEqual(["superficie_m2"]);
    expect(validarParametros(RECETA, { superficie_m2: 80 })).toEqual([]);
  });
});

describe("instanciarItems", () => {
  const items = instanciarItems(RECETA, { superficie_m2: 80 }, PRECIOS);

  it("calcula cantidad con desperdicio y redondeo arriba para material", () => {
    const latex = items.find((i) => i.nombre === "Latex interior 20L")!;
    // ceil(80*2/80)=2 → +10% desperdicio = 2.2 → redondeo arriba = 3
    expect(latex.cantidad_base).toBe(2);
    expect(latex.cantidad).toBe(3);
    expect(latex.subtotal_min).toBe(270000); // 3 × 90.000
    expect(latex.subtotal_max).toBe(360000); // 3 × 120.000
    expect(latex.divergencia_pct).toBeCloseTo(33.3, 1); // (120000-90000)/90000
  });

  it("MO sin redondeo arriba y con un solo precio", () => {
    const mo = items.find((i) => i.nombre === "Pintor por m2")!;
    expect(mo.cantidad).toBe(80);
    expect(mo.precio_min).toBe(5500);
    expect(mo.precio_max).toBe(5500);
    expect(mo.subtotal_min).toBe(440000);
    expect(mo.divergencia_pct).toBeNull();
  });

  it("ítem sin precio queda marcado, no rompe", () => {
    const sinPrecio = instanciarItems(RECETA, { superficie_m2: 80 }, {});
    const latex = sinPrecio.find((i) => i.nombre === "Latex interior 20L")!;
    expect(latex.sin_precio).toBe(true);
    expect(latex.precio_min).toBeNull();
    expect(latex.subtotal_min).toBe(0);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/cotizador/__tests__/instanciar.test.ts`
Expected: FAIL — "Cannot find module '../instanciar'".

- [ ] **Step 3: Implementar `src/lib/cotizador/instanciar.ts`**

```ts
import { roundArs2 } from "../format-currency";
import { evaluarFormula } from "./formula";
import type { ItemDesglose, PrecioItem, Receta } from "./tipos";

/** Solo los parámetros numéricos (los de texto/opción no entran a fórmulas). */
export function parametrosNumericos(
  parametros: Record<string, number | string>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(parametros)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** Nombres de parámetros requeridos por la receta que faltan en la ficha. */
export function validarParametros(
  receta: Receta,
  parametros: Record<string, number | string>
): string[] {
  return receta.parametros
    .filter((p) => p.requerido && !(p.nombre in parametros))
    .map((p) => p.nombre);
}

function redondearCantidad(
  valor: number,
  redondeo: "arriba" | "ninguno"
): number {
  if (redondeo === "arriba") return Math.ceil(valor - 1e-9);
  return Math.round(valor * 100) / 100;
}

/** Receta + parámetros + precios → ítems del desglose. TODA la aritmética acá. */
export function instanciarItems(
  receta: Receta,
  parametros: Record<string, number | string>,
  precios: Record<string, PrecioItem>
): ItemDesglose[] {
  const vars = parametrosNumericos(parametros);
  const items: ItemDesglose[] = [];
  const etapas = [...receta.etapas].sort((a, b) => a.orden - b.orden);

  for (const etapa of etapas) {
    for (const item of etapa.items) {
      const cantidadBase = evaluarFormula(item.formula, vars);
      const desperdicio = item.desperdicio_pct ?? 0;
      const redondeo =
        item.redondeo ?? (item.tipo === "material" ? "arriba" : "ninguno");
      const cantidad = redondearCantidad(
        cantidadBase * (1 + desperdicio / 100),
        redondeo
      );

      const precioItem = precios[item.nombre] ?? {};
      const valores = [precioItem.sismat?.valor, precioItem.internet?.valor].filter(
        (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0
      );
      const sinPrecio = valores.length === 0;
      const precioMin = sinPrecio ? null : Math.min(...valores);
      const precioMax = sinPrecio ? null : Math.max(...valores);

      let divergencia: number | null = null;
      if (precioItem.sismat && precioItem.internet && precioMin && precioMin > 0) {
        divergencia =
          Math.round(
            (Math.abs(precioItem.internet.valor - precioItem.sismat.valor) /
              precioMin) *
              1000
          ) / 10;
      }

      items.push({
        nombre: item.nombre,
        etapa: etapa.nombre,
        tipo: item.tipo,
        unidad: item.unidad,
        formula: item.formula,
        cantidad_base: roundArs2(cantidadBase),
        desperdicio_pct: desperdicio,
        cantidad,
        precios: precioItem,
        precio_min: precioMin,
        precio_max: precioMax,
        subtotal_min: precioMin == null ? 0 : roundArs2(cantidad * precioMin),
        subtotal_max: precioMax == null ? 0 : roundArs2(cantidad * precioMax),
        divergencia_pct: divergencia,
        sin_precio: sinPrecio,
        rango_fisico: item.rango_fisico,
        notas: item.notas,
      });
    }
  }
  return items;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/lib/cotizador/__tests__/instanciar.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cotizador/instanciar.ts src/lib/cotizador/__tests__/instanciar.test.ts
git commit -m "feat(cotizador): instanciador de recetas con desperdicio, redondeo y doble precio"
```

---

### Task 5: Totales, imprevistos y factor zona (`totales.ts`)

Suma por tipo, extras, imprevistos % y factor zona (countries/barrios privados +15–20%, spec §6.2.3). También el tiempo total desde las etapas.

**Files:**
- Create: `src/lib/cotizador/totales.ts`
- Test: `src/lib/cotizador/__tests__/totales.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/cotizador/__tests__/totales.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { calcularTotales, calcularTiempo, esZonaPremium, FACTOR_ZONA_PREMIUM } from "../totales";
import type { ExtraDesglose, ItemDesglose, Receta } from "../tipos";

function item(parcial: Partial<ItemDesglose>): ItemDesglose {
  return {
    nombre: "x",
    etapa: "e",
    tipo: "material",
    unidad: "u",
    formula: "1",
    cantidad_base: 1,
    desperdicio_pct: 0,
    cantidad: 1,
    precios: {},
    precio_min: 100,
    precio_max: 100,
    subtotal_min: 100,
    subtotal_max: 100,
    divergencia_pct: null,
    sin_precio: false,
    ...parcial,
  };
}

const ITEMS: ItemDesglose[] = [
  item({ tipo: "material", subtotal_min: 100000, subtotal_max: 120000 }),
  item({ tipo: "mano_de_obra", subtotal_min: 400000, subtotal_max: 400000 }),
];
const EXTRAS: ExtraDesglose[] = [
  { nombre: "Flete", monto_min: 30000, monto_max: 50000, fuente: "internet", fecha: "2026-06-11" },
];

describe("esZonaPremium", () => {
  it("detecta countries y barrios privados", () => {
    expect(esZonaPremium("Nordelta")).toBe(true);
    expect(esZonaPremium("country Abril, Berazategui")).toBe(true);
    expect(esZonaPremium("Barrio privado Santa Bárbara")).toBe(true);
    expect(esZonaPremium("Palermo")).toBe(false);
    expect(esZonaPremium(undefined)).toBe(false);
  });
});

describe("calcularTotales", () => {
  it("suma por tipo, aplica imprevistos y sin factor zona", () => {
    const t = calcularTotales(ITEMS, EXTRAS, { imprevistos_pct: 10, zona: "Palermo" });
    expect(t.materiales_min).toBe(100000);
    expect(t.mano_de_obra_min).toBe(400000);
    expect(t.extras_max).toBe(50000);
    expect(t.subtotal_min).toBe(530000);
    expect(t.subtotal_max).toBe(570000);
    expect(t.factor_zona_min).toBe(1);
    // 530.000 × 1.10 = 583.000 ; 570.000 × 1.10 = 627.000
    expect(t.total_min).toBe(583000);
    expect(t.total_max).toBe(627000);
  });

  it("aplica factor zona premium 1.15–1.20", () => {
    const t = calcularTotales(ITEMS, [], { imprevistos_pct: 0, zona: "Nordelta" });
    expect(t.factor_zona_min).toBe(FACTOR_ZONA_PREMIUM.min);
    expect(t.factor_zona_max).toBe(FACTOR_ZONA_PREMIUM.max);
    // 500.000×1.15=575.000 ; 520.000×1.20=624.000
    expect(t.total_min).toBe(575000);
    expect(t.total_max).toBe(624000);
  });
});

describe("calcularTiempo", () => {
  it("suma días por etapa y toma la cuadrilla máxima", () => {
    const receta = {
      etapas: [
        { nombre: "a", orden: 1, items: [], dias_min: 2, dias_max: 3, cuadrilla: 2 },
        { nombre: "b", orden: 2, items: [], dias_min: 1, dias_max: 2, cuadrilla: 3 },
      ],
    } as unknown as Receta;
    expect(calcularTiempo(receta)).toEqual({ dias_min: 3, dias_max: 5, cuadrilla_max: 3 });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/cotizador/__tests__/totales.test.ts`
Expected: FAIL — "Cannot find module '../totales'".

- [ ] **Step 3: Implementar `src/lib/cotizador/totales.ts`**

```ts
import { normalizar } from "./texto";
import type { ExtraDesglose, ItemDesglose, Receta, TotalesDesglose } from "./tipos";

/** Factor de zona para countries / barrios privados (spec §6.2.3: +15–20%). */
export const FACTOR_ZONA_PREMIUM = { min: 1.15, max: 1.2 } as const;

const MARCAS_ZONA_PREMIUM = [
  "nordelta",
  "country",
  "barrio privado",
  "barrio cerrado",
  "puertos",
  "santa barbara",
  "san isidro chico",
];

export function esZonaPremium(zona?: string | null): boolean {
  if (!zona) return false;
  const z = normalizar(zona);
  return MARCAS_ZONA_PREMIUM.some((marca) => z.includes(marca));
}

export type OpcionesTotales = {
  imprevistos_pct: number;
  zona?: string;
};

export function calcularTotales(
  items: ItemDesglose[],
  extras: ExtraDesglose[],
  opciones: OpcionesTotales
): TotalesDesglose {
  let materialesMin = 0;
  let materialesMax = 0;
  let moMin = 0;
  let moMax = 0;
  for (const it of items) {
    if (it.tipo === "material") {
      materialesMin += it.subtotal_min;
      materialesMax += it.subtotal_max;
    } else {
      moMin += it.subtotal_min;
      moMax += it.subtotal_max;
    }
  }
  let extrasMin = 0;
  let extrasMax = 0;
  for (const ex of extras) {
    extrasMin += ex.monto_min;
    extrasMax += ex.monto_max;
  }

  const subtotalMin = materialesMin + moMin + extrasMin;
  const subtotalMax = materialesMax + moMax + extrasMax;

  const premium = esZonaPremium(opciones.zona);
  const factorMin = premium ? FACTOR_ZONA_PREMIUM.min : 1;
  const factorMax = premium ? FACTOR_ZONA_PREMIUM.max : 1;
  const imprevistos = 1 + opciones.imprevistos_pct / 100;

  return {
    materiales_min: materialesMin,
    materiales_max: materialesMax,
    mano_de_obra_min: moMin,
    mano_de_obra_max: moMax,
    extras_min: extrasMin,
    extras_max: extrasMax,
    subtotal_min: subtotalMin,
    subtotal_max: subtotalMax,
    imprevistos_pct: opciones.imprevistos_pct,
    factor_zona_min: factorMin,
    factor_zona_max: factorMax,
    total_min: Math.round(subtotalMin * imprevistos * factorMin),
    total_max: Math.round(subtotalMax * imprevistos * factorMax),
  };
}

export function calcularTiempo(receta: Receta): {
  dias_min: number;
  dias_max: number;
  cuadrilla_max: number;
} {
  let diasMin = 0;
  let diasMax = 0;
  let cuadrilla = 0;
  for (const etapa of receta.etapas) {
    diasMin += etapa.dias_min ?? 0;
    diasMax += etapa.dias_max ?? etapa.dias_min ?? 0;
    cuadrilla = Math.max(cuadrilla, etapa.cuadrilla ?? 0);
  }
  return { dias_min: diasMin, dias_max: diasMax, cuadrilla_max: cuadrilla };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/lib/cotizador/__tests__/totales.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cotizador/totales.ts src/lib/cotizador/__tests__/totales.test.ts
git commit -m "feat(cotizador): totales min/max con imprevistos y factor zona premium"
```

---

### Task 6: Vencimiento de precios (`vencimiento.ts`)

Todo precio lleva `{valor, fuente, fecha}`. Vencido = 15 días materiales / 30 días MO (configurable). Los extras vencen como materiales (15 días).

**Files:**
- Create: `src/lib/cotizador/vencimiento.ts`
- Test: `src/lib/cotizador/__tests__/vencimiento.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/cotizador/__tests__/vencimiento.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { diasEntre, precioVencido, avisosVencidos, VENCIMIENTO_DIAS } from "../vencimiento";
import type { ExtraDesglose, ItemDesglose } from "../tipos";

const HOY = "2026-06-12";

describe("diasEntre", () => {
  it("cuenta días de calendario", () => {
    expect(diasEntre("2026-06-01", HOY)).toBe(11);
    expect(diasEntre(HOY, HOY)).toBe(0);
  });
});

describe("precioVencido", () => {
  it("material vence a los 15 días, MO a los 30", () => {
    const p = (fecha: string) => ({ valor: 100, fuente: "x", fecha });
    expect(precioVencido(p("2026-05-29"), "material", HOY)).toBe(false); // 14 días
    expect(precioVencido(p("2026-05-27"), "material", HOY)).toBe(true); // 16 días
    expect(precioVencido(p("2026-05-27"), "mano_de_obra", HOY)).toBe(false); // 16 < 30
    expect(precioVencido(p("2026-05-01"), "mano_de_obra", HOY)).toBe(true); // 42 días
  });
});

describe("avisosVencidos", () => {
  it("lista cada fuente vencida de items y extras", () => {
    const items = [
      {
        nombre: "Latex",
        tipo: "material",
        precios: {
          sismat: { valor: 90000, fuente: "SISMAT", fecha: "2026-04-01" },
          internet: { valor: 120000, fuente: "easy.com.ar", fecha: "2026-06-11" },
        },
      },
    ] as unknown as ItemDesglose[];
    const extras: ExtraDesglose[] = [
      { nombre: "Flete", monto_min: 1, monto_max: 2, fuente: "viejo.com", fecha: "2026-05-01" },
    ];
    const avisos = avisosVencidos(items, extras, HOY);
    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toEqual({
      item: "Latex",
      fuente: "SISMAT",
      fecha: "2026-04-01",
      dias: 72,
      limite: VENCIMIENTO_DIAS.material,
    });
    expect(avisos[1].item).toBe("Flete");
    expect(avisos[1].limite).toBe(15);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/cotizador/__tests__/vencimiento.test.ts`
Expected: FAIL — "Cannot find module '../vencimiento'".

- [ ] **Step 3: Implementar `src/lib/cotizador/vencimiento.ts`**

```ts
import type { AvisoVencido, ExtraDesglose, ItemDesglose, PrecioFechado, TipoItem } from "./tipos";

/** Días de validez de un precio (spec §6.2.4, configurable). */
export const VENCIMIENTO_DIAS: Record<TipoItem, number> = {
  material: 15,
  mano_de_obra: 30,
};

const MS_DIA = 24 * 60 * 60 * 1000;

/** Días de calendario entre dos fechas YYYY-MM-DD (UTC, sin horas). */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / MS_DIA);
}

export function precioVencido(
  precio: PrecioFechado,
  tipo: TipoItem,
  hoy: string,
  limites: Record<TipoItem, number> = VENCIMIENTO_DIAS
): boolean {
  return diasEntre(precio.fecha, hoy) > limites[tipo];
}

/** Avisos de TODOS los precios vencidos del desglose (una fila por fuente vencida). */
export function avisosVencidos(
  items: ItemDesglose[],
  extras: ExtraDesglose[],
  hoy: string,
  limites: Record<TipoItem, number> = VENCIMIENTO_DIAS
): AvisoVencido[] {
  const avisos: AvisoVencido[] = [];
  for (const it of items) {
    for (const precio of [it.precios.sismat, it.precios.internet]) {
      if (precio && precioVencido(precio, it.tipo, hoy, limites)) {
        avisos.push({
          item: it.nombre,
          fuente: precio.fuente,
          fecha: precio.fecha,
          dias: diasEntre(precio.fecha, hoy),
          limite: limites[it.tipo],
        });
      }
    }
  }
  for (const ex of extras) {
    const precio: PrecioFechado = { valor: ex.monto_max, fuente: ex.fuente, fecha: ex.fecha };
    if (precioVencido(precio, "material", hoy, limites)) {
      avisos.push({
        item: ex.nombre,
        fuente: ex.fuente,
        fecha: ex.fecha,
        dias: diasEntre(ex.fecha, hoy),
        limite: limites.material,
      });
    }
  }
  return avisos;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/lib/cotizador/__tests__/vencimiento.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cotizador/vencimiento.ts src/lib/cotizador/__tests__/vencimiento.test.ts
git commit -m "feat(cotizador): vencimiento de precios fechados (15d materiales / 30d MO)"
```

---

### Task 7: Checklist anti-olvidos (`checklist.ts`)

Cruza el desglose contra los ítems globales (flete, volquete, consumibles, andamios, limpieza final, retiro de escombros, imprevistos %, factor zona) + el checklist propio de la receta (spec §6.2.3).

**Files:**
- Create: `src/lib/cotizador/checklist.ts`
- Test: `src/lib/cotizador/__tests__/checklist.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/cotizador/__tests__/checklist.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { evaluarChecklist, CHECKLIST_GLOBAL } from "../checklist";
import type { ExtraDesglose, ItemDesglose } from "../tipos";

function item(nombre: string): ItemDesglose {
  return {
    nombre,
    etapa: "e",
    tipo: "material",
    unidad: "u",
    formula: "1",
    cantidad_base: 1,
    desperdicio_pct: 0,
    cantidad: 1,
    precios: {},
    precio_min: 1,
    precio_max: 1,
    subtotal_min: 1,
    subtotal_max: 1,
    divergencia_pct: null,
    sin_precio: false,
  };
}

const EXTRAS: ExtraDesglose[] = [
  { nombre: "Flete corralón", monto_min: 1, monto_max: 2, fuente: "x", fecha: "2026-06-11" },
];

describe("evaluarChecklist", () => {
  const resultados = evaluarChecklist({
    items: [item("Volquete 5m3"), item("Latex interior")],
    extras: EXTRAS,
    checklist_receta: ["enduido", "cinta de papel"],
    imprevistos_pct: 10,
    zona: "Nordelta",
  });
  const porItem = Object.fromEntries(resultados.map((r) => [r.item, r]));

  it("evalúa todos los globales + los de la receta", () => {
    expect(resultados).toHaveLength(CHECKLIST_GLOBAL.length + 2);
  });

  it("marca cubierto lo que aparece en items o extras", () => {
    expect(porItem["flete"].estado).toBe("cubierto");
    expect(porItem["flete"].detalle).toContain("Flete corralón");
    expect(porItem["volquete"].estado).toBe("cubierto");
  });

  it("marca faltante lo que no aparece", () => {
    expect(porItem["andamios"].estado).toBe("faltante");
    expect(porItem["enduido"].estado).toBe("faltante");
    expect(porItem["cinta de papel"].estado).toBe("faltante");
  });

  it("imprevistos y factor zona se evalúan por configuración, no por texto", () => {
    expect(porItem["imprevistos"].estado).toBe("cubierto");
    expect(porItem["factor zona"].estado).toBe("cubierto");
  });

  it("factor zona no aplica fuera de zonas premium; imprevistos 0 = faltante", () => {
    const r = evaluarChecklist({
      items: [],
      extras: [],
      checklist_receta: [],
      imprevistos_pct: 0,
      zona: "Palermo",
    });
    const por = Object.fromEntries(r.map((x) => [x.item, x]));
    expect(por["factor zona"].estado).toBe("no_aplica");
    expect(por["imprevistos"].estado).toBe("faltante");
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/cotizador/__tests__/checklist.test.ts`
Expected: FAIL — "Cannot find module '../checklist'".

- [ ] **Step 3: Implementar `src/lib/cotizador/checklist.ts`**

```ts
import { normalizar } from "./texto";
import { esZonaPremium } from "./totales";
import type { ExtraDesglose, ItemDesglose, ResultadoChecklist } from "./tipos";

/** Ítems anti-olvidos globales (spec §6.2.3). Los dos últimos se chequean por config. */
export const CHECKLIST_GLOBAL = [
  "flete",
  "volquete",
  "consumibles",
  "andamios",
  "limpieza final",
  "retiro de escombros",
  "imprevistos",
  "factor zona",
] as const;

export type EntradaChecklist = {
  items: ItemDesglose[];
  extras: ExtraDesglose[];
  checklist_receta: string[];
  imprevistos_pct: number;
  zona?: string;
};

function buscarCobertura(
  termino: string,
  nombres: Array<{ nombre: string; normalizado: string }>
): string | null {
  const t = normalizar(termino);
  const hit = nombres.find((n) => n.normalizado.includes(t));
  return hit ? hit.nombre : null;
}

export function evaluarChecklist(entrada: EntradaChecklist): ResultadoChecklist[] {
  const nombres = [
    ...entrada.items.map((i) => i.nombre),
    ...entrada.extras.map((e) => e.nombre),
  ].map((nombre) => ({ nombre, normalizado: normalizar(nombre) }));

  const resultados: ResultadoChecklist[] = [];

  for (const termino of [...CHECKLIST_GLOBAL, ...entrada.checklist_receta]) {
    if (termino === "imprevistos") {
      resultados.push(
        entrada.imprevistos_pct > 0
          ? {
              item: termino,
              estado: "cubierto",
              detalle: `${entrada.imprevistos_pct}% aplicado sobre el subtotal`,
            }
          : {
              item: termino,
              estado: "faltante",
              detalle: "imprevistos_pct = 0 — confirmar si es a propósito",
            }
      );
      continue;
    }
    if (termino === "factor zona") {
      if (!esZonaPremium(entrada.zona)) {
        resultados.push({
          item: termino,
          estado: "no_aplica",
          detalle: `zona "${entrada.zona ?? "sin zona"}" no es country/barrio privado`,
        });
      } else {
        resultados.push({
          item: termino,
          estado: "cubierto",
          detalle: `zona premium "${entrada.zona}" — factor 1.15–1.20 aplicado`,
        });
      }
      continue;
    }
    const cobertura = buscarCobertura(termino, nombres);
    resultados.push(
      cobertura
        ? { item: termino, estado: "cubierto", detalle: `cubierto por: ${cobertura}` }
        : {
            item: termino,
            estado: "faltante",
            detalle: "no aparece en el desglose — confirmar si aplica o agregar como extra",
          }
    );
  }
  return resultados;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/lib/cotizador/__tests__/checklist.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cotizador/checklist.ts src/lib/cotizador/__tests__/checklist.test.ts
git commit -m "feat(cotizador): checklist anti-olvidos global + receta"
```

---

### Task 8: Sanidad física (`sanidad.ts`)

Spec §6.2.7: chequeos automáticos contra la física y el mercado. Tres chequeos: (a) rango de rendimiento por ítem (cantidad relativa a un parámetro, declarado en `rango_fisico` de la receta), (b) ítems sin precio (el total queda incompleto), (c) precio final por m² dentro de la banda de mercado del rubro. La banda NO vive en una tabla: la trae la IA en cada cotización como `banda_m2` con fuente y fecha (igual que cualquier precio).

**Files:**
- Create: `src/lib/cotizador/sanidad.ts`
- Test: `src/lib/cotizador/__tests__/sanidad.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/cotizador/__tests__/sanidad.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { evaluarSanidad } from "../sanidad";
import type { ItemDesglose, TotalesDesglose } from "../tipos";

function item(parcial: Partial<ItemDesglose>): ItemDesglose {
  return {
    nombre: "x",
    etapa: "e",
    tipo: "material",
    unidad: "u",
    formula: "1",
    cantidad_base: 1,
    desperdicio_pct: 0,
    cantidad: 1,
    precios: {},
    precio_min: 100,
    precio_max: 100,
    subtotal_min: 100,
    subtotal_max: 100,
    divergencia_pct: null,
    sin_precio: false,
    ...parcial,
  };
}

const TOTALES: TotalesDesglose = {
  materiales_min: 0,
  materiales_max: 0,
  mano_de_obra_min: 0,
  mano_de_obra_max: 0,
  extras_min: 0,
  extras_max: 0,
  subtotal_min: 0,
  subtotal_max: 0,
  imprevistos_pct: 10,
  factor_zona_min: 1,
  factor_zona_max: 1,
  total_min: 4_000_000,
  total_max: 5_000_000,
};

const BANDA = { min: 40_000, max: 70_000, fuente: "clickie.com.ar", fecha: "2026-06-10" };

describe("evaluarSanidad — rango físico por ítem", () => {
  it("ok dentro del rango", () => {
    const r = evaluarSanidad({
      items: [
        item({
          nombre: "Latex",
          cantidad: 3,
          rango_fisico: { parametro: "superficie_m2", min: 0.02, max: 0.05 },
        }),
      ],
      totales: TOTALES,
      parametros: { superficie_m2: 80 },
      banda_m2: BANDA,
    });
    const chequeo = r.find((x) => x.chequeo === "rendimiento: Latex")!;
    expect(chequeo.estado).toBe("ok");
    expect(chequeo.detalle).toContain("0.0375");
  });

  it("fuera_de_rango cuando la cantidad no cierra físicamente", () => {
    const r = evaluarSanidad({
      items: [
        item({
          nombre: "Latex",
          cantidad: 10,
          rango_fisico: { parametro: "superficie_m2", min: 0.02, max: 0.05 },
        }),
      ],
      totales: TOTALES,
      parametros: { superficie_m2: 80 },
      banda_m2: BANDA,
    });
    expect(r.find((x) => x.chequeo === "rendimiento: Latex")!.estado).toBe("fuera_de_rango");
  });

  it("sin_datos si falta el parámetro del rango", () => {
    const r = evaluarSanidad({
      items: [
        item({
          nombre: "Zocalo",
          cantidad: 12,
          rango_fisico: { parametro: "ml_zocalo", min: 0.9, max: 1.2 },
        }),
      ],
      totales: TOTALES,
      parametros: { superficie_m2: 80 },
      banda_m2: BANDA,
    });
    expect(r.find((x) => x.chequeo === "rendimiento: Zocalo")!.estado).toBe("sin_datos");
  });
});

describe("evaluarSanidad — precios", () => {
  it("marca los ítems sin precio", () => {
    const r = evaluarSanidad({
      items: [item({ nombre: "Volquete", sin_precio: true, precio_min: null, precio_max: null })],
      totales: TOTALES,
      parametros: { superficie_m2: 80 },
      banda_m2: BANDA,
    });
    const chequeo = r.find((x) => x.chequeo === "precio: Volquete")!;
    expect(chequeo.estado).toBe("sin_datos");
  });
});

describe("evaluarSanidad — banda $/m²", () => {
  it("ok si el rango del total pisa la banda", () => {
    // 4M–5M / 80 m² = $50.000–$62.500/m² vs banda 40.000–70.000
    const r = evaluarSanidad({ items: [], totales: TOTALES, parametros: { superficie_m2: 80 }, banda_m2: BANDA });
    const banda = r.find((x) => x.chequeo === "precio por m2")!;
    expect(banda.estado).toBe("ok");
    expect(banda.detalle).toContain("50000");
  });

  it("fuera_de_rango si el rango del total no toca la banda", () => {
    const r = evaluarSanidad({
      items: [],
      totales: TOTALES,
      parametros: { superficie_m2: 80 },
      banda_m2: { min: 70_000, max: 90_000, fuente: "x", fecha: "2026-06-10" },
    });
    expect(r.find((x) => x.chequeo === "precio por m2")!.estado).toBe("fuera_de_rango");
  });

  it("sin_datos sin banda o sin superficie", () => {
    const sinBanda = evaluarSanidad({ items: [], totales: TOTALES, parametros: { superficie_m2: 80 } });
    expect(sinBanda.find((x) => x.chequeo === "precio por m2")!.estado).toBe("sin_datos");

    const sinSuperficie = evaluarSanidad({ items: [], totales: TOTALES, parametros: {}, banda_m2: BANDA });
    expect(sinSuperficie.find((x) => x.chequeo === "precio por m2")!.estado).toBe("sin_datos");
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/cotizador/__tests__/sanidad.test.ts`
Expected: FAIL — "Cannot find module '../sanidad'".

- [ ] **Step 3: Implementar `src/lib/cotizador/sanidad.ts`**

```ts
import type { ItemDesglose, ResultadoSanidad, TotalesDesglose } from "./tipos";

/** Banda de mercado del rubro en $/m² — la trae la IA con fuente y fecha. */
export type BandaM2 = { min: number; max: number; fuente: string; fecha: string };

export type EntradaSanidad = {
  items: ItemDesglose[];
  totales: TotalesDesglose;
  parametros: Record<string, number | string>;
  banda_m2?: BandaM2;
};

/** Convención de la receta: el parámetro de superficie se llama así. */
const PARAMETRO_SUPERFICIE = "superficie_m2";

/**
 * Sanidad física (spec §6.2.7): rendimientos dentro de rangos físicos,
 * ítems sin precio marcados, y precio final por m² dentro de la banda
 * de mercado del rubro. Fuera de banda → la mesa lo muestra, no se entrega solo.
 */
export function evaluarSanidad(entrada: EntradaSanidad): ResultadoSanidad[] {
  const out: ResultadoSanidad[] = [];

  for (const it of entrada.items) {
    if (it.rango_fisico) {
      const base = entrada.parametros[it.rango_fisico.parametro];
      if (typeof base !== "number" || !Number.isFinite(base) || base <= 0) {
        out.push({
          chequeo: `rendimiento: ${it.nombre}`,
          estado: "sin_datos",
          detalle: `falta el parámetro "${it.rango_fisico.parametro}" para chequear el rango físico`,
        });
      } else {
        const ratio = Math.round((it.cantidad / base) * 10000) / 10000;
        const ok = ratio >= it.rango_fisico.min && ratio <= it.rango_fisico.max;
        out.push({
          chequeo: `rendimiento: ${it.nombre}`,
          estado: ok ? "ok" : "fuera_de_rango",
          detalle: `${ratio} ${it.unidad} por ${it.rango_fisico.parametro} (admisible ${it.rango_fisico.min}–${it.rango_fisico.max})`,
        });
      }
    }
    if (it.sin_precio) {
      out.push({
        chequeo: `precio: ${it.nombre}`,
        estado: "sin_datos",
        detalle: "ítem sin precio: el total está incompleto hasta conseguirlo",
      });
    }
  }

  const superficie = entrada.parametros[PARAMETRO_SUPERFICIE];
  if (typeof superficie !== "number" || !Number.isFinite(superficie) || superficie <= 0) {
    out.push({
      chequeo: "precio por m2",
      estado: "sin_datos",
      detalle: `sin parámetro ${PARAMETRO_SUPERFICIE}: no se puede chequear la banda de mercado`,
    });
  } else if (!entrada.banda_m2) {
    out.push({
      chequeo: "precio por m2",
      estado: "sin_datos",
      detalle: "sin banda de mercado del rubro (banda_m2): conseguirla con fuente y fecha",
    });
  } else {
    const pm2Min = Math.round(entrada.totales.total_min / superficie);
    const pm2Max = Math.round(entrada.totales.total_max / superficie);
    const fuera = pm2Max < entrada.banda_m2.min || pm2Min > entrada.banda_m2.max;
    out.push({
      chequeo: "precio por m2",
      estado: fuera ? "fuera_de_rango" : "ok",
      detalle: `$${pm2Min}–$${pm2Max}/m² vs banda $${entrada.banda_m2.min}–$${entrada.banda_m2.max} (${entrada.banda_m2.fuente}, ${entrada.banda_m2.fecha})`,
    });
  }

  return out;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/lib/cotizador/__tests__/sanidad.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cotizador/sanidad.ts src/lib/cotizador/__tests__/sanidad.test.ts
git commit -m "feat(cotizador): sanidad física — rangos de rendimiento y banda de mercado por m²"
```

---

### Task 9: Orquestador del motor (`cotizar.ts`)

Una sola entrada, una sola salida: `EntradaCotizacion` (lo que decidió la IA: receta, parámetros, precios fechados, extras, zona, banda, dudas) → `CotizacionCalculada` (desglose + revisión + totales). Es la única función que el CLI (Task 10) y cualquier otro consumidor llaman. Si faltan parámetros requeridos tira `FaltanParametrosError` — eso dispara la pregunta de ficha.

**Files:**
- Create: `src/lib/cotizador/cotizar.ts`
- Test: `src/lib/cotizador/__tests__/cotizar.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/cotizador/__tests__/cotizar.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cotizar, FaltanParametrosError } from "../cotizar";
import type { ExtraDesglose, PrecioItem, Receta } from "../tipos";

const RECETA: Receta = {
  nombre: "pintura-interior",
  titulo: "Pintura interior completa",
  estado: "confiable",
  version: 1,
  parametros: [
    { nombre: "superficie_m2", etiqueta: "Superficie (m²)", tipo: "numero", requerido: true },
  ],
  checklist: ["enduido en paredes con imperfecciones"],
  fuentes: [{ titulo: "Seia — pintura interior", tipo: "seia", fecha: "2026-06-01" }],
  etapas: [
    {
      nombre: "Pintura",
      orden: 1,
      dias_min: 3,
      dias_max: 5,
      cuadrilla: 2,
      items: [
        {
          nombre: "Latex interior 20L",
          tipo: "material",
          unidad: "u",
          formula: "ceil(superficie_m2 * 2 / 80)",
          desperdicio_pct: 10,
        },
        {
          nombre: "Pintor por m2",
          tipo: "mano_de_obra",
          unidad: "m2",
          formula: "superficie_m2",
        },
      ],
    },
  ],
};

const PRECIOS: Record<string, PrecioItem> = {
  "Latex interior 20L": {
    sismat: { valor: 90000, fuente: "SISMAT", fecha: "2026-06-08" },
    internet: { valor: 120000, fuente: "easy.com.ar", fecha: "2026-06-11" },
  },
  "Pintor por m2": {
    sismat: { valor: 5500, fuente: "SISMAT", fecha: "2026-06-08" },
  },
};

const EXTRAS: ExtraDesglose[] = [
  { nombre: "Flete corralón", monto_min: 30000, monto_max: 50000, fuente: "internet", fecha: "2026-06-11" },
];

const entrada = (hoy: string) => ({
  receta: RECETA,
  parametros: { superficie_m2: 80 },
  precios: PRECIOS,
  extras: EXTRAS,
  imprevistos_pct: 10,
  zona: "Nordelta",
  banda_m2: { min: 8000, max: 16000, fuente: "clickie.com.ar", fecha: "2026-06-10" },
  dudas: ["¿el techo también se pinta?"],
  hoy,
});

describe("cotizar (orquestador)", () => {
  const resultado = cotizar(entrada("2026-06-12"));

  it("arma el desglose completo con los totales del motor", () => {
    // latex: 3u × (90k–120k) = 270k–360k; MO: 80×5500 = 440k; flete 30k–50k
    // subtotal 740k–850k × 1.10 imprevistos × 1.15–1.20 zona = 936.100–1.122.000
    expect(resultado.total_min).toBe(936100);
    expect(resultado.total_max).toBe(1122000);
    expect(resultado.desglose.receta_nombre).toBe("pintura-interior");
    expect(resultado.desglose.receta_version).toBe(1);
    expect(resultado.desglose.items).toHaveLength(2);
    expect(resultado.desglose.tiempo).toEqual({ dias_min: 3, dias_max: 5, cuadrilla_max: 2 });
  });

  it("marca las divergencias >25% para la mesa", () => {
    expect(resultado.revision.divergencias).toEqual([
      { item: "Latex interior 20L", sismat: 90000, internet: 120000, divergencia_pct: 33.3 },
    ]);
  });

  it("corre checklist y sanidad y pasa las dudas", () => {
    const flete = resultado.revision.checklist.find((c) => c.item === "flete")!;
    expect(flete.estado).toBe("cubierto");
    const banda = resultado.revision.sanidad.find((s) => s.chequeo === "precio por m2")!;
    expect(banda.estado).toBe("ok"); // 936.100–1.122.000 / 80 = $11.701–$14.025/m²
    expect(resultado.revision.dudas).toEqual(["¿el techo también se pinta?"]);
  });

  it("sin precios vencidos al día de la cotización; vencen al pasar los días", () => {
    expect(resultado.revision.precios_vencidos).toHaveLength(0);
    const tarde = cotizar(entrada("2026-06-30"));
    // latex sismat (22d > 15) + latex internet (19d > 15) + flete (19d > 15); MO 22d < 30 no
    expect(tarde.revision.precios_vencidos).toHaveLength(3);
  });

  it("tira FaltanParametrosError con la lista de lo que falta", () => {
    expect(() => cotizar({ receta: RECETA, parametros: {}, precios: PRECIOS })).toThrow(
      FaltanParametrosError
    );
    try {
      cotizar({ receta: RECETA, parametros: {}, precios: PRECIOS });
    } catch (e) {
      expect((e as FaltanParametrosError).faltan).toEqual(["superficie_m2"]);
    }
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/cotizador/__tests__/cotizar.test.ts`
Expected: FAIL — "Cannot find module '../cotizar'".

- [ ] **Step 3: Implementar `src/lib/cotizador/cotizar.ts`**

```ts
import { evaluarChecklist } from "./checklist";
import { instanciarItems, validarParametros } from "./instanciar";
import { evaluarSanidad, type BandaM2 } from "./sanidad";
import { calcularTiempo, calcularTotales } from "./totales";
import { avisosVencidos } from "./vencimiento";
import type {
  Desglose,
  Divergencia,
  ExtraDesglose,
  PrecioItem,
  Receta,
  Revision,
} from "./tipos";

/** Imprevistos por defecto si la IA no manda otro (spec §6.2.3). */
export const IMPREVISTOS_DEFAULT_PCT = 10;

/** Umbral de divergencia SISMAT vs internet que se marca en la mesa (§6.4). */
export const UMBRAL_DIVERGENCIA_PCT = 25;

export class FaltanParametrosError extends Error {
  faltan: string[];
  constructor(faltan: string[]) {
    super(`Faltan parámetros requeridos de la receta: ${faltan.join(", ")}`);
    this.name = "FaltanParametrosError";
    this.faltan = faltan;
  }
}

/** Lo que decidió la IA. Este módulo hace TODA la aritmética (spec §6.2.1). */
export type EntradaCotizacion = {
  receta: Receta;
  parametros: Record<string, number | string>;
  precios: Record<string, PrecioItem>;
  extras?: ExtraDesglose[];
  imprevistos_pct?: number;
  zona?: string;
  banda_m2?: BandaM2;
  dudas?: string[];
  /** YYYY-MM-DD para el cálculo de vencimientos; default: hoy. Inyectable en tests. */
  hoy?: string;
};

export type CotizacionCalculada = {
  desglose: Desglose;
  revision: Revision;
  total_min: number;
  total_max: number;
};

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function cotizar(entrada: EntradaCotizacion): CotizacionCalculada {
  const faltan = validarParametros(entrada.receta, entrada.parametros);
  if (faltan.length > 0) throw new FaltanParametrosError(faltan);

  const hoy = entrada.hoy ?? hoyIso();
  const extras = entrada.extras ?? [];
  const imprevistos = entrada.imprevistos_pct ?? IMPREVISTOS_DEFAULT_PCT;

  const items = instanciarItems(entrada.receta, entrada.parametros, entrada.precios);
  const totales = calcularTotales(items, extras, {
    imprevistos_pct: imprevistos,
    zona: entrada.zona,
  });
  const tiempo = calcularTiempo(entrada.receta);

  const divergencias: Divergencia[] = items
    .filter(
      (i) =>
        i.divergencia_pct != null &&
        i.divergencia_pct > UMBRAL_DIVERGENCIA_PCT &&
        i.precios.sismat != null &&
        i.precios.internet != null
    )
    .map((i) => ({
      item: i.nombre,
      sismat: i.precios.sismat!.valor,
      internet: i.precios.internet!.valor,
      divergencia_pct: i.divergencia_pct!,
    }));

  const revision: Revision = {
    checklist: evaluarChecklist({
      items,
      extras,
      checklist_receta: entrada.receta.checklist,
      imprevistos_pct: imprevistos,
      zona: entrada.zona,
    }),
    sanidad: evaluarSanidad({
      items,
      totales,
      parametros: entrada.parametros,
      banda_m2: entrada.banda_m2,
    }),
    precios_vencidos: avisosVencidos(items, extras, hoy),
    divergencias,
    dudas: entrada.dudas ?? [],
  };

  const desglose: Desglose = {
    receta_nombre: entrada.receta.nombre,
    receta_version: entrada.receta.version,
    parametros: entrada.parametros,
    items,
    extras,
    totales,
    tiempo,
    generado_at: new Date().toISOString(),
  };

  return {
    desglose,
    revision,
    total_min: totales.total_min,
    total_max: totales.total_max,
  };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/lib/cotizador/__tests__/cotizar.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Correr toda la suite del cotizador**

Run: `npx vitest run src/lib/cotizador`
Expected: 7 archivos de test, todos PASS, 0 failed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cotizador/cotizar.ts src/lib/cotizador/__tests__/cotizar.test.ts
git commit -m "feat(cotizador): orquestador cotizar() — desglose + revision completos desde una entrada"
```

---

### Task 10: CLI determinístico para Claude headless (`scripts/cotizador/instanciar.ts`)

El daemon corre Claude Code headless; Claude arma el JSON de entrada (receta + parámetros + precios que él decidió) y este CLI hace TODA la aritmética. Lee stdin, escribe stdout. `{"error":"faltan_parametros"}` NO es un fallo: es la señal de preguntar la ficha (exit 0).

**Files:**
- Create: `scripts/cotizador/instanciar.ts`
- Modify: `package.json` (devDependency `tsx`)

- [ ] **Step 1: Instalar tsx**

Run: `cd /Users/ezeotero/Documents/ravn && npm i -D tsx`
Expected: `package.json` gana `"tsx"` en `devDependencies`.

- [ ] **Step 2: Crear `scripts/cotizador/instanciar.ts`**

```ts
/**
 * CLI determinístico del Cotizador 2.0 — lo invoca Claude Code headless (daemon).
 *
 * Uso:  npx tsx scripts/cotizador/instanciar.ts < entrada.json
 *
 * stdin:  EntradaCotizacion (ver src/lib/cotizador/cotizar.ts)
 * stdout: {"desglose": ..., "revision": ..., "total_min": N, "total_max": N}
 *         | {"error": "faltan_parametros", "faltan": ["superficie_m2"]}  (exit 0: preguntar la ficha)
 *         | {"error": "<mensaje>"}                                        (exit 1)
 *
 * Regla madre (spec §6.2.1): la IA piensa, este código suma. La IA NUNCA
 * calcula cantidades ni totales a mano.
 */
import {
  cotizar,
  FaltanParametrosError,
  type EntradaCotizacion,
} from "../../src/lib/cotizador/cotizar";

async function leerStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const crudo = await leerStdin();
  let entrada: EntradaCotizacion;
  try {
    entrada = JSON.parse(crudo) as EntradaCotizacion;
  } catch {
    console.log(JSON.stringify({ error: "json_invalido: el stdin no es JSON parseable" }));
    process.exitCode = 1;
    return;
  }
  try {
    const resultado = cotizar(entrada);
    console.log(JSON.stringify(resultado));
  } catch (e) {
    if (e instanceof FaltanParametrosError) {
      console.log(JSON.stringify({ error: "faltan_parametros", faltan: e.faltan }));
      return; // exit 0: es una respuesta válida — hay que preguntar la ficha
    }
    console.log(JSON.stringify({ error: e instanceof Error ? e.message : "error desconocido" }));
    process.exitCode = 1;
  }
}

void main();
```

- [ ] **Step 3: Verificar el camino feliz**

```bash
cd /Users/ezeotero/Documents/ravn
cat > /tmp/entrada-cotizador.json <<'EOF'
{
  "receta": {
    "nombre": "prueba-cli",
    "titulo": "Prueba CLI",
    "estado": "investigada",
    "version": 1,
    "parametros": [
      { "nombre": "superficie_m2", "etiqueta": "Superficie (m²)", "tipo": "numero", "requerido": true }
    ],
    "checklist": [],
    "fuentes": [],
    "etapas": [
      {
        "nombre": "Única",
        "orden": 1,
        "items": [
          { "nombre": "Material X", "tipo": "material", "unidad": "m2", "formula": "superficie_m2" }
        ]
      }
    ]
  },
  "parametros": { "superficie_m2": 10 },
  "precios": {
    "Material X": { "internet": { "valor": 1000, "fuente": "prueba", "fecha": "2099-01-01" } }
  },
  "imprevistos_pct": 0
}
EOF
npx tsx scripts/cotizador/instanciar.ts < /tmp/entrada-cotizador.json | python3 -m json.tool | grep -E '"total_min"|"total_max"'
```

Expected:
```
    "total_min": 10000,
    "total_max": 10000,
```

- [ ] **Step 4: Verificar el camino de ficha incompleta**

```bash
python3 -c "import json; d = json.load(open('/tmp/entrada-cotizador.json')); d['parametros'] = {}; print(json.dumps(d))" \
  | npx tsx scripts/cotizador/instanciar.ts; echo "exit: $?"
```

Expected:
```
{"error":"faltan_parametros","faltan":["superficie_m2"]}
exit: 0
```

- [ ] **Step 5: Commit**

```bash
git add scripts/cotizador/instanciar.ts package.json package-lock.json
git commit -m "feat(cotizador): CLI determinístico por stdin/stdout para Claude headless"
```

---

### Task 11: Contraste cotizado vs gastado real (`contraste.ts`)

El loop de oro (spec §6.2.5), parte pura: `Desglose` + gastos reales de `presupuestos_gastos` → lección + ajuste para `cotizador_lecciones`. El matching es por palabras clave normalizadas (≥4 letras) del nombre del ítem contra la descripción del gasto; cada gasto se asigna al PRIMER ítem que matchea; lo que no matchea queda en `gastos_sin_match` (nunca se pierde plata del análisis).

Además de la plata, calibra **tiempos** (spec §6.2.5, segunda mitad): la duración real de la obra se estima con el rango de fechas de los gastos (primer gasto → último gasto, días corridos inclusive) y se compara contra `dias_min`/`dias_max` del desglose cotizado. El desvío entra al `ajuste` y a la lección para corregir los tiempos de la receta.

**Files:**
- Create: `src/lib/cotizador/contraste.ts`
- Test: `src/lib/cotizador/__tests__/contraste.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/cotizador/__tests__/contraste.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { contrastarObra } from "../contraste";
import type { Desglose, ItemDesglose } from "../tipos";

function item(parcial: Partial<ItemDesglose>): ItemDesglose {
  return {
    nombre: "x",
    etapa: "e",
    tipo: "material",
    unidad: "u",
    formula: "1",
    cantidad_base: 1,
    desperdicio_pct: 0,
    cantidad: 1,
    precios: {},
    precio_min: 100,
    precio_max: 100,
    subtotal_min: 100,
    subtotal_max: 100,
    divergencia_pct: null,
    sin_precio: false,
    ...parcial,
  };
}

const DESGLOSE: Desglose = {
  receta_nombre: "pintura-interior",
  receta_version: 1,
  parametros: { superficie_m2: 80 },
  items: [
    item({ nombre: "Latex interior 20L", tipo: "material", subtotal_min: 270000, subtotal_max: 360000 }),
    item({ nombre: "Pintor por m2", tipo: "mano_de_obra", subtotal_min: 440000, subtotal_max: 440000 }),
  ],
  extras: [],
  totales: {
    materiales_min: 270000,
    materiales_max: 360000,
    mano_de_obra_min: 440000,
    mano_de_obra_max: 440000,
    extras_min: 0,
    extras_max: 0,
    subtotal_min: 710000,
    subtotal_max: 800000,
    imprevistos_pct: 10,
    factor_zona_min: 1,
    factor_zona_max: 1,
    total_min: 781000,
    total_max: 880000,
  },
  tiempo: { dias_min: 3, dias_max: 5, cuadrilla_max: 2 },
  generado_at: "2026-06-12T12:00:00.000Z",
};

const GASTOS = [
  { descripcion: "2 latas latex alba 20l", importe: 250000, fecha: "2026-06-20" },
  { descripcion: "pago pintor semana 1", importe: 300000, fecha: "2026-06-21" },
  { descripcion: "pago pintor semana 2", importe: 200000, fecha: "2026-06-28" },
  { descripcion: "fletes varios", importe: 40000, fecha: "2026-06-20" },
];

describe("contrastarObra", () => {
  const r = contrastarObra(DESGLOSE, GASTOS);
  const porItem = Object.fromEntries(r.ajuste.items.map((i) => [i.nombre, i]));

  it("matchea gastos a ítems por palabras clave y calcula el desvío contra el punto medio", () => {
    // latex: gastado 250.000 vs medio 315.000 → -20,6%
    expect(porItem["Latex interior 20L"].gastado).toBe(250000);
    expect(porItem["Latex interior 20L"].gastos_matcheados).toBe(1);
    expect(porItem["Latex interior 20L"].desvio_pct).toBe(-20.6);
    // pintor: gastado 500.000 vs medio 440.000 → +13,6%
    expect(porItem["Pintor por m2"].gastado).toBe(500000);
    expect(porItem["Pintor por m2"].gastos_matcheados).toBe(2);
    expect(porItem["Pintor por m2"].desvio_pct).toBe(13.6);
  });

  it("acumula lo que no matchea en gastos_sin_match", () => {
    expect(r.ajuste.gastos_sin_match).toEqual([{ descripcion: "fletes varios", importe: 40000 }]);
  });

  it("calcula el desvío total con TODOS los gastos (matcheados o no)", () => {
    // gastado 790.000 vs medio total 830.500 → -4,9%
    expect(r.ajuste.total_gastado).toBe(790000);
    expect(r.ajuste.desvio_total_pct).toBe(-4.9);
    expect(r.ajuste.total_cotizado_min).toBe(781000);
    expect(r.ajuste.total_cotizado_max).toBe(880000);
  });

  it("escribe una lección legible con receta, totales y los peores desvíos", () => {
    expect(r.leccion).toContain("pintura-interior");
    expect(r.leccion).toContain("-4.9%");
    expect(r.leccion).toContain("Latex interior 20L -20.6%");
    expect(r.leccion).toContain("1 gasto(s) sin match");
  });

  it("ítem sin gastos matcheados queda con desvío null (sin datos, no 'gastó 0')", () => {
    const sinGastos = contrastarObra(DESGLOSE, [{ descripcion: "fletes varios", importe: 40000, fecha: "2026-06-20" }]);
    const latex = sinGastos.ajuste.items.find((i) => i.nombre === "Latex interior 20L")!;
    expect(latex.desvio_pct).toBeNull();
    expect(latex.gastado).toBe(0);
  });

  it("calibra la duración real (rango de fechas de gastos) contra los días de la receta", () => {
    // gastos del 2026-06-20 al 2026-06-28 → 9 días corridos inclusive, vs 3–5 cotizados
    expect(r.ajuste.tiempo).toEqual({
      dias_cotizados_min: 3,
      dias_cotizados_max: 5,
      dias_reales: 9,
      desvio_dias: 4, // 9 reales − 5 del máximo cotizado
    });
    expect(r.leccion).toContain("Duración real 9 día(s) vs 3–5 cotizados");
    expect(r.leccion).toContain("+4 día(s)");
  });

  it("sin fechas válidas en los gastos, el tiempo queda sin datos (null), nunca inventado", () => {
    const sinFechas = contrastarObra(DESGLOSE, [{ descripcion: "latex", importe: 1000, fecha: "" }]);
    expect(sinFechas.ajuste.tiempo.dias_reales).toBeNull();
    expect(sinFechas.ajuste.tiempo.desvio_dias).toBeNull();
    expect(sinFechas.leccion).not.toContain("Duración real");
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/cotizador/__tests__/contraste.test.ts`
Expected: FAIL — "Cannot find module '../contraste'".

- [ ] **Step 3: Implementar `src/lib/cotizador/contraste.ts`**

```ts
import { normalizar } from "./texto";
import type { Desglose } from "./tipos";

/** Fila de presupuestos_gastos reducida a lo que necesita el contraste. */
export type GastoRealObra = {
  descripcion: string;
  importe: number;
  fecha: string; // YYYY-MM-DD
};

export type ItemContraste = {
  nombre: string;
  cotizado_min: number;
  cotizado_max: number;
  gastado: number;
  gastos_matcheados: number;
  /** % contra el punto medio cotizado; null si no hubo gastos matcheados. */
  desvio_pct: number | null;
};

/** Calibración de tiempos (spec §6.2.5): duración real estimada por fechas de gastos. */
export type TiempoContraste = {
  dias_cotizados_min: number;
  dias_cotizados_max: number;
  /** Días corridos entre el primer y el último gasto (inclusive); null si no hay fechas válidas. */
  dias_reales: number | null;
  /** 0 = dentro del rango cotizado; positivo = días sobre el máximo; negativo = días bajo el mínimo. */
  desvio_dias: number | null;
};

export type AjusteContraste = {
  total_cotizado_min: number;
  total_cotizado_max: number;
  total_gastado: number;
  desvio_total_pct: number | null;
  items: ItemContraste[];
  gastos_sin_match: Array<{ descripcion: string; importe: number }>;
  tiempo: TiempoContraste;
};

export type ResultadoContraste = {
  leccion: string;
  ajuste: AjusteContraste;
};

const MIN_LARGO_PALABRA = 4;

function palabrasClave(nombre: string): string[] {
  return normalizar(nombre)
    .split(" ")
    .filter((p) => p.length >= MIN_LARGO_PALABRA);
}

function desvioPct(gastado: number, medio: number): number | null {
  if (medio <= 0) return null;
  return Math.round(((gastado - medio) / medio) * 1000) / 10;
}

const MS_POR_DIA = 86_400_000;

/** Días corridos (inclusive) entre el primer y el último gasto con fecha válida. */
function duracionRealDias(gastos: GastoRealObra[]): number | null {
  const tiempos = gastos
    .map((g) => g.fecha)
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))
    .map((f) => new Date(`${f}T00:00:00Z`).getTime())
    .filter((t) => Number.isFinite(t));
  if (tiempos.length === 0) return null;
  return Math.round((Math.max(...tiempos) - Math.min(...tiempos)) / MS_POR_DIA) + 1;
}

/**
 * Loop de oro (spec §6.2.5): al cerrar la obra, contrasta el desglose cotizado
 * contra los gastos reales — plata ítem por ítem Y duración (rango de fechas
 * de los gastos vs dias_min/dias_max cotizados). La lección y el ajuste van a
 * cotizador_lecciones (tipo contraste_obra) y se inyectan en la próxima
 * cotización de la receta.
 */
export function contrastarObra(
  desglose: Desglose,
  gastos: GastoRealObra[]
): ResultadoContraste {
  const claves = desglose.items.map((it) => ({ item: it, palabras: palabrasClave(it.nombre) }));
  const porItem = new Map<string, { gastado: number; n: number }>();
  const sinMatch: Array<{ descripcion: string; importe: number }> = [];

  for (const gasto of gastos) {
    const texto = normalizar(gasto.descripcion);
    const hit = claves.find(({ palabras }) => palabras.some((p) => texto.includes(p)));
    if (hit) {
      const acc = porItem.get(hit.item.nombre) ?? { gastado: 0, n: 0 };
      acc.gastado += gasto.importe;
      acc.n += 1;
      porItem.set(hit.item.nombre, acc);
    } else {
      sinMatch.push({ descripcion: gasto.descripcion, importe: gasto.importe });
    }
  }

  const items: ItemContraste[] = desglose.items.map((it) => {
    const acc = porItem.get(it.nombre) ?? { gastado: 0, n: 0 };
    const medio = (it.subtotal_min + it.subtotal_max) / 2;
    return {
      nombre: it.nombre,
      cotizado_min: it.subtotal_min,
      cotizado_max: it.subtotal_max,
      gastado: acc.gastado,
      gastos_matcheados: acc.n,
      desvio_pct: acc.n > 0 ? desvioPct(acc.gastado, medio) : null,
    };
  });

  const totalGastado = gastos.reduce((a, g) => a + g.importe, 0);
  const medioTotal = (desglose.totales.total_min + desglose.totales.total_max) / 2;
  const desvioTotal = desvioPct(totalGastado, medioTotal);

  const peores = items
    .filter((i) => i.desvio_pct != null)
    .sort((a, b) => Math.abs(b.desvio_pct!) - Math.abs(a.desvio_pct!))
    .slice(0, 3)
    .map((i) => `${i.nombre} ${i.desvio_pct! > 0 ? "+" : ""}${i.desvio_pct}%`)
    .join(", ");

  const montoSinMatch = sinMatch.reduce((a, g) => a + g.importe, 0);

  // Calibración de tiempos (spec §6.2.5, segunda mitad).
  const diasReales = duracionRealDias(gastos);
  const diasMin = desglose.tiempo.dias_min;
  const diasMax = desglose.tiempo.dias_max;
  let desvioDias: number | null = null;
  if (diasReales != null) {
    if (diasReales > diasMax) desvioDias = diasReales - diasMax;
    else if (diasReales < diasMin) desvioDias = diasReales - diasMin;
    else desvioDias = 0;
  }
  const tiempo: TiempoContraste = {
    dias_cotizados_min: diasMin,
    dias_cotizados_max: diasMax,
    dias_reales: diasReales,
    desvio_dias: desvioDias,
  };

  let leccion =
    `Contraste de obra (${desglose.receta_nombre} v${desglose.receta_version}): ` +
    `cotizado $${desglose.totales.total_min}–$${desglose.totales.total_max} ` +
    `vs gastado real $${totalGastado}` +
    (desvioTotal == null
      ? "."
      : ` (desvío ${desvioTotal > 0 ? "+" : ""}${desvioTotal}% sobre el punto medio).`);
  if (peores) leccion += ` Mayores desvíos por ítem: ${peores}.`;
  if (sinMatch.length > 0) {
    leccion += ` ${sinMatch.length} gasto(s) sin match por $${montoSinMatch}.`;
  }
  if (diasReales != null) {
    if (desvioDias === 0) {
      leccion += ` Duración real ${diasReales} día(s), dentro del rango cotizado ${diasMin}–${diasMax}.`;
    } else {
      leccion +=
        ` Duración real ${diasReales} día(s) vs ${diasMin}–${diasMax} cotizados ` +
        `(${desvioDias! > 0 ? "+" : ""}${desvioDias} día(s) — ajustar dias_min/dias_max de la receta).`;
    }
  }

  return {
    leccion,
    ajuste: {
      total_cotizado_min: desglose.totales.total_min,
      total_cotizado_max: desglose.totales.total_max,
      total_gastado: totalGastado,
      desvio_total_pct: desvioTotal,
      items,
      gastos_sin_match: sinMatch,
      tiempo,
    },
  };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/lib/cotizador/__tests__/contraste.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cotizador/contraste.ts src/lib/cotizador/__tests__/contraste.test.ts
git commit -m "feat(cotizador): contraste cotizado vs gastado real (loop de oro, parte pura)"
```

---

### Task 12: Hook del contraste al cerrar obra (`contraste-obra.ts` + finalizar)

Cuando Eze finaliza una obra (`POST /api/cashflow/obra/[obra_id]/finalizar`, ya existe), se corre el contraste contra TODAS las cotizaciones aprobadas/emitidas vinculadas al presupuesto y se insertan las lecciones. **Best-effort: el cierre de obra jamás se bloquea por el contraste.**

> **El vínculo cotización↔obra (`cotizaciones.presupuesto_id`) es la llave de este loop** y se setea por doble mecanismo: (a) el selector de obra de la mesa de revisión (Task 15, persiste vía `PATCH /api/cotizaciones/[id]` — Task 13 Step 6) y (b) el matching por nombre de cliente/obra que hace el skill al guardar (Task 19, paso 6 — solo con match inequívoco, si no queda `null` para la mesa). Sin vínculo, esta función devuelve 0 lecciones para esa cotización — por diseño, nunca adivina la obra.

**Files:**
- Create: `src/lib/cotizador/contraste-obra.ts`
- Modify: `src/app/api/cashflow/obra/[obra_id]/finalizar/route.ts`

- [ ] **Step 1: Crear `src/lib/cotizador/contraste-obra.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { contrastarObra, type GastoRealObra } from "./contraste";
import type { Desglose } from "./tipos";

/**
 * Loop de oro (spec §6.2.5), parte server-side: al cerrar una obra, contrasta
 * cada cotización aprobada/emitida vinculada al presupuesto contra los gastos
 * reales (presupuestos_gastos) y deja la lección en cotizador_lecciones.
 *
 * Devuelve cuántas lecciones insertó. NUNCA tira: el cierre de la obra no se
 * bloquea por el contraste (errores → log y 0).
 *
 * `sb` tiene que ser el cliente admin (service_role): cotizaciones y
 * cotizador_lecciones tienen RLS que la sesión anónima no pasa.
 */
export async function correrContrasteObra(
  sb: SupabaseClient,
  presupuestoId: string
): Promise<number> {
  try {
    const { data: cotizaciones, error: eCot } = await sb
      .from("cotizaciones")
      .select("id, titulo, estado, desglose")
      .eq("presupuesto_id", presupuestoId)
      .in("estado", ["aprobada", "documento_emitido"]);
    if (eCot || !cotizaciones || cotizaciones.length === 0) return 0;

    const { data: gastosRaw, error: eGas } = await sb
      .from("presupuestos_gastos")
      .select("descripcion, importe, fecha")
      .eq("presupuesto_id", presupuestoId);
    if (eGas) return 0;

    const gastos: GastoRealObra[] = (gastosRaw ?? []).map((g) => ({
      descripcion: String(g.descripcion ?? ""),
      importe: Number(g.importe ?? 0),
      fecha: String(g.fecha ?? "").slice(0, 10),
    }));
    if (gastos.length === 0) return 0;

    let insertadas = 0;
    for (const cot of cotizaciones) {
      const desglose = cot.desglose as Desglose | null;
      if (!desglose || !Array.isArray(desglose.items) || desglose.items.length === 0) continue;
      const resultado = contrastarObra(desglose, gastos);
      const { error: eIns } = await sb.from("cotizador_lecciones").insert({
        tipo: "contraste_obra",
        receta_nombre: desglose.receta_nombre,
        cotizacion_id: cot.id,
        obra_presupuesto_id: presupuestoId,
        leccion: resultado.leccion,
        ajuste: resultado.ajuste,
      });
      if (eIns) {
        console.error("[contraste-obra] insert lección:", eIns.message);
      } else {
        insertadas += 1;
      }
    }
    return insertadas;
  } catch (e) {
    console.error("[contraste-obra]", e instanceof Error ? e.message : e);
    return 0;
  }
}
```

- [ ] **Step 2: Engancharlo en el route de finalizar**

En `src/app/api/cashflow/obra/[obra_id]/finalizar/route.ts`:

(a) cambiar el import de Supabase (línea 8) — antes:

```ts
import { createSupabaseServerClient } from "@/lib/supabase/server";
```

después:

```ts
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import { correrContrasteObra } from "@/lib/cotizador/contraste-obra";
```

(b) reemplazar el cierre del handler — antes:

```ts
    return NextResponse.json({ ok: true, cierre: payload });
```

después:

```ts
    // Loop de oro del cotizador (Frente D): contraste cotizado vs gastado real.
    // Best-effort — nunca bloquea el cierre de la obra.
    const lecciones = await correrContrasteObra(
      createSupabaseAdminClient(),
      presupuestoId
    );

    return NextResponse.json({ ok: true, cierre: payload, lecciones_contraste: lecciones });
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/cotizador/contraste-obra.ts "src/app/api/cashflow/obra/[obra_id]/finalizar/route.ts"
git commit -m "feat(cotizador): contraste automático al finalizar obra → cotizador_lecciones"
```

---

### Task 13: Transiciones de estado (`estado.ts`) + API de cotizaciones

El gate del spec §6.4 en código puro y testeado: `aprobar`/`rechazar` SOLO desde `en_revision`, `emitir` SOLO desde `aprobada`. Las API routes son cáscaras finas sobre eso (patrón del repo: `createSupabaseAdminClient`, igual que `/api/finanzas`; el middleware ya exige sesión para llegar a `/api/*`). El rechazo SIEMPRE deja lección (`cotizador_lecciones` tipo `rechazo`). Las rutas de transición hacen el UPDATE con guard de estado **y verifican filas afectadas** (`.select()`): si el estado cambió entre el SELECT y el UPDATE, devuelven 409 — nunca un éxito fantasma. El `PATCH` del detalle setea `presupuesto_id` (vínculo cotización↔obra, la llave del loop de oro §6.2.5).

**Files:**
- Create: `src/lib/cotizador/estado.ts`
- Test: `src/lib/cotizador/__tests__/estado.test.ts`
- Create: `src/app/api/cotizaciones/route.ts` (la ruta quedó libre en Task 1)
- Create: `src/app/api/cotizaciones/[id]/route.ts`
- Create: `src/app/api/cotizaciones/[id]/aprobar/route.ts`
- Create: `src/app/api/cotizaciones/[id]/rechazar/route.ts`
- Create: `src/app/api/cotizaciones/[id]/emitir/route.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/cotizador/__tests__/estado.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aprobar, emitir, rechazar, TransicionInvalida } from "../estado";
import type { DatosDocumento, Revision } from "../tipos";

const REVISION: Revision = {
  checklist: [{ item: "flete", estado: "cubierto", detalle: "x" }],
  sanidad: [],
  precios_vencidos: [],
  divergencias: [],
  dudas: [],
};

const DOC: DatosDocumento = {
  cliente: "Lucila Lagomarsino",
  lugar: "Correa 3750",
  forma_pago: ["40% adelanto", "60% contra entrega"],
  plazo: ["5 días hábiles"],
  notas: ["VALIDEZ DE OFERTA: 10 DÍAS CORRIDOS"],
};

describe("aprobar", () => {
  it("solo desde en_revision; estampa fecha de aprobación", () => {
    const r = aprobar("en_revision", REVISION);
    expect(r.estado).toBe("aprobada");
    expect(r.revision.aprobacion!.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.revision.checklist).toEqual(REVISION.checklist); // no pisa la revisión
  });

  it("guarda el importe final si Eze lo fija", () => {
    const r = aprobar("en_revision", REVISION, 1500000);
    expect(r.revision.aprobacion!.importe_final).toBe(1500000);
  });

  it("rechaza la transición desde cualquier otro estado", () => {
    expect(() => aprobar("borrador", REVISION)).toThrow(TransicionInvalida);
    expect(() => aprobar("aprobada", REVISION)).toThrow(TransicionInvalida);
    expect(() => aprobar("rechazada", REVISION)).toThrow(TransicionInvalida);
  });

  it("tolera revision null (cotización insertada a mano)", () => {
    const r = aprobar("en_revision", null);
    expect(r.revision.aprobacion!.fecha).toBeTruthy();
  });
});

describe("rechazar", () => {
  it("solo desde en_revision y SIEMPRE con motivo (alimenta lecciones)", () => {
    expect(rechazar("en_revision", "MO de pintura muy cara para Pilar")).toEqual({
      estado: "rechazada",
      motivo_rechazo: "MO de pintura muy cara para Pilar",
    });
    expect(() => rechazar("en_revision", "   ")).toThrow(/motivo/);
    expect(() => rechazar("aprobada", "x")).toThrow(TransicionInvalida);
  });
});

describe("emitir", () => {
  it("solo desde aprobada; guarda los datos del documento en la revisión", () => {
    const r = emitir("aprobada", REVISION, DOC);
    expect(r.estado).toBe("documento_emitido");
    expect(r.revision.documento).toEqual(DOC);
  });

  it("exige cliente y lugar", () => {
    expect(() => emitir("aprobada", REVISION, { ...DOC, cliente: " " })).toThrow(/cliente/);
    expect(() => emitir("en_revision", REVISION, DOC)).toThrow(TransicionInvalida);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/cotizador/__tests__/estado.test.ts`
Expected: FAIL — "Cannot find module '../estado'".

- [ ] **Step 3: Implementar `src/lib/cotizador/estado.ts`**

```ts
import type { DatosDocumento, EstadoCotizacion, Revision } from "./tipos";

export class TransicionInvalida extends Error {
  constructor(desde: EstadoCotizacion, accion: string) {
    super(`No se puede ${accion} una cotización en estado "${desde}"`);
    this.name = "TransicionInvalida";
  }
}

const REVISION_VACIA: Revision = {
  checklist: [],
  sanidad: [],
  precios_vencidos: [],
  divergencias: [],
  dudas: [],
};

/**
 * Gate del spec §6.4: el OK es explícito y solo desde la mesa (en_revision).
 * Estados: borrador → en_revision → aprobada → documento_emitido | rechazada.
 */
export function aprobar(
  estado: EstadoCotizacion,
  revision: Revision | null,
  importeFinal?: number
): { estado: "aprobada"; revision: Revision } {
  if (estado !== "en_revision") throw new TransicionInvalida(estado, "aprobar");
  const base = revision ?? REVISION_VACIA;
  return {
    estado: "aprobada",
    revision: {
      ...base,
      aprobacion: {
        fecha: new Date().toISOString().slice(0, 10),
        ...(importeFinal != null && Number.isFinite(importeFinal) && importeFinal > 0
          ? { importe_final: importeFinal }
          : {}),
      },
    },
  };
}

export function rechazar(
  estado: EstadoCotizacion,
  motivo: string
): { estado: "rechazada"; motivo_rechazo: string } {
  if (estado !== "en_revision") throw new TransicionInvalida(estado, "rechazar");
  const limpio = motivo.trim();
  if (!limpio) {
    throw new Error("El rechazo necesita motivo: alimenta cotizador_lecciones (spec §6.4).");
  }
  return { estado: "rechazada", motivo_rechazo: limpio };
}

export function emitir(
  estado: EstadoCotizacion,
  revision: Revision | null,
  documento: DatosDocumento
): { estado: "documento_emitido"; revision: Revision } {
  if (estado !== "aprobada") throw new TransicionInvalida(estado, "emitir");
  if (!documento.cliente.trim()) throw new Error("El documento necesita cliente.");
  if (!documento.lugar.trim()) throw new Error("El documento necesita lugar.");
  const base = revision ?? REVISION_VACIA;
  return { estado: "documento_emitido", revision: { ...base, documento } };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/lib/cotizador/__tests__/estado.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Crear `src/app/api/cotizaciones/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ESTADOS = ["borrador", "en_revision", "aprobada", "rechazada", "documento_emitido"];

/** GET /api/cotizaciones[?estado=en_revision] — lista para el tablero. */
export async function GET(req: NextRequest) {
  const sb = createSupabaseAdminClient();
  const estado = req.nextUrl.searchParams.get("estado");
  let q = sb
    .from("cotizaciones")
    .select("id, creado_at, titulo, zona, estado, total_min, total_max, presupuesto_id, trabajo_id")
    .order("creado_at", { ascending: false })
    .limit(200);
  if (estado && ESTADOS.includes(estado)) q = q.eq("estado", estado);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cotizaciones: data ?? [] });
}

/**
 * POST /api/cotizaciones — crea una cotización desde el tablero (borrador o
 * en_revision si ya viene con desglose). El daemon NO usa esta ruta: inserta
 * directo por REST de Supabase (el middleware exige sesión para /api/*).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.titulo !== "string" || !body.titulo.trim()) {
    return NextResponse.json({ error: "titulo requerido" }, { status: 400 });
  }
  const estado = body.estado === "en_revision" ? "en_revision" : "borrador";
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("cotizaciones")
    .insert({
      titulo: body.titulo.trim(),
      zona: typeof body.zona === "string" ? body.zona : null,
      estado,
      receta_id: body.receta_id ?? null,
      trabajo_id: body.trabajo_id ?? null,
      presupuesto_id: body.presupuesto_id ?? null,
      ficha: body.ficha ?? {},
      desglose: body.desglose ?? {},
      revision: body.revision ?? null,
      total_min: typeof body.total_min === "number" ? body.total_min : null,
      total_max: typeof body.total_max === "number" ? body.total_max : null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
```

- [ ] **Step 6: Crear `src/app/api/cotizaciones/[id]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/cotizaciones/[id] — detalle completo + receta y presupuesto joineados (mesa de revisión). */
export async function GET(_req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("cotizaciones")
    .select(
      "*, receta:recetas(id, nombre, titulo, estado, fuentes, version), presupuesto:presupuestos(id, nombre_obra, nombre_cliente)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  return NextResponse.json({ cotizacion: data });
}

/**
 * PATCH /api/cotizaciones/[id] — vincular/desvincular la obra (presupuesto_id).
 * Es la llave del loop de oro (§6.2.5): sin presupuesto_id, el contraste al
 * finalizar la obra (Task 12) no encuentra la cotización. Se permite en
 * cualquier estado (el vínculo puede cargarse hasta antes de cerrar la obra).
 */
export async function PATCH(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as
    | { presupuesto_id?: string | null }
    | null;
  if (!body || !("presupuesto_id" in body)) {
    return NextResponse.json(
      { error: "presupuesto_id requerido (uuid del presupuesto, o null para desvincular)" },
      { status: 400 }
    );
  }
  const presupuestoId = body.presupuesto_id ?? null;
  if (presupuestoId !== null && typeof presupuestoId !== "string") {
    return NextResponse.json({ error: "presupuesto_id inválido" }, { status: 400 });
  }
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("cotizaciones")
    .update({ presupuesto_id: presupuestoId })
    .eq("id", id)
    .select("id"); // verificación de filas afectadas — sin .select() un update a id inexistente "pasa"
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, presupuesto_id: presupuestoId });
}
```

- [ ] **Step 7: Crear `src/app/api/cotizaciones/[id]/aprobar/route.ts`**

```ts
import { NextResponse } from "next/server";
import { aprobar, TransicionInvalida } from "@/lib/cotizador/estado";
import type { EstadoCotizacion, Revision } from "@/lib/cotizador/tipos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/cotizaciones/[id]/aprobar — el OK explícito de Eze (spec §6.4). */
export async function POST(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { importe_final?: number };
  const sb = createSupabaseAdminClient();

  const { data: cot, error: eGet } = await sb
    .from("cotizaciones")
    .select("id, estado, revision")
    .eq("id", id)
    .maybeSingle();
  if (eGet) return NextResponse.json({ error: eGet.message }, { status: 500 });
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  try {
    const cambio = aprobar(
      cot.estado as EstadoCotizacion,
      cot.revision as Revision | null,
      typeof body.importe_final === "number" ? body.importe_final : undefined
    );
    // Guard de carrera REAL: el .eq("estado") restringe el UPDATE y el .select()
    // verifica filas afectadas. 0 filas = el estado cambió entre el SELECT y el
    // UPDATE (doble click, otra pestaña, el bot) → 409, nunca éxito fantasma.
    const { data: upd, error } = await sb
      .from("cotizaciones")
      .update(cambio)
      .eq("id", id)
      .eq("estado", "en_revision")
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!upd || upd.length === 0) {
      return NextResponse.json(
        { error: "La cotización ya no está en revisión (cambió de estado) — recargá la mesa." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, estado: "aprobada" });
  } catch (e) {
    const status = e instanceof TransicionInvalida ? 409 : 400;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status }
    );
  }
}
```

- [ ] **Step 8: Crear `src/app/api/cotizaciones/[id]/rechazar/route.ts`**

```ts
import { NextResponse } from "next/server";
import { rechazar, TransicionInvalida } from "@/lib/cotizador/estado";
import type { Desglose, EstadoCotizacion } from "@/lib/cotizador/tipos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/cotizaciones/[id]/rechazar — rechazo con motivo → lección (spec §6.4). */
export async function POST(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { motivo?: string };
  const sb = createSupabaseAdminClient();

  const { data: cot, error: eGet } = await sb
    .from("cotizaciones")
    .select("id, estado, desglose")
    .eq("id", id)
    .maybeSingle();
  if (eGet) return NextResponse.json({ error: eGet.message }, { status: 500 });
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  try {
    const cambio = rechazar(cot.estado as EstadoCotizacion, String(body.motivo ?? ""));
    // Guard de carrera + verificación de filas afectadas (mismo patrón que aprobar).
    const { data: upd, error } = await sb
      .from("cotizaciones")
      .update(cambio)
      .eq("id", id)
      .eq("estado", "en_revision")
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!upd || upd.length === 0) {
      return NextResponse.json(
        { error: "La cotización ya no está en revisión (cambió de estado) — recargá la mesa." },
        { status: 409 }
      );
    }

    // El motivo alimenta el loop de mejora (cotizador_lecciones tipo rechazo).
    // Solo se inserta si el UPDATE realmente rechazó (estamos después del guard).
    const recetaNombre = (cot.desglose as Desglose | null)?.receta_nombre ?? null;
    const { error: eLec } = await sb.from("cotizador_lecciones").insert({
      tipo: "rechazo",
      receta_nombre: recetaNombre,
      cotizacion_id: id,
      leccion: cambio.motivo_rechazo,
      ajuste: null,
    });
    if (eLec) console.error("[rechazar] lección no insertada:", eLec.message);

    return NextResponse.json({ ok: true, estado: "rechazada" });
  } catch (e) {
    const status = e instanceof TransicionInvalida ? 409 : 400;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status }
    );
  }
}
```

- [ ] **Step 9: Crear `src/app/api/cotizaciones/[id]/emitir/route.ts`**

```ts
import { NextResponse } from "next/server";
import { emitir, TransicionInvalida } from "@/lib/cotizador/estado";
import type { DatosDocumento, EstadoCotizacion, Revision } from "@/lib/cotizador/tipos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function lineas(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") {
    return v.split("\n").map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

/** POST /api/cotizaciones/[id]/emitir — solo desde aprobada (spec §6.4). */
export async function POST(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const documento: DatosDocumento = {
    cliente: String(body.cliente ?? ""),
    lugar: String(body.lugar ?? ""),
    forma_pago: lineas(body.forma_pago),
    plazo: lineas(body.plazo),
    notas: lineas(body.notas),
  };
  const sb = createSupabaseAdminClient();

  const { data: cot, error: eGet } = await sb
    .from("cotizaciones")
    .select("id, estado, revision")
    .eq("id", id)
    .maybeSingle();
  if (eGet) return NextResponse.json({ error: eGet.message }, { status: 500 });
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  try {
    const cambio = emitir(
      cot.estado as EstadoCotizacion,
      cot.revision as Revision | null,
      documento
    );
    // Guard de carrera + verificación de filas afectadas (mismo patrón que aprobar).
    const { data: upd, error } = await sb
      .from("cotizaciones")
      .update(cambio)
      .eq("id", id)
      .eq("estado", "aprobada")
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!upd || upd.length === 0) {
      return NextResponse.json(
        { error: "La cotización ya no está aprobada (cambió de estado) — recargá la mesa." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, estado: "documento_emitido" });
  } catch (e) {
    const status = e instanceof TransicionInvalida ? 409 : 400;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status }
    );
  }
}
```

- [ ] **Step 10: Verificar que compila y que las rutas existen**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `ls src/app/api/cotizaciones src/app/api/cotizaciones/\[id\]`
Expected:
```
src/app/api/cotizaciones:
[id]	route.ts

src/app/api/cotizaciones/[id]:
aprobar	emitir	rechazar	route.ts
```

- [ ] **Step 11: Commit**

```bash
git add src/lib/cotizador/estado.ts src/lib/cotizador/__tests__/estado.test.ts src/app/api/cotizaciones
git commit -m "feat(cotizador): transiciones de estado con gate de mesa + API de cotizaciones"
```

---

### Task 14: Pantalla `/cotizaciones` (lista + estados)

Patrón del repo: `page.tsx` server mínimo + screen client (`"use client"`, fetch a la API, tokens `ravn-*` de `globals.css`, `VolverAlInicio`). El Frente B después la engancha en su carcasa/home; esta pantalla no depende de eso.

**Files:**
- Create: `src/app/cotizaciones/page.tsx`
- Create: `src/app/cotizaciones/cotizaciones-screen.tsx`

- [ ] **Step 1: Crear `src/app/cotizaciones/page.tsx`**

```tsx
import { CotizacionesScreen } from "./cotizaciones-screen";

export default function CotizacionesPage() {
  return <CotizacionesScreen />;
}
```

- [ ] **Step 2: Crear `src/app/cotizaciones/cotizaciones-screen.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { EstadoCotizacion } from "@/lib/cotizador/tipos";
import { formatMoneyInt } from "@/lib/format-currency";
import { VolverAlInicio } from "@/components/volver-al-inicio";

type CotizacionListada = {
  id: string;
  creado_at: string;
  titulo: string;
  zona: string | null;
  estado: EstadoCotizacion;
  total_min: number | null;
  total_max: number | null;
};

export const ESTADO_LABEL: Record<EstadoCotizacion, string> = {
  borrador: "Borrador",
  en_revision: "En revisión",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  documento_emitido: "Documento emitido",
};

export const ESTADO_COLOR: Record<EstadoCotizacion, string> = {
  borrador: "text-ravn-muted border-ravn-line",
  en_revision: "text-amber-300 border-amber-300/40",
  aprobada: "text-emerald-400 border-emerald-400/40",
  rechazada: "text-red-400 border-red-400/40",
  documento_emitido: "text-ravn-fg border-ravn-fg/40",
};

const FILTROS: Array<{ valor: EstadoCotizacion | "todas"; etiqueta: string }> = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "en_revision", etiqueta: "En revisión" },
  { valor: "aprobada", etiqueta: "Aprobadas" },
  { valor: "documento_emitido", etiqueta: "Emitidas" },
  { valor: "rechazada", etiqueta: "Rechazadas" },
  { valor: "borrador", etiqueta: "Borradores" },
];

function rangoTotal(c: CotizacionListada): string {
  if (c.total_min == null && c.total_max == null) return "—";
  if (c.total_min != null && c.total_max != null && c.total_min !== c.total_max) {
    return `${formatMoneyInt(c.total_min)} – ${formatMoneyInt(c.total_max)}`;
  }
  return formatMoneyInt(c.total_max ?? c.total_min ?? 0);
}

export function CotizacionesScreen() {
  const [cotizaciones, setCotizaciones] = useState<CotizacionListada[]>([]);
  const [filtro, setFiltro] = useState<EstadoCotizacion | "todas">("todas");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const qs = filtro === "todas" ? "" : `?estado=${filtro}`;
      const res = await fetch(`/api/cotizaciones${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al cargar");
      setCotizaciones(json.cotizaciones ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setCargando(false);
    }
  }, [filtro]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      <VolverAlInicio />
      <header className="mb-8 border-b border-ravn-line pb-4">
        <h1 className="text-2xl font-light uppercase tracking-[0.18em]">Cotizaciones</h1>
        <p className="mt-1 text-xs text-ravn-muted">
          Cotizador 2.0 — toda cotización pasa por la mesa de revisión antes del documento.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            onClick={() => setFiltro(f.valor)}
            className={`border px-3 py-1 text-[11px] uppercase tracking-[0.14em] transition-colors ${
              filtro === f.valor
                ? "border-ravn-fg text-ravn-fg"
                : "border-ravn-line text-ravn-muted hover:text-ravn-fg"
            }`}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {cargando ? (
        <p className="text-sm text-ravn-muted">Cargando…</p>
      ) : cotizaciones.length === 0 ? (
        <p className="text-sm text-ravn-muted">
          Sin cotizaciones acá. Llegan solas desde WhatsApp o la barra de comando
          (cola → daemon → mesa de revisión).
        </p>
      ) : (
        <ul className="divide-y divide-ravn-line border-t border-ravn-line">
          {cotizaciones.map((c) => (
            <li key={c.id}>
              <Link
                href={`/cotizaciones/${c.id}/revision`}
                className="flex items-center justify-between gap-4 px-2 py-4 transition-colors hover:bg-ravn-subtle"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.titulo}</p>
                  <p className="mt-0.5 text-xs text-ravn-muted">
                    {c.zona ? `${c.zona} · ` : ""}
                    {new Date(c.creado_at).toLocaleDateString("es-AR")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="text-sm tabular-nums">{rangoTotal(c)}</span>
                  <span
                    className={`border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${ESTADO_COLOR[c.estado]}`}
                  >
                    {ESTADO_LABEL[c.estado]}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Verificación visual rápida (opcional si el dev server está corriendo)**

Run: `npm run dev` y abrir `http://localhost:3000/cotizaciones` (logueado).
Expected: pantalla con título "Cotizaciones", filtros, y el empty state (todavía no hay filas).

- [ ] **Step 5: Commit**

```bash
git add src/app/cotizaciones/page.tsx src/app/cotizaciones/cotizaciones-screen.tsx
git commit -m "feat(cotizador): pantalla /cotizaciones — lista con estados y filtros"
```

---

### Task 15: Mesa de revisión `/cotizaciones/[id]/revision` (spec §6.4)

El gate obligatorio. Eze ve TODO: receta y su estado, fuentes con fecha, doble precio con divergencias >25% marcadas, fórmulas y cantidades, checklist, sanidad, precios vencidos y dudas. Acciones: **Aprobar** (importe final opcional), **Rechazar** (con motivo → lección) y, ya aprobada, **Emitir documento** (datos del documento oficial). Además incluye el **selector de obra vinculada** (combobox sobre `presupuestos`, opcional): persiste `presupuesto_id` vía `PATCH /api/cotizaciones/[id]` y habilita el loop de oro (§6.2.5) — sin vínculo, el contraste al finalizar la obra no corre para esa cotización. Las opciones del combobox se leen con el cliente Supabase del browser (patrón del repo, igual que `historial-screen.tsx`).

**Files:**
- Create: `src/app/cotizaciones/[id]/revision/page.tsx`
- Create: `src/app/cotizaciones/[id]/revision/revision-screen.tsx`

- [ ] **Step 1: Crear `src/app/cotizaciones/[id]/revision/page.tsx`**

```tsx
import { RevisionScreen } from "./revision-screen";

export default async function RevisionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RevisionScreen id={id} />;
}
```

- [ ] **Step 2: Crear `src/app/cotizaciones/[id]/revision/revision-screen.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  CotizacionRow,
  Desglose,
  FuenteReceta,
  PrecioFechado,
  Revision,
} from "@/lib/cotizador/tipos";
import { formatMoneyInt } from "@/lib/format-currency";
import { createClient } from "@/lib/supabase/client";
import { VolverAlInicio } from "@/components/volver-al-inicio";
import { ESTADO_COLOR, ESTADO_LABEL } from "../../cotizaciones-screen";

type RecetaJoin = {
  id: string;
  nombre: string;
  titulo: string;
  estado: "investigada" | "confiable";
  fuentes: FuenteReceta[];
  version: number;
} | null;

/** Opción del selector de obra (fila mínima de `presupuestos`). */
type PresupuestoOpcion = {
  id: string;
  nombre_obra: string | null;
  nombre_cliente: string | null;
};

type Detalle = CotizacionRow & {
  receta: RecetaJoin;
  presupuesto: PresupuestoOpcion | null;
};

function etiquetaPresupuesto(p: PresupuestoOpcion): string {
  const obra = p.nombre_obra?.trim() || "Sin nombre de obra";
  const cliente = p.nombre_cliente?.trim();
  return cliente ? `${obra} — ${cliente}` : obra;
}

const CHECK_COLOR: Record<string, string> = {
  cubierto: "text-emerald-400",
  ok: "text-emerald-400",
  faltante: "text-red-400",
  fuera_de_rango: "text-red-400",
  no_aplica: "text-ravn-muted",
  sin_datos: "text-amber-300",
};

const CHECK_ICONO: Record<string, string> = {
  cubierto: "✓",
  ok: "✓",
  faltante: "✗",
  fuera_de_rango: "✗",
  no_aplica: "—",
  sin_datos: "?",
};

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-ravn-muted">
        {titulo}
      </h2>
      <div className="border-t border-ravn-line pt-3">{children}</div>
    </section>
  );
}

function PrecioCelda({ precio }: { precio?: PrecioFechado }) {
  if (!precio) return <span className="text-ravn-muted">—</span>;
  return (
    <span title={`${precio.fuente} · ${precio.fecha}`}>
      {formatMoneyInt(precio.valor)}
      <span className="block text-[10px] text-ravn-muted">
        {precio.fuente} · {precio.fecha}
      </span>
    </span>
  );
}

export function RevisionScreen({ id }: { id: string }) {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [importeFinal, setImporteFinal] = useState("");
  const [motivo, setMotivo] = useState("");
  const [mostrarRechazo, setMostrarRechazo] = useState(false);

  const [docCliente, setDocCliente] = useState("");
  const [docLugar, setDocLugar] = useState("");
  const [docFormaPago, setDocFormaPago] = useState("");
  const [docPlazo, setDocPlazo] = useState("");
  const [docNotas, setDocNotas] = useState("VALIDEZ DE OFERTA: 10 DÍAS CORRIDOS");

  // Selector de obra (loop de oro §6.2.5): opciones desde `presupuestos`.
  const [presupuestos, setPresupuestos] = useState<PresupuestoOpcion[]>([]);
  const [vinculando, setVinculando] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("presupuestos")
      .select("id, nombre_obra, nombre_cliente, fecha")
      .order("fecha", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setPresupuestos((data as PresupuestoOpcion[] | null) ?? []);
      });
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cotizaciones/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al cargar");
      setDetalle(json.cotizacion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function accion(path: string, body: Record<string, unknown>) {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cotizaciones/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setEnviando(false);
    }
  }

  async function vincularObra(presupuestoId: string) {
    setVinculando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cotizaciones/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presupuesto_id: presupuestoId || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al vincular la obra");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al vincular la obra");
    } finally {
      setVinculando(false);
    }
  }

  if (cargando) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
        <VolverAlInicio />
        <p className="text-sm text-ravn-muted">Cargando…</p>
      </main>
    );
  }
  if (!detalle) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
        <VolverAlInicio />
        <p className="text-sm text-red-400">{error ?? "Cotización no encontrada."}</p>
      </main>
    );
  }

  const desglose =
    detalle.desglose && "items" in detalle.desglose ? (detalle.desglose as Desglose) : null;
  const revision = (detalle.revision ?? null) as Revision | null;
  const receta = detalle.receta;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      <VolverAlInicio />

      <header className="mb-8 border-b border-ravn-line pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-ravn-muted">
              Mesa de revisión
            </p>
            <h1 className="mt-1 text-2xl font-light">{detalle.titulo}</h1>
            <p className="mt-1 text-xs text-ravn-muted">
              {detalle.zona ? `${detalle.zona} · ` : ""}
              {new Date(detalle.creado_at).toLocaleDateString("es-AR")}
            </p>
          </div>
          <span
            className={`border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${ESTADO_COLOR[detalle.estado]}`}
          >
            {ESTADO_LABEL[detalle.estado]}
          </span>
        </div>
        {detalle.total_min != null && detalle.total_max != null && (
          <p className="mt-4 text-3xl font-light tabular-nums">
            {formatMoneyInt(detalle.total_min)} – {formatMoneyInt(detalle.total_max)}
          </p>
        )}
      </header>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {receta && (
        <Seccion titulo="Receta">
          <p className="text-sm">
            {receta.titulo}{" "}
            <span className="text-xs text-ravn-muted">
              ({receta.nombre} · v{receta.version})
            </span>
          </p>
          {receta.estado === "investigada" ? (
            <p className="mt-2 border border-amber-300/40 px-3 py-2 text-xs text-amber-300">
              RECETA INVESTIGADA — sin validar en obra todavía. Revisá las fuentes con más
              dureza (protocolo &quot;Seia no lo tiene&quot;, spec §6.3).
            </p>
          ) : (
            <p className="mt-2 text-xs text-emerald-400">Receta confiable (validada en obra).</p>
          )}
          {Array.isArray(receta.fuentes) && receta.fuentes.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-ravn-muted">
              {receta.fuentes.map((f, i) => (
                <li key={i}>
                  [{f.tipo}] {f.titulo} · {f.fecha}
                  {f.url ? ` · ${f.url}` : ""}
                </li>
              ))}
            </ul>
          )}
        </Seccion>
      )}

      {desglose && (
        <Seccion titulo="Ítems — cantidades por fórmula y doble precio">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.14em] text-ravn-muted">
                  <th className="py-2 pr-3">Etapa</th>
                  <th className="py-2 pr-3">Ítem</th>
                  <th className="py-2 pr-3">Fórmula</th>
                  <th className="py-2 pr-3 text-right">Cant.</th>
                  <th className="py-2 pr-3 text-right">SISMAT</th>
                  <th className="py-2 pr-3 text-right">Internet</th>
                  <th className="py-2 pr-3 text-right">Δ%</th>
                  <th className="py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ravn-line">
                {desglose.items.map((it, i) => {
                  const divergente = it.divergencia_pct != null && it.divergencia_pct > 25;
                  return (
                    <tr key={i} className={divergente ? "bg-red-400/5" : undefined}>
                      <td className="py-2 pr-3 text-ravn-muted">{it.etapa}</td>
                      <td className="py-2 pr-3">
                        {it.nombre}
                        {it.sin_precio && (
                          <span className="ml-1 text-[10px] text-amber-300">SIN PRECIO</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono text-[10px] text-ravn-muted">
                        {it.formula}
                        {it.desperdicio_pct > 0 ? ` +${it.desperdicio_pct}% desp.` : ""}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {it.cantidad} {it.unidad}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        <PrecioCelda precio={it.precios.sismat} />
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        <PrecioCelda precio={it.precios.internet} />
                      </td>
                      <td
                        className={`py-2 pr-3 text-right tabular-nums ${divergente ? "font-semibold text-red-400" : "text-ravn-muted"}`}
                      >
                        {it.divergencia_pct != null ? `${it.divergencia_pct}%` : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {it.sin_precio
                          ? "—"
                          : `${formatMoneyInt(it.subtotal_min)} – ${formatMoneyInt(it.subtotal_max)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {desglose.extras.length > 0 && (
            <ul className="mt-4 space-y-1 text-xs">
              {desglose.extras.map((ex, i) => (
                <li key={i} className="flex justify-between">
                  <span>
                    {ex.nombre}{" "}
                    <span className="text-ravn-muted">
                      ({ex.fuente} · {ex.fecha})
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {formatMoneyInt(ex.monto_min)} – {formatMoneyInt(ex.monto_max)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-4 space-y-1 border-t border-ravn-line pt-3 text-xs">
            <div className="flex justify-between">
              <dt className="text-ravn-muted">Materiales</dt>
              <dd className="tabular-nums">
                {formatMoneyInt(desglose.totales.materiales_min)} –{" "}
                {formatMoneyInt(desglose.totales.materiales_max)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ravn-muted">Mano de obra</dt>
              <dd className="tabular-nums">
                {formatMoneyInt(desglose.totales.mano_de_obra_min)} –{" "}
                {formatMoneyInt(desglose.totales.mano_de_obra_max)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ravn-muted">Extras</dt>
              <dd className="tabular-nums">
                {formatMoneyInt(desglose.totales.extras_min)} –{" "}
                {formatMoneyInt(desglose.totales.extras_max)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ravn-muted">
                Imprevistos {desglose.totales.imprevistos_pct}% · Factor zona{" "}
                {desglose.totales.factor_zona_min}–{desglose.totales.factor_zona_max}
              </dt>
              <dd className="font-medium tabular-nums">
                {formatMoneyInt(desglose.totales.total_min)} –{" "}
                {formatMoneyInt(desglose.totales.total_max)}
              </dd>
            </div>
            <div className="flex justify-between text-ravn-muted">
              <dt>Tiempo estimado</dt>
              <dd>
                {desglose.tiempo.dias_min}–{desglose.tiempo.dias_max} días ·{" "}
                {desglose.tiempo.cuadrilla_max} persona(s)
              </dd>
            </div>
          </dl>
        </Seccion>
      )}

      {revision && (
        <>
          <Seccion titulo="Checklist anti-olvidos">
            <ul className="space-y-1 text-xs">
              {revision.checklist.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span className={CHECK_COLOR[c.estado]}>{CHECK_ICONO[c.estado]}</span>
                  <span className="font-medium">{c.item}</span>
                  <span className="text-ravn-muted">— {c.detalle}</span>
                </li>
              ))}
            </ul>
          </Seccion>

          <Seccion titulo="Sanidad física">
            <ul className="space-y-1 text-xs">
              {revision.sanidad.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className={CHECK_COLOR[s.estado]}>{CHECK_ICONO[s.estado]}</span>
                  <span className="font-medium">{s.chequeo}</span>
                  <span className="text-ravn-muted">— {s.detalle}</span>
                </li>
              ))}
            </ul>
          </Seccion>

          {revision.precios_vencidos.length > 0 && (
            <Seccion titulo="Precios vencidos">
              <ul className="space-y-1 text-xs text-amber-300">
                {revision.precios_vencidos.map((v, i) => (
                  <li key={i}>
                    {v.item} — {v.fuente} del {v.fecha} ({v.dias} días; límite {v.limite}d).
                    Re-buscar antes de aprobar.
                  </li>
                ))}
              </ul>
            </Seccion>
          )}

          {revision.dudas.length > 0 && (
            <Seccion titulo="Dudas abiertas del sistema">
              <ul className="list-inside list-disc space-y-1 text-xs">
                {revision.dudas.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </Seccion>
          )}
        </>
      )}

      <Seccion titulo="Obra vinculada — loop de oro">
        <p className="mb-2 text-xs text-ravn-muted">
          Vinculá la cotización a la obra (presupuesto) para que, al finalizarla, el
          contraste cotizado vs gastado real deje su lección (spec §6.2.5). Es opcional,
          pero sin vínculo el loop de oro no corre para esta cotización.
        </p>
        <select
          value={detalle.presupuesto_id ?? ""}
          disabled={vinculando}
          onChange={(e) => void vincularObra(e.target.value)}
          className="block w-full max-w-md border border-ravn-line bg-transparent px-3 py-2 text-sm text-ravn-fg disabled:opacity-50"
        >
          <option value="">— sin obra vinculada —</option>
          {presupuestos.map((p) => (
            <option key={p.id} value={p.id}>
              {etiquetaPresupuesto(p)}
            </option>
          ))}
        </select>
        {detalle.presupuesto ? (
          <p className="mt-2 text-xs text-emerald-400">
            Vinculada a: {etiquetaPresupuesto(detalle.presupuesto)}
          </p>
        ) : (
          <p className="mt-2 text-xs text-amber-300">
            Sin obra vinculada — el contraste al cerrar obra NO va a correr para esta
            cotización.
          </p>
        )}
      </Seccion>

      {detalle.estado === "en_revision" && (
        <Seccion titulo="Decisión">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-ravn-muted">
              Importe final (opcional, ARS)
              <input
                value={importeFinal}
                onChange={(e) => setImporteFinal(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                placeholder={detalle.total_max != null ? String(detalle.total_max) : ""}
                className="mt-1 block w-44 border border-ravn-line bg-transparent px-3 py-2 text-sm text-ravn-fg"
              />
            </label>
            <button
              disabled={enviando}
              onClick={() =>
                void accion("aprobar", {
                  importe_final: importeFinal ? Number(importeFinal) : undefined,
                })
              }
              className="border border-emerald-400/60 px-4 py-2 text-xs uppercase tracking-[0.14em] text-emerald-400 transition-colors hover:bg-emerald-400/10 disabled:opacity-50"
            >
              Aprobar
            </button>
            <button
              disabled={enviando}
              onClick={() => setMostrarRechazo((v) => !v)}
              className="border border-red-400/60 px-4 py-2 text-xs uppercase tracking-[0.14em] text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-50"
            >
              Rechazar…
            </button>
          </div>
          {mostrarRechazo && (
            <div className="mt-4">
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                placeholder="Motivo del rechazo (va a cotizador_lecciones — sé concreto)"
                className="block w-full border border-ravn-line bg-transparent px-3 py-2 text-sm text-ravn-fg"
              />
              <button
                disabled={enviando || !motivo.trim()}
                onClick={() => void accion("rechazar", { motivo })}
                className="mt-2 border border-red-400/60 px-4 py-2 text-xs uppercase tracking-[0.14em] text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-50"
              >
                Confirmar rechazo
              </button>
            </div>
          )}
        </Seccion>
      )}

      {detalle.estado === "aprobada" && (
        <Seccion titulo="Emitir documento oficial">
          <p className="mb-3 text-xs text-ravn-muted">
            Aprobada el {revision?.aprobacion?.fecha ?? "—"}
            {revision?.aprobacion?.importe_final != null
              ? ` · importe final ${formatMoneyInt(revision.aprobacion.importe_final)}`
              : ""}
            . Completá los datos del documento (formato Presupuesto oficial).
          </p>
          <div className="grid max-w-xl gap-3 text-xs">
            <label className="text-ravn-muted">
              Cliente
              <input
                value={docCliente}
                onChange={(e) => setDocCliente(e.target.value)}
                className="mt-1 block w-full border border-ravn-line bg-transparent px-3 py-2 text-sm text-ravn-fg"
              />
            </label>
            <label className="text-ravn-muted">
              Lugar
              <input
                value={docLugar}
                onChange={(e) => setDocLugar(e.target.value)}
                className="mt-1 block w-full border border-ravn-line bg-transparent px-3 py-2 text-sm text-ravn-fg"
              />
            </label>
            <label className="text-ravn-muted">
              Forma de pago (una línea por renglón)
              <textarea
                value={docFormaPago}
                onChange={(e) => setDocFormaPago(e.target.value)}
                rows={3}
                className="mt-1 block w-full border border-ravn-line bg-transparent px-3 py-2 text-sm text-ravn-fg"
              />
            </label>
            <label className="text-ravn-muted">
              Plazo (una línea por renglón)
              <textarea
                value={docPlazo}
                onChange={(e) => setDocPlazo(e.target.value)}
                rows={2}
                className="mt-1 block w-full border border-ravn-line bg-transparent px-3 py-2 text-sm text-ravn-fg"
              />
            </label>
            <label className="text-ravn-muted">
              Notas (una línea por renglón)
              <textarea
                value={docNotas}
                onChange={(e) => setDocNotas(e.target.value)}
                rows={2}
                className="mt-1 block w-full border border-ravn-line bg-transparent px-3 py-2 text-sm text-ravn-fg"
              />
            </label>
            <button
              disabled={enviando || !docCliente.trim() || !docLugar.trim()}
              onClick={() =>
                void accion("emitir", {
                  cliente: docCliente,
                  lugar: docLugar,
                  forma_pago: docFormaPago,
                  plazo: docPlazo,
                  notas: docNotas,
                })
              }
              className="w-fit border border-ravn-fg px-4 py-2 text-xs uppercase tracking-[0.14em] transition-colors hover:bg-ravn-subtle disabled:opacity-50"
            >
              Emitir documento
            </button>
          </div>
        </Seccion>
      )}

      {detalle.estado === "documento_emitido" && (
        <Seccion titulo="Documento">
          <Link
            href={`/cotizaciones/${id}/documento`}
            className="border border-ravn-fg px-4 py-2 text-xs uppercase tracking-[0.14em] transition-colors hover:bg-ravn-subtle"
          >
            Ver documento oficial →
          </Link>
        </Seccion>
      )}

      {detalle.estado === "rechazada" && (
        <Seccion titulo="Rechazada">
          <p className="text-xs text-red-400">
            Motivo: {detalle.motivo_rechazo ?? "—"} (quedó como lección en cotizador_lecciones)
          </p>
        </Seccion>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores. (Si TypeScript se queja del import de `ESTADO_LABEL`/`ESTADO_COLOR` desde la screen de la lista, revisá que en Task 14 hayan quedado con `export`.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/cotizaciones/[id]/revision"
git commit -m "feat(cotizador): mesa de revisión — el gate obligatorio del spec §6.4"
```

---

### Task 16: Documento oficial `/cotizaciones/[id]/documento`

El documento final con el formato Presupuesto oficial (template negro A4 — base `diagnosticos/Presupuesto_Lagomarsino.html`, memoria `ravn-presupuesto-formato`). Server component: solo renderiza si `estado = documento_emitido`. El PDF se imprime desde el navegador logueado (Cmd+P → Guardar como PDF; el CSS `@page` A4 ya está). Chrome headless NO sirve acá: el middleware de login lo rebota.

**Files:**
- Create: `src/app/cotizaciones/[id]/documento/page.tsx`

- [ ] **Step 1: Crear `src/app/cotizaciones/[id]/documento/page.tsx`**

```tsx
import Link from "next/link";
import type { CotizacionRow, Desglose, ItemDesglose, Revision } from "@/lib/cotizador/tipos";
import { importeALetrasEs } from "@/lib/numero-a-letras-importe";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// CSS del formato Presupuesto oficial (base: diagnosticos/Presupuesto_Lagomarsino.html).
const CSS = `
.doc-root { --bg:#1c1c1a; --fg:#f2efe8; --muted:rgba(242,239,232,0.48); --line:rgba(242,239,232,0.18); background:#111; font-family:'Raleway',sans-serif; -webkit-font-smoothing:antialiased; color:var(--fg); min-height:100vh; padding:8mm 0; }
.doc-root * { box-sizing:border-box; margin:0; padding:0; }
.doc-page { background:var(--bg); width:210mm; min-height:297mm; padding:14mm 16mm; margin:0 auto 4mm; display:flex; flex-direction:column; position:relative; overflow:hidden; }
.doc-header { display:flex; justify-content:flex-end; margin-bottom:10mm; }
.doc-brand { font-weight:300; font-size:15pt; letter-spacing:0.28em; padding-right:0.28em; text-transform:uppercase; }
.doc-title { font-weight:300; font-size:48pt; line-height:1.05; margin-bottom:9mm; }
.doc-meta { display:grid; grid-template-columns:20mm 1fr; gap:1.5mm 0; margin-bottom:9mm; }
.doc-meta-label { font-size:8.5pt; font-weight:400; color:var(--muted); letter-spacing:0.04em; padding-top:0.5mm; }
.doc-meta-value { font-size:9.5pt; font-weight:400; letter-spacing:0.01em; }
.doc-section-title { font-size:13pt; font-weight:300; margin-bottom:2mm; }
.doc-rule { height:0.3pt; background:var(--line); margin-bottom:7mm; }
.doc-body { font-size:9pt; font-weight:300; line-height:1.72; color:rgba(242,239,232,0.82); flex:1; }
.doc-body p { margin-bottom:4.5mm; }
.doc-etapa { font-size:8pt; font-weight:600; letter-spacing:0.18em; text-transform:uppercase; color:var(--muted); margin:5mm 0 3mm; }
.doc-item-title { font-size:9pt; font-weight:600; margin-bottom:1.5mm; }
.doc-importe-number { font-size:48pt; font-weight:200; letter-spacing:-0.02em; line-height:1; margin:3mm 0 2mm; font-variant-numeric:tabular-nums; }
.doc-importe-letras { font-size:7.5pt; font-weight:400; letter-spacing:0.2em; text-transform:uppercase; color:var(--muted); margin-bottom:4mm; }
.doc-importe-nota { font-size:8pt; font-weight:300; color:rgba(242,239,232,0.55); line-height:1.6; }
.doc-p2-section { margin-bottom:7mm; }
.doc-p2-text { font-size:8.5pt; font-weight:300; color:rgba(242,239,232,0.75); line-height:1.68; }
.doc-p2-text p { margin-bottom:2mm; }
.doc-footer { margin-top:auto; padding-top:6mm; border-top:0.3pt solid var(--line); display:flex; justify-content:space-between; align-items:flex-end; font-size:8pt; font-weight:300; color:rgba(242,239,232,0.7); }
.doc-aviso { max-width:210mm; margin:0 auto 4mm; font-size:11px; color:rgba(242,239,232,0.6); text-align:center; }
@media print {
  @page { size: A4; margin: 0; }
  .doc-root { background:var(--bg); padding:0; }
  .doc-page { margin:0; page-break-after:always; }
  .doc-page:last-child { page-break-after:avoid; }
  .doc-aviso { display:none; }
}
`;

type Params = { params: Promise<{ id: string }> };

export default async function DocumentoPage({ params }: Params) {
  const { id } = await params;
  const sb = createSupabaseAdminClient();
  const { data } = await sb.from("cotizaciones").select("*").eq("id", id).maybeSingle();

  if (!data) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-sm text-ravn-muted">
        Cotización no encontrada. <Link href="/cotizaciones" className="underline">Volver</Link>
      </main>
    );
  }

  const cot = data as unknown as CotizacionRow;
  const revision = (cot.revision ?? null) as Revision | null;

  if (cot.estado !== "documento_emitido" || !revision?.documento) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-sm text-ravn-muted">
        El documento se genera después de aprobar y emitir desde la{" "}
        <Link href={`/cotizaciones/${id}/revision`} className="underline">
          mesa de revisión
        </Link>
        . Estado actual: {cot.estado}.
      </main>
    );
  }

  const desglose =
    cot.desglose && "items" in cot.desglose ? (cot.desglose as Desglose) : null;
  const doc = revision.documento;
  const importe = revision.aprobacion?.importe_final ?? cot.total_max ?? cot.total_min ?? 0;
  const fecha = new Date(
    revision.aprobacion?.fecha ? `${revision.aprobacion.fecha}T12:00:00` : cot.creado_at
  ).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });

  // Agrupar ítems por etapa, preservando el orden del desglose.
  const etapas: Array<{ nombre: string; items: ItemDesglose[] }> = [];
  for (const it of desglose?.items ?? []) {
    const ultima = etapas[etapas.length - 1];
    if (ultima && ultima.nombre === it.etapa) ultima.items.push(it);
    else etapas.push({ nombre: it.etapa, items: [it] });
  }

  return (
    <div className="doc-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <p className="doc-aviso">
        Para el PDF: Cmd+P → Guardar como PDF (A4, sin márgenes). ·{" "}
        <Link href={`/cotizaciones/${id}/revision`} style={{ textDecoration: "underline" }}>
          volver a la mesa
        </Link>
      </p>

      {/* ── PÁGINA 1: servicios ── */}
      <div className="doc-page">
        <div className="doc-header">
          <span className="doc-brand">R&nbsp;A&nbsp;V&nbsp;N&nbsp;.</span>
        </div>
        <div className="doc-title">Propuesta</div>
        <div className="doc-meta">
          <span className="doc-meta-label">Cliente</span>
          <span className="doc-meta-value">{doc.cliente}</span>
          <span className="doc-meta-label">Fecha</span>
          <span className="doc-meta-value">{fecha}</span>
          <span className="doc-meta-label">Lugar</span>
          <span className="doc-meta-value">{doc.lugar}</span>
        </div>
        <div className="doc-section-title">Servicios Presupuestados</div>
        <div className="doc-rule" />
        <div className="doc-body">
          <p className="doc-item-title">{cot.titulo}</p>
          {etapas.map((etapa, i) => (
            <div key={i}>
              <div className="doc-etapa">
                Etapa {i + 1} — {etapa.nombre}
              </div>
              <p>
                {etapa.items
                  .map((it) =>
                    it.tipo === "mano_de_obra"
                      ? it.nombre
                      : `${it.nombre} (${it.cantidad} ${it.unidad})`
                  )
                  .join(". ")}
                .
              </p>
            </div>
          ))}
        </div>
        <div className="doc-footer">
          <span>ravnconstrucciones.com.ar · 11 7385-6263</span>
          <span className="doc-brand" style={{ fontSize: "11pt" }}>
            R&nbsp;A&nbsp;V&nbsp;N&nbsp;.
          </span>
        </div>
      </div>

      {/* ── PÁGINA 2: importe, pago, plazo, notas ── */}
      <div className="doc-page">
        <div className="doc-header">
          <span className="doc-brand">R&nbsp;A&nbsp;V&nbsp;N&nbsp;.</span>
        </div>
        <div className="doc-p2-section">
          <div className="doc-section-title">Importe</div>
          <div className="doc-rule" />
          <div className="doc-importe-number">
            ${Math.round(importe).toLocaleString("es-AR")}
          </div>
          <div className="doc-importe-letras">{importeALetrasEs(importe, "ARS")}</div>
          <div className="doc-importe-nota">
            Incluye materiales y mano de obra. El presupuesto no contempla el Impuesto al
            Valor Agregado (IVA).
          </div>
        </div>
        {doc.forma_pago.length > 0 && (
          <div className="doc-p2-section">
            <div className="doc-section-title">Forma de Pago</div>
            <div className="doc-rule" />
            <div className="doc-p2-text">
              {doc.forma_pago.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          </div>
        )}
        {doc.plazo.length > 0 && (
          <div className="doc-p2-section">
            <div className="doc-section-title">Plazo</div>
            <div className="doc-rule" />
            <div className="doc-p2-text">
              {doc.plazo.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          </div>
        )}
        {doc.notas.length > 0 && (
          <div className="doc-p2-section">
            <div className="doc-section-title">Notas</div>
            <div className="doc-rule" />
            <div className="doc-p2-text">
              {doc.notas.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          </div>
        )}
        <div className="doc-footer">
          <span>contacto@ravnconstrucciones.com.ar</span>
          <span className="doc-brand" style={{ fontSize: "11pt" }}>
            R&nbsp;A&nbsp;V&nbsp;N&nbsp;.
          </span>
        </div>
      </div>
    </div>
  );
}
```

> El texto de servicios sale del desglose (etapas + ítems con cantidades, sin precios unitarios — el cliente ve UN importe, como en el formato oficial). Para un documento con prosa redactada a medida (estilo Lagomarsino), Eze lo pide como trabajo `redactar` y el daemon lo escribe con el template; esta página es la emisión directa estándar.

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/cotizaciones/[id]/documento/page.tsx"
git commit -m "feat(cotizador): documento oficial A4 print-ready (solo tras emitir)"
```

---

### Task 17: Usuario auth dedicado del daemon + receta semilla

El bot NO puede tocar `cotizaciones`/`recetas`/`cotizador_lecciones` (policies `not es_bot()` del plan A — a propósito). El daemon necesita su PROPIO usuario auth: al no ser el `bot_email` de `seguridad_config`, pasa todas las policies de `authenticated` sin migración nueva. Acá se crea el usuario, se guardan las credenciales en `~/.ravn-cotizador/.env`, se verifica la RLS punta a punta y se siembra una receta de ejemplo (`pintura-interior`, estado `investigada`) para que el sistema tenga una receta real desde el día uno.

**Requiere:** plan A ejecutado (tablas + `es_bot()` + `bot_email` sembrado — Tareas 14 y 15 del plan A).

**Files:** ninguno en el repo (config operativa + verificación REST).

> **Steps auto-contenidos:** cada step re-deriva sus variables (shell nueva por step). La password generada en el Step 1 se crea Y se persiste en el MISMO bloque — nunca cruza de shell.

- [ ] **Step 1: Crear el usuario daemon y guardar las credenciales (un solo bloque, misma shell)**

```bash
cd /Users/ezeotero/Documents/ravn
set -a; source .env.local; set +a

DAEMON_EMAIL="daemon@ravn.local"
if grep -q '^DAEMON_PASSWORD=' /Users/ezeotero/.ravn-cotizador/.env; then
  echo "credenciales ya guardadas — no se regeneran"
else
  DAEMON_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)
  test -n "$DAEMON_PASSWORD" || { echo "ERROR: password vacía — no se guarda nada"; exit 1; }
  curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/users" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$DAEMON_EMAIL\",\"password\":\"$DAEMON_PASSWORD\",\"email_confirm\":true}" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('email') or d.get('msg') or d)"
  printf 'DAEMON_EMAIL=%s\nDAEMON_PASSWORD=%s\n' "$DAEMON_EMAIL" "$DAEMON_PASSWORD" \
    >> /Users/ezeotero/.ravn-cotizador/.env
fi
grep -c '^DAEMON_' /Users/ezeotero/.ravn-cotizador/.env
```

Expected: `daemon@ravn.local` (primera corrida) y `2`. Si el curl dice que el usuario ya existe (`A user with this email address has already been registered`) pero el `.env` NO tiene `DAEMON_PASSWORD`: reseteale la password desde Dashboard → Authentication → Users y agregá las dos líneas `DAEMON_EMAIL=`/`DAEMON_PASSWORD=` a mano en `/Users/ezeotero/.ravn-cotizador/.env`.

- [ ] **Step 2: Login del daemon y verificación de acceso a las tablas del cotizador**

```bash
cd /Users/ezeotero/Documents/ravn
set -a; source .env.local; set +a
DAEMON_EMAIL=$(grep '^DAEMON_EMAIL=' /Users/ezeotero/.ravn-cotizador/.env | cut -d= -f2-)
DAEMON_PASSWORD=$(grep '^DAEMON_PASSWORD=' /Users/ezeotero/.ravn-cotizador/.env | cut -d= -f2-)

DAEMON_TOKEN=$(curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$DAEMON_EMAIL\",\"password\":\"$DAEMON_PASSWORD\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))")
echo "token daemon: ${DAEMON_TOKEN:+ok}"

# El daemon PUEDE insertar cotizaciones (la policy es `not es_bot()` y él no es el bot):
curl -s -o /dev/null -w 'insert cotizaciones: %{http_code}\n' -X POST \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/cotizaciones" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $DAEMON_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"titulo":"prueba RLS daemon","estado":"borrador"}'
```

Expected: `token daemon: ok` y `insert cotizaciones: 201`. Si el token no sale (`token daemon: `), revisá las dos líneas `DAEMON_*` del `.env` del daemon (Step 1).

- [ ] **Step 3: El BOT sigue sin poder tocar cotizaciones (contraprueba)**

```bash
cd /Users/ezeotero/Documents/ravn
set -a; source .env.local; set +a
BOT_EMAIL=$(grep '^BOT_EMAIL=' /Users/ezeotero/.ravn-cotizador/.env | cut -d= -f2-)
BOT_PASSWORD=$(grep '^BOT_PASSWORD=' /Users/ezeotero/.ravn-cotizador/.env | cut -d= -f2-)
BOT_TOKEN=$(curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$BOT_EMAIL\",\"password\":\"$BOT_PASSWORD\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))")

curl -s -o /dev/null -w 'insert cotizaciones (bot): %{http_code}\n' -X POST \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/cotizaciones" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"titulo":"no deberia entrar","estado":"borrador"}'
```

Expected: `insert cotizaciones (bot): 403`. (Si da 201, `seguridad_config.bot_email` no está sembrado — Tarea 15 del plan A.)

- [ ] **Step 4: Limpiar la fila de prueba**

```bash
cd /Users/ezeotero/Documents/ravn
set -a; source .env.local; set +a
curl -s -o /dev/null -w 'cleanup: %{http_code}\n' -X DELETE \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/cotizaciones?titulo=eq.prueba%20RLS%20daemon" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: `cleanup: 204`.

- [ ] **Step 5: Sembrar la receta `pintura-interior` (semilla, estado investigada)**

> Fórmulas y desperdicios armados con el criterio de las memorias de obra (secuencia pintura: fijador ANTES del masillado, UN solo fijador, sin prometer cantidad de manos al cliente). Es una semilla `investigada`: el skill la va a refinar y el contraste con obra real la promueve a `confiable`. Validar los números con Eze antes de usarla en una cotización real.

```bash
cat > /tmp/receta-pintura-interior.json <<'EOF'
{
  "nombre": "pintura-interior",
  "titulo": "Pintura interior completa (paredes)",
  "estado": "investigada",
  "version": 1,
  "parametros": [
    { "nombre": "superficie_m2", "etiqueta": "Superficie a pintar (m²)", "tipo": "numero", "requerido": true },
    { "nombre": "calidad", "etiqueta": "Calidad esperada", "tipo": "opcion", "requerido": false, "opciones": ["estandar", "premium"] }
  ],
  "etapas": [
    {
      "nombre": "Preparación de superficie",
      "orden": 1,
      "dias_min": 1,
      "dias_max": 2,
      "cuadrilla": 2,
      "items": [
        { "nombre": "Fijador al agua 10L", "tipo": "material", "unidad": "u", "formula": "ceil(superficie_m2 / 100)", "desperdicio_pct": 5, "notas": "UN solo fijador, antes del masillado (memoria secuencia pintura)" },
        { "nombre": "Enduido plastico interior 20kg", "tipo": "material", "unidad": "u", "formula": "ceil(superficie_m2 / 40)", "desperdicio_pct": 10, "notas": "masillado de imperfecciones; consumo segun estado de la pared" },
        { "nombre": "Lija al agua grano 180", "tipo": "material", "unidad": "u", "formula": "ceil(superficie_m2 / 20)" },
        { "nombre": "Cinta de papel 36mm", "tipo": "material", "unidad": "rollo", "formula": "ceil(superficie_m2 / 50)" }
      ]
    },
    {
      "nombre": "Pintura",
      "orden": 2,
      "dias_min": 2,
      "dias_max": 3,
      "cuadrilla": 2,
      "items": [
        { "nombre": "Latex interior 20L", "tipo": "material", "unidad": "u", "formula": "ceil(superficie_m2 * 2 / 160)", "desperdicio_pct": 10, "rango_fisico": { "parametro": "superficie_m2", "min": 0.008, "max": 0.03 }, "notas": "consumo total de las manos correspondientes (~8 m²/L por mano); al cliente NUNCA se le promete cantidad de manos" },
        { "nombre": "Pintura interior por m2 (mano de obra)", "tipo": "mano_de_obra", "unidad": "m2", "formula": "superficie_m2" }
      ]
    }
  ],
  "checklist": [
    "proteccion de pisos y aberturas",
    "enduido en paredes con imperfecciones",
    "retiro y recolocacion de tapas de luz"
  ],
  "fuentes": [
    { "titulo": "Seia — destilados de pintura interior", "tipo": "seia", "fecha": "2026-06-12" },
    { "titulo": "Memoria feedback-secuencia-pintura (revoque → fijador → masillado → manos)", "tipo": "obra", "fecha": "2026-06-12" }
  ]
}
EOF

# variables re-derivadas (shell nueva — no dependas de steps anteriores):
cd /Users/ezeotero/Documents/ravn
set -a; source .env.local; set +a
DAEMON_EMAIL=$(grep '^DAEMON_EMAIL=' /Users/ezeotero/.ravn-cotizador/.env | cut -d= -f2-)
DAEMON_PASSWORD=$(grep '^DAEMON_PASSWORD=' /Users/ezeotero/.ravn-cotizador/.env | cut -d= -f2-)
DAEMON_TOKEN=$(curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$DAEMON_EMAIL\",\"password\":\"$DAEMON_PASSWORD\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))")

curl -s -o /dev/null -w 'seed receta: %{http_code}\n' -X POST \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/recetas?on_conflict=nombre" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $DAEMON_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=ignore-duplicates" \
  -d @/tmp/receta-pintura-interior.json
```

Expected: `seed receta: 201`.

No hay commit: tarea operativa (credenciales y datos viven fuera del repo).

---

### Task 18: Extensión del daemon — procesar `trabajos_cola` por tipo

`~/.ravn-cotizador/daemon.py` (FUERA del repo git, lo corre launchd `com.ravn.cotizador` cada ~45s) pasa a atender la cola nueva del contrato.

**Requiere: plan A ejecutado** (la tabla `trabajos_cola` tiene que existir en prod). Si se reemplaza el daemon ANTES del `db push` del plan A, cada tick rompe en `procesar_trabajo` (404 a `trabajos_cola`) sin llegar al fallback legacy y el cotizador WhatsApp actual deja de atenderse en silencio.

Reglas duras:

- **El latido NO se toca:** sigue siendo la fila `estado='latido'` en `cotizaciones_cola` (la migra el Frente E).
- **Gramática de aprobación por WhatsApp (acordada, idéntica en los planes C y D):** al dejar una cotización `en_revision` con `origen='whatsapp'`, el resumen que se manda TERMINA con esta línea exacta: `Respondé OK <id-corto> para aprobar, o CORREGIR <id-corto>: <qué corregir>` — donde `id-corto` = primeros 8 caracteres del uuid de la cotización. El reconocimiento de esas dos respuestas del owner lo implementa el BOT (plan C): `OK <id-corto>` → `en_revision`→`aprobada` (con guard de estado y verificación de fila afectada); `CORREGIR <id-corto>: <detalle>` → `rechazada` + `motivo_rechazo` + lección tipo `rechazo` + nuevo trabajo `cotizar` con `contexto.correccion`. El daemon SOLO emite la línea con el id-corto.
- **La cola vieja sigue viva** como fallback: hasta que el bot 2.0 (Frente C) esté deployado, el bot escribe en `cotizaciones_cola`; el daemon atiende primero `trabajos_cola` y, si no había nada, la legacy. Sin ventana rota en ningún orden de deploy.
- **Una cotización NUNCA se emite sola:** tipo `cotizar` termina en `en_revision` (y el daemon VERIFICA que Claude haya insertado la fila en `cotizaciones`; si no, es `error`).
- **Preguntas de ficha por el origen:** `estado='esperando_datos'` + `contexto.pregunta` (+ `contexto.session_id` para `--resume`). Si `origen='whatsapp'`, además se manda el mensaje (el bot releva la respuesta con `getTrabajoEsperandoDatos`/`responderTrabajo` — plan C, Tarea 4 — que apila `contexto.respuestas` y vuelve la fila a `pendiente`). Si `origen='tablero'`, la pregunta queda visible vía Realtime.
- El daemon ahora entra con `DAEMON_EMAIL`/`DAEMON_PASSWORD` (Task 17), con fallback a `BOT_EMAIL` si faltara.
- Cada trabajo procesado deja una fila en `eventos` (`origen='daemon'`) para el feed Actividad.

**Files:**
- Modify: `/Users/ezeotero/.ravn-cotizador/daemon.py` (reemplazo completo; NO se commitea — backup `.bak`)

- [ ] **Step 1: Backup del daemon actual**

```bash
cp /Users/ezeotero/.ravn-cotizador/daemon.py /Users/ezeotero/.ravn-cotizador/daemon.py.bak-frente-d
ls -la /Users/ezeotero/.ravn-cotizador/*.bak-frente-d
```

Expected: el backup existe.

- [ ] **Step 2: Reemplazar `/Users/ezeotero/.ravn-cotizador/daemon.py` COMPLETO por:**

```python
#!/usr/bin/env python3
"""Daemon del Centro de Mando — Mac de Eze (launchd com.ravn.cotizador, ~45s).

Cada corrida:
1. late (fila estado='latido' en cotizaciones_cola — el bot la mira; la migra el Frente E),
2. toma UN trabajo 'pendiente' de trabajos_cola (cotizar/redactar/consulta/orden)
   y corre Claude Code headless con la suscripción,
3. si no había trabajos, atiende la cola vieja cotizaciones_cola
   (compatibilidad hasta que el bot 2.0 — Frente C — esté deployado).

trabajos_cola: pendiente → procesando → esperando_datos | en_revision (cotizar)
| completado | error.  Una cotización NUNCA se emite sola: queda en_revision
para la mesa de Eze (spec §6.4).
"""
import json
import os
import ssl
import subprocess
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import certifi

DIR = Path(__file__).resolve().parent
LOCK = DIR / "daemon.lock"
ENV = DIR / ".env"
TABLA_LEGACY = "cotizaciones_cola"
TABLA_TRABAJOS = "trabajos_cola"
MARCADOR_ESPERA = "[ESPERO-RESPUESTA]"
CLAUDE_TIMEOUT = 1500  # 25 min
CTX = ssl.create_default_context(cafile=certifi.where())

cfg = {}
for linea in ENV.read_text().splitlines():
    if "=" in linea and not linea.startswith("#"):
        k, _, v = linea.partition("=")
        cfg[k.strip()] = v.strip().strip('"')


def log(msg):
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{stamp}] {msg}", flush=True)


def http(url, data=None, headers=None, method=None):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode() if data is not None else None,
        headers={"Content-Type": "application/json", **(headers or {})},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
        cuerpo = r.read().decode()
        return json.loads(cuerpo) if cuerpo.strip() else None


def supabase_auth():
    # Usuario dedicado del daemon (acceso a cotizaciones/recetas/lecciones por
    # no ser el bot — es_bot() lo deja pasar). Fallback: credenciales del bot.
    email = cfg.get("DAEMON_EMAIL") or cfg["BOT_EMAIL"]
    password = cfg.get("DAEMON_PASSWORD") or cfg["BOT_PASSWORD"]
    r = http(
        f"{cfg['SUPABASE_URL']}/auth/v1/token?grant_type=password",
        data={"email": email, "password": password},
        headers={"apikey": cfg["SUPABASE_ANON_KEY"]},
    )
    return r["access_token"]


def rest(token, path, data=None, method="GET", prefer=None):
    headers = {
        "apikey": cfg["SUPABASE_ANON_KEY"],
        "Authorization": f"Bearer {token}",
    }
    if prefer:
        headers["Prefer"] = prefer
    return http(f"{cfg['SUPABASE_URL']}/rest/v1/{path}", data=data, headers=headers, method=method)


def enviar_whatsapp(texto):
    # WhatsApp corta en 4096; partimos por párrafos en bloques de ~3500
    bloques, actual = [], ""
    for parrafo in texto.split("\n\n"):
        if len(actual) + len(parrafo) + 2 > 3500 and actual:
            bloques.append(actual)
            actual = parrafo
        else:
            actual = f"{actual}\n\n{parrafo}" if actual else parrafo
    if actual:
        bloques.append(actual)
    for b in bloques:
        http(
            f"https://graph.facebook.com/v18.0/{cfg['WHATSAPP_PHONE_NUMBER_ID']}/messages",
            data={"messaging_product": "whatsapp", "to": cfg["OWNER_PHONE"], "type": "text", "text": {"body": b}},
            headers={"Authorization": f"Bearer {cfg['WHATSAPP_ACCESS_TOKEN']}"},
        )


def latir(token):
    # Fila "latido": el bot la mira para saber si la Mac está prendida.
    # SIGUE en cotizaciones_cola hasta que el Frente E la migre a sistema_estado.
    ahora = datetime.now(timezone.utc).isoformat()
    filas = rest(token, f"{TABLA_LEGACY}?estado=eq.latido&select=id&limit=1")
    if filas:
        rest(token, f"{TABLA_LEGACY}?id=eq.{filas[0]['id']}", data={"updated_at": ahora}, method="PATCH")
    else:
        rest(token, TABLA_LEGACY, data={"pedido": "[latido daemon]", "estado": "latido"}, method="POST")


def descargar_media(media):
    auth = {"Authorization": f"Bearer {cfg['WHATSAPP_ACCESS_TOKEN']}"}
    meta = http(f"https://graph.facebook.com/v18.0/{media['id']}", headers=auth)
    ext = {"image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf"}.get(media.get("mime"), "")
    if not ext and media.get("filename"):
        ext = Path(media["filename"]).suffix
    destino = DIR / "media" / f"{media['id']}{ext or '.bin'}"
    destino.parent.mkdir(exist_ok=True)
    req = urllib.request.Request(meta["url"], headers=auth)
    with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
        destino.write_bytes(r.read())
    return destino


# ── reglas por canal ─────────────────────────────────────────────────────────

REGLAS_WHATSAPP = """REGLAS DEL CANAL (WhatsApp):
- Tu respuesta final completa se manda POR WHATSAPP tal cual. Formato WhatsApp: *negritas* con asteriscos simples, guiones para listas, NADA de tablas markdown ni encabezados #. Claro para leer en un celular.
- Máximo ~3000 caracteres. Andá al grano.
- Si te falta un dato clave para resolver, preguntá TODO lo que falte junto, en un solo mensaje corto, y terminá tu respuesta con esta línea exacta en un renglón solo: {marcador}
- Si tenés todo, entregá el resultado SIN ese marcador.
- No le avises al usuario que vas a guardar en el vault ni detalles internos; solo el contenido útil."""

REGLAS_TABLERO = """REGLAS DEL CANAL (tablero Centro de Mando):
- Tu respuesta final completa se muestra en el tablero. Texto plano claro, guiones para listas, sin tablas markdown ni encabezados #.
- Máximo ~3000 caracteres. Andá al grano.
- Si te falta un dato clave, preguntá TODO junto en un mensaje corto y terminá con esta línea exacta en un renglón solo: {marcador}
- Si tenés todo, entregá el resultado SIN ese marcador."""


def reglas_para(origen):
    plantilla = REGLAS_WHATSAPP if origen == "whatsapp" else REGLAS_TABLERO
    return plantilla.format(marcador=MARCADOR_ESPERA)


# ── prompts de trabajos_cola (por tipo del contrato) ─────────────────────────

PROMPTS_TRABAJO = {
    "cotizar": """Sos el Cotizador Maestro de Ravn corriendo headless en la Mac de Ezequiel, invocado desde {origen}.

Leé y seguí AL PIE el skill: /Users/ezeotero/.claude/skills/cotizador-maestro/SKILL.md
(jerarquía de fuentes, lecciones, motor determinístico, guardado en la tabla cotizaciones).

PEDIDO DE EZEQUIEL: {prompt}
{respuestas}
TRABAJO_ID (ponelo como trabajo_id al insertar la cotización): {id}

OBLIGATORIO:
- Cantidades y totales SOLO con el motor: cd /Users/ezeotero/Documents/ravn && npx tsx scripts/cotizador/instanciar.ts < entrada.json. NUNCA sumes a mano.
- Insertá la cotización en la tabla `cotizaciones` con estado='en_revision' (REST de Supabase, credenciales DAEMON_EMAIL/DAEMON_PASSWORD de /Users/ezeotero/.ravn-cotizador/.env). El documento final NO lo emitís vos: lo aprueba Eze en la app.
- Si falta un dato de la ficha que mueve el precio, preguntá TODO junto y cerrá con el marcador.

RESPUESTA FINAL (resumen de mesa): receta y su estado (confiable/investigada), total en RANGO, divergencias >25% marcadas con tu opinión, faltantes del checklist, alertas de sanidad y tus dudas. Cerrá con: "La mesa de revisión está en la app → /cotizaciones". NO escribas instrucciones de OK/CORREGIR: si el pedido vino por WhatsApp, esa línea la agrega el daemon al final del mensaje.

{reglas}""",
    "redactar": """Sos el asistente de documentos de Ravn corriendo headless en la Mac de Ezequiel, invocado desde {origen}.

PEDIDO DE EZEQUIEL: {prompt}
{respuestas}

Redactá el documento pedido. Si es para un cliente (presupuesto, detalle de trabajos realizados, nota formal), usá el formato oficial Ravn (template negro A4 — base /Users/ezeotero/Documents/ravn/diagnosticos/Presupuesto_Lagomarsino.html, memoria ravn-presupuesto-formato). Guardalo donde corresponda (diagnosticos/ del repo ravn o el vault) y decile a Eze la ruta exacta. Si falta un dato que cambia el documento, preguntá con el marcador.

{reglas}""",
    "consulta": """Sos el asistente integral de Ezequiel (Ravn Construcciones) corriendo headless en su Mac, invocado desde {origen}. Tenés su vault (/Users/ezeotero/Obsidian/RAVN/), sus skills y memorias — usalos según lo que pida.

CONSULTA DE EZEQUIEL: {prompt}
{respuestas}

Respondé corto y útil, con datos reales (vault, base, internet si hace falta).

{reglas}""",
    "orden": """Sos el asistente integral de Ezequiel (Ravn Construcciones) corriendo headless en su Mac, invocado desde {origen}. Tenés su vault (/Users/ezeotero/Obsidian/RAVN/), sus skills y memorias — usalos según lo que pida.

ORDEN DE EZEQUIEL: {prompt}
{respuestas}

Resolvelo de verdad (investigá, redactá, calculá — lo que haga falta). Si el resultado es un documento/archivo, guardalo donde corresponda y decile dónde quedó.

{reglas}""",
}


def correr_claude_prompt(prompt, session_id=None):
    claude_bin = str(Path.home() / ".local" / "bin" / "claude")
    cmd = [claude_bin, "-p", "--model", "sonnet", "--output-format", "json", "--dangerously-skip-permissions"]
    if session_id:
        cmd += ["--resume", session_id]
    cmd.append(prompt)
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=CLAUDE_TIMEOUT, cwd=str(Path.home()))
    if r.returncode != 0:
        raise RuntimeError(f"claude exit {r.returncode}: {r.stderr[:500]}")
    salida = json.loads(r.stdout)
    return salida.get("result", ""), salida.get("session_id")


def registrar_evento(token, tipo, titulo, destino_id):
    # Feed Actividad del tablero (tabla eventos). Best-effort.
    try:
        rest(
            token,
            "eventos",
            data={
                "origen": "daemon",
                "tipo": tipo,
                "estado": "procesado",
                "titulo": (titulo or "")[:200],
                "contenido": {},
                "destino_tabla": TABLA_TRABAJOS,
                "destino_id": destino_id,
            },
            method="POST",
        )
    except Exception as e:
        log(f"WARN evento no registrado: {e}")


def armar_prompt_trabajo(fila):
    """Devuelve (prompt, session_id_para_resume)."""
    contexto = fila.get("contexto") or {}
    respuestas = contexto.get("respuestas") or []
    if respuestas and contexto.get("session_id"):
        # El bot apiló la respuesta de Eze y re-encoló: retomamos la sesión.
        return respuestas[-1].get("texto", ""), contexto["session_id"]
    bloque = ""
    if respuestas:
        # Sesión perdida pero hay respuestas previas: arrancamos de cero con todo a mano.
        textos = "\n".join(f"- {r.get('texto', '')}" for r in respuestas)
        bloque = f"\nDATOS QUE EZE YA RESPONDIÓ ANTES:\n{textos}\n"
    tipo = fila.get("tipo") or "orden"
    origen = fila.get("origen") or "whatsapp"
    plantilla = PROMPTS_TRABAJO.get(tipo, PROMPTS_TRABAJO["orden"])
    prompt = plantilla.format(
        prompt=fila.get("prompt", ""),
        respuestas=bloque,
        id=fila["id"],
        origen=origen,
        reglas=reglas_para(origen),
    )
    return prompt, None


def cotizacion_del_trabajo(token, trabajo_id):
    filas = rest(
        token,
        f"cotizaciones?trabajo_id=eq.{trabajo_id}&select=id,estado,total_min,total_max&order=creado_at.desc&limit=1",
    )
    return filas[0] if filas else None


def gramatica_aprobacion(cotizacion_id):
    # Gramática de aprobación por WhatsApp — acordada, IDÉNTICA en los planes C
    # y D. El bot (plan C) reconoce estas DOS respuestas del owner:
    #   "OK <id-corto>"                → en_revision → aprobada
    #   "CORREGIR <id-corto>: <detalle>" → rechazada + lección + re-encolado
    # id-corto = primeros 8 caracteres del uuid de la cotización. No cambiar el
    # texto sin tocar el plan C a la vez.
    id_corto = str(cotizacion_id)[:8]
    return f"Respondé OK {id_corto} para aprobar, o CORREGIR {id_corto}: <qué corregir>"


def procesar_trabajo(token):
    """Atiende UN trabajo de trabajos_cola. Devuelve True si encontró algo."""
    filas = rest(token, f"{TABLA_TRABAJOS}?estado=eq.pendiente&order=creado_at.asc&limit=1")
    if not filas:
        return False
    fila = filas[0]
    # claim atómico: solo procede si nadie la tomó antes
    tomada = rest(
        token,
        f"{TABLA_TRABAJOS}?id=eq.{fila['id']}&estado=eq.pendiente",
        data={"estado": "procesando"},
        method="PATCH",
        prefer="return=representation",
    )
    if not tomada:
        return True
    fila = tomada[0]
    origen = fila.get("origen") or "whatsapp"
    tipo = fila.get("tipo") or "orden"
    log(f"Trabajo #{fila['id']} [{tipo}] ({origen}): {fila.get('prompt', '')[:80]}")
    contexto = dict(fila.get("contexto") or {})
    try:
        prompt, session_resume = armar_prompt_trabajo(fila)
        respuesta, session_id = correr_claude_prompt(prompt, session_resume)
        espera = MARCADOR_ESPERA in respuesta
        limpia = respuesta.replace(MARCADOR_ESPERA, "").strip()
        if not limpia:
            limpia = "Me quedé sin respuesta. Mandá el pedido de nuevo."
        contexto["session_id"] = session_id

        if espera:
            # Pregunta de ficha de vuelta por el origen (spec §6.2.6).
            contexto["pregunta"] = limpia
            rest(
                token,
                f"{TABLA_TRABAJOS}?id=eq.{fila['id']}",
                data={"estado": "esperando_datos", "contexto": contexto},
                method="PATCH",
            )
            if origen == "whatsapp":
                enviar_whatsapp(limpia)
            registrar_evento(token, "trabajo_pregunta", limpia, fila["id"])
            log(f"Trabajo #{fila['id']} → esperando_datos")
            return True

        contexto.pop("pregunta", None)
        if tipo == "cotizar":
            # Gate del spec §6.4: verificamos que la cotización exista y quede
            # en la mesa. El daemon NUNCA la aprueba ni emite.
            cot = cotizacion_del_trabajo(token, fila["id"])
            if not cot:
                raise RuntimeError("Claude terminó sin insertar la cotización en la tabla `cotizaciones`")
            rest(
                token,
                f"{TABLA_TRABAJOS}?id=eq.{fila['id']}",
                data={
                    "estado": "en_revision",
                    "contexto": contexto,
                    "resultado": {
                        "cotizacion_id": cot["id"],
                        "total_min": cot.get("total_min"),
                        "total_max": cot.get("total_max"),
                        "resumen": limpia,
                    },
                },
                method="PATCH",
            )
            log(f"Trabajo #{fila['id']} → en_revision (cotización {cot['id']})")
            if origen == "whatsapp":
                # El resumen por WhatsApp TERMINA con la gramática de aprobación
                # (el bot del plan C reconoce OK/CORREGIR <id-corto>).
                limpia = f"{limpia}\n\n{gramatica_aprobacion(cot['id'])}"
        else:
            rest(
                token,
                f"{TABLA_TRABAJOS}?id=eq.{fila['id']}",
                data={"estado": "completado", "contexto": contexto, "resultado": {"resumen": limpia}},
                method="PATCH",
            )
            log(f"Trabajo #{fila['id']} → completado")

        if origen == "whatsapp":
            enviar_whatsapp(limpia)
        registrar_evento(token, f"trabajo_{tipo}", fila.get("prompt", ""), fila["id"])
    except Exception as e:
        log(f"ERROR trabajo #{fila['id']}: {e}")
        rest(
            token,
            f"{TABLA_TRABAJOS}?id=eq.{fila['id']}",
            data={"estado": "error", "error": str(e)[:500]},
            method="PATCH",
        )
        if origen == "whatsapp":
            enviar_whatsapp("⚠️ El trabajo que mandaste tuvo un problema. Probá de nuevo en un rato.")
    return True


# ── cola LEGACY (cotizaciones_cola) — se mantiene hasta que el Frente C deploye ──

PROMPTS = {
    "cotizacion": """Sos el Cotizador Maestro de Ravn corriendo headless, invocado por Ezequiel desde WhatsApp.

Leé y seguí AL PIE el skill: /Users/ezeotero/.claude/skills/cotizador-maestro/SKILL.md
(receta desde el cerebro Seia, doble precio SISMAT + internet, guardar en el vault Cotizaciones/).

PEDIDO DE EZEQUIEL: {pedido}

FORMATO DE LA COTIZACIÓN: receta resumida en 3-5 líneas, ítems clave con doble precio (SISMAT $X · internet $Y, fuente), tiempo y gente, total en RANGO. Divergencias >25% marcadas con tu opinión. Los datos de la ficha que muevan el precio (cantidad/m², zona, estado, calidad, acceso) se preguntan con el marcador si faltan.

{reglas}""",
    "media": """Sos el asistente integral de Ezequiel (Ravn Construcciones) corriendo headless en su Mac. Te mandó un archivo por WhatsApp.

ARCHIVO (ya descargado, abrilo con Read): {media_path}
TEXTO QUE LO ACOMPAÑA: {pedido}

Miralo y decidí qué es:
a) FACTURA / ticket / recibo → extraé proveedor, monto total, fecha y concepto. Decidí si es gasto PERSONAL o de OBRA (si menciona una obra o son materiales de construcción). Registralo: personal → tabla gastos_personales de Supabase vía REST (credenciales del bot en /Users/ezeotero/.ravn-cotizador/.env: auth password grant con BOT_EMAIL/BOT_PASSWORD contra SUPABASE_URL con apikey SUPABASE_ANON_KEY); obra → línea "GASTO OBRA — ..." en el Inbox del vault (/Users/ezeotero/Obsidian/RAVN/Inbox/, archivo del día, sección Finanzas). Confirmale en 2-3 líneas qué registraste y dónde.
   Bonus si es de obra: intentá ADEMÁS cargarlo en la base de App RAVN (el código está en /Users/ezeotero/Documents/ravn — investigá el esquema de gastos/finanzas y probá el insert con las credenciales del bot; si RLS no te deja, no insistas: registralo en el vault como siempre y listo, sin mencionar el intento fallido).
b) FOTO DE OBRA → guardá una nota con lo que se ve en el Inbox del vault (sección Obra, mencioná la obra si la identificás por contexto) y comentale en 2 líneas qué observás de relevante técnico.
c) OTRA COSA → decile qué ves y preguntale qué quiere hacer, terminando con el marcador.
Si la imagen no se entiende o falta un dato clave (ej: a qué obra va), preguntá con el marcador.

{reglas}""",
    "general": """Sos el asistente integral de Ezequiel (Ravn Construcciones) corriendo headless en su Mac, invocado por WhatsApp. Tenés su vault (/Users/ezeotero/Obsidian/RAVN/), sus skills y memorias — usalos según lo que pida.

PEDIDO DE EZEQUIEL: {pedido}

Resolvelo de verdad (investigá, redactá, calculá — lo que haga falta). Si el resultado es un documento/archivo, guardalo donde corresponda y decile dónde quedó.

{reglas}""",
}


def desempaquetar(fila):
    # El bot empaqueta {texto, tipo, media} como JSON en `pedido` (la tabla no
    # tiene columnas tipo/media). Texto plano = cotización (compat y respuestas).
    try:
        env = json.loads(fila["pedido"])
        if isinstance(env, dict) and "texto" in env:
            fila["pedido"] = env.get("texto") or ""
            fila["tipo"] = env.get("tipo") or "cotizacion"
            fila["media"] = env.get("media")
    except (json.JSONDecodeError, TypeError):
        pass
    return fila


def correr_claude_legacy(fila):
    if fila.get("session_id"):
        return correr_claude_prompt(fila["pedido"], fila["session_id"])
    tipo = fila.get("tipo") or "cotizacion"
    media_path = ""
    if fila.get("media"):
        media_path = str(descargar_media(fila["media"]))
    prompt = PROMPTS.get(tipo, PROMPTS["general"]).format(
        pedido=fila["pedido"],
        media_path=media_path,
        reglas=REGLAS_WHATSAPP.format(marcador=MARCADOR_ESPERA),
    )
    return correr_claude_prompt(prompt)


def procesar_legacy(token):
    filas = rest(token, f"{TABLA_LEGACY}?estado=eq.pendiente&order=created_at.asc&limit=1")
    if not filas:
        return
    fila = filas[0]
    tomada = rest(
        token,
        f"{TABLA_LEGACY}?id=eq.{fila['id']}&estado=eq.pendiente",
        data={"estado": "procesando", "updated_at": datetime.now(timezone.utc).isoformat()},
        method="PATCH",
        prefer="return=representation",
    )
    if not tomada:
        return
    fila = desempaquetar(fila)
    log(f"Legacy #{fila['id']} [{fila.get('tipo', 'cotizacion')}]: {fila['pedido'][:80]}")
    try:
        respuesta, session_id = correr_claude_legacy(fila)
        espera = MARCADOR_ESPERA in respuesta
        limpia = respuesta.replace(MARCADOR_ESPERA, "").strip()
        if not limpia:
            limpia = "Hmm, me quedé sin respuesta. Mandá el pedido de nuevo."
        enviar_whatsapp(limpia)
        rest(
            token,
            f"{TABLA_LEGACY}?id=eq.{fila['id']}",
            data={
                "estado": "esperando" if espera else "completado",
                "respuesta": limpia,
                "session_id": session_id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            method="PATCH",
        )
        log(f"Legacy #{fila['id']} → {'esperando datos' if espera else 'completado'}")
    except Exception as e:
        log(f"ERROR legacy #{fila['id']}: {e}")
        rest(
            token,
            f"{TABLA_LEGACY}?id=eq.{fila['id']}",
            data={"estado": "error", "respuesta": str(e)[:500], "updated_at": datetime.now(timezone.utc).isoformat()},
            method="PATCH",
        )
        enviar_whatsapp("⚠️ El cotizador tuvo un problema con tu pedido. Probá mandarlo de nuevo en un rato.")


def main():
    # lock contra corridas solapadas (una cotización puede tardar varios minutos);
    # un lock más viejo que el timeout de claude es de una corrida muerta → se limpia
    if LOCK.exists() and (datetime.now().timestamp() - LOCK.stat().st_mtime) > CLAUDE_TIMEOUT + 300:
        LOCK.unlink(missing_ok=True)
    try:
        fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)
    except FileExistsError:
        return
    try:
        token = supabase_auth()
        latir(token)
        if not procesar_trabajo(token):
            procesar_legacy(token)
    finally:
        LOCK.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Verificar que compila y que el tick vacío anda**

```bash
python3 -m py_compile /Users/ezeotero/.ravn-cotizador/daemon.py && echo "compila OK"
python3 /Users/ezeotero/.ravn-cotizador/daemon.py && echo "tick OK"
ls /Users/ezeotero/.ravn-cotizador/daemon.lock 2>/dev/null || echo "lock limpio"
```

Expected: `compila OK`, `tick OK` (sin trabajos pendientes no loguea nada) y `lock limpio`. Si `tick OK` no aparece, mirar el traceback: lo más común es que falten `DAEMON_EMAIL`/`DAEMON_PASSWORD` en el `.env` (Task 17).

- [ ] **Step 4: Verificar que el latido siguió latiendo**

```bash
cd /Users/ezeotero/Documents/ravn
set -a; source .env.local; set +a
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/cotizaciones_cola?estado=eq.latido&select=updated_at" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: una fila con `updated_at` de hace segundos (la corrida del Step 3 lo actualizó).

No hay commit: `daemon.py` vive fuera del repo. El backup `.bak-frente-d` queda como rollback.

---

### Task 19: Reescribir el skill `cotizador-maestro` (spec §6.3 + tabla cotizaciones + lecciones)

El skill es el cerebro que corre tanto en sesión como headless. Cambios contra la versión actual: jerarquía de fuentes formal (fabricantes → Seia → cruce internet SIEMPRE → tarifarios → obras propias), protocolo "Seia no lo tiene" con receta `investigada`/`confiable`, lecciones de `cotizador_lecciones` inyectadas en CADA cotización, motor determinístico obligatorio, guardado en la tabla `cotizaciones` además del vault, **vínculo `presupuesto_id` por matching de nombre** (solo match inequívoco — la otra mitad del doble mecanismo del loop de oro, junto al selector de la mesa) y **espejos del vault**: cada receta mantiene su `.md` en `Conocimiento/Recetas/` y cada lección se appendea a `Conocimiento/Precios/lecciones-cotizador.md` (spec §6.2.2 y §6.5).

**Files:**
- Modify: `/Users/ezeotero/.claude/skills/cotizador-maestro/SKILL.md` (reemplazo completo; FUERA del repo — backup `.bak`)

- [ ] **Step 1: Backup**

```bash
cp /Users/ezeotero/.claude/skills/cotizador-maestro/SKILL.md \
   /Users/ezeotero/.claude/skills/cotizador-maestro/SKILL.md.bak-frente-d
```

- [ ] **Step 2: Reemplazar `/Users/ezeotero/.claude/skills/cotizador-maestro/SKILL.md` COMPLETO por:**

```markdown
---
name: cotizador-maestro
description: Cotizador Maestro de Ravn (Ezequiel Otero) — flujo completo y CONVERSACIONAL para cotizar un laburo de obra de verdad. Usar cuando diga "cotizame", "tengo para cotizar", "armame la cotización/presupuesto de", "necesito presupuestar X". Orquesta: lecciones previas → ficha de datos → receta paramétrica (jerarquía de fuentes) → doble precio SISMAT + internet → motor determinístico (el código suma, no la IA) → guardado en la tabla cotizaciones (estado en_revision) + vault. El documento final lo aprueba y emite Eze en la app (mesa de revisión) — este skill NUNCA emite solo. Es el hermano formal de cotizador-rapido (consulta exprés).
---

# Cotizador Maestro — Ravn (Cotizador 2.0)

**Qué es:** el flujo completo para cotizar un laburo. Corre en dos modos:
- **Sesión** (Eze en la terminal): sparring, ida y vuelta.
- **Headless** (daemon de la Mac, `trabajos_cola`): mismas reglas; las preguntas van con el marcador del canal y las dudas quedan en `revision.dudas`.

En AMBOS modos el resultado va a la **tabla `cotizaciones` en estado `en_revision`** + espejo `.md` en el vault. El documento final sale de la app (`/cotizaciones/<id>/revision` → aprobar → emitir). **Nunca jamás se emite ni aprueba desde acá.**

## Principios innegociables
1. **La IA piensa, el CÓDIGO suma.** Cantidades, desperdicios, totales, checklist, sanidad y vencimientos los calcula el motor (`scripts/cotizador/instanciar.ts` en `/Users/ezeotero/Documents/ravn`). Prohibido calcular a mano una cantidad o un total.
2. **Doble precio SIEMPRE:** `SISMAT $X · Internet $Y (fuente, fecha)`. Todo precio lleva `{valor, fuente, fecha}` — sin fecha no es un precio, es un rumor.
3. **Ninguna fuente es verdad única.** Conflicto entre fuentes → ambas versiones a la mesa + pregunta. Nunca se elige en silencio.
4. **Nunca auto-finaliza.** Estado máximo alcanzable por este skill: `en_revision`.
5. **Sparring, no monólogo** (en sesión). En headless: cada duda real va al array `dudas` del motor para que aparezca en la mesa.

## Jerarquía de fuentes (spec Centro de Mando §6.3 — en este orden)
1. **Fichas técnicas de fabricantes** (Weber, Klaukol, Sika, Alba, Cacique, …) — rendimientos y consumos oficiales. Máxima autoridad en SU producto.
2. **Seia** — método, secuencia, criterio, errores típicos: `Conocimiento/Construccion/Marcelo-Seia/_INDICE.md` → SOLO el destilado del tema (jerarquía de tokens). Falta el destilado pero existe la cruda → destilar en el momento.
3. **Cruce de internet — SIEMPRE** — mínimo 2 fuentes profesionales independientes. Conflicto con Seia o con la experiencia de Eze → ambas a la mesa.
4. **Tarifarios para MO/costos** — SISMAT como referencia A: `python3 /Users/ezeotero/Obsidian/RAVN/Conocimiento/Precios/sismat/buscar.py "<término>" [--solo mat|mo]` (0 tokens; calibre: monotributista PBA, costo base sin ganancia).
5. **Las obras de Eze** — `cotizador_lecciones` tipo `contraste_obra`: la fuente que más peso gana con el tiempo.

**Protocolo "Seia no lo tiene":** ficha de fabricante + 2 fuentes profesionales independientes → la receta se crea con `estado='investigada'` (sin validar en obra; la mesa lo muestra con bandera). Tras usarse en obra real y pasar el contraste, se promueve: `PATCH recetas estado='confiable'`.

Respetar SIEMPRE las memorias de errores a no repetir (baño/impermeabilización, secuencia pintura: fijador antes del masillado, UN solo fijador, sin prometer cantidad de manos).

## El pipeline

### 0. Lecciones (OBLIGATORIO antes de cotizar nada)
`GET cotizador_lecciones?receta_nombre=eq.<slug>&order=creado_at.desc&limit=10` + `GET cotizador_lecciones?order=creado_at.desc&limit=5` (generales). Inyectarlas: ajustar coeficientes de desperdicio/rendimiento/tiempos con los `ajuste` de contrastes previos y no repetir los motivos de rechazos.

### 1. Ficha
Los 6 campos que mueven el precio: **trabajo, cantidad (m²/ml/u), zona, estado actual, calidad esperada, acceso/altura** + los `parametros` requeridos de la receta. Preguntá SOLO lo que falte, en una sola ronda. Headless: cerrar la pregunta con el marcador del canal.

### 2. Memoria
`GET cotizaciones?titulo=ilike.*<palabra>*&order=creado_at.desc&limit=5` + `/Users/ezeotero/Obsidian/RAVN/Cotizaciones/`. Algo parecido <30 días → reusar receta y cantidades, re-verificar solo precios clave.

### 3. Receta (tabla `recetas` — paramétrica)
- `GET recetas?nombre=eq.<slug>` → existe: usarla (mirar `estado` y `version`).
- No existe → investigarla con la jerarquía de fuentes y CREARLA: `nombre` (slug), `titulo`, `estado='investigada'`, `parametros[]`, `etapas[]` (ítems con `formula`, `desperdicio_pct`, `rango_fisico` cuando haya rendimiento físico conocido), `checklist[]`, `fuentes[]` con fecha. El shape EXACTO está en `/Users/ezeotero/Documents/ravn/src/lib/cotizador/tipos.ts`.
- Cada cotización que enseña algo refina la receta (`PATCH` + `version+1`).
- **Espejo en el vault (spec §6.2.2 — SIEMPRE):** cada vez que crees o refines una receta, escribí/actualizá su espejo legible en `/Users/ezeotero/Obsidian/RAVN/Conocimiento/Recetas/<nombre>.md` (creá la carpeta si no existe). Contenido: título, estado (investigada/confiable), versión, parámetros, etapas con fórmulas y desperdicios, checklist y fuentes con fecha. La tabla es la verdad operativa; el `.md` es el espejo para leer.
- OJO: `catalogo_recetas` es OTRA tabla (catálogo de ítems de presupuestos de la app). No confundir.

### 4. Precios — dobles y fechados
- TODA la lista de la receta pasa por `buscar.py` (0 tokens).
- Internet (MercadoLibre, easy.com.ar, sodimac.com.ar, pricely.ar; MO: clickie.com.ar, servidos.ar, homesolution.net/ar) SOLO en: (a) ítems sin ref. SISMAT, (b) los 3–5 ítems que concentran ~80% del costo, (c) divergencias que huelan mal. Muchas búsquedas → fan-out en subagentes.
- Armar `precios: { "<nombre EXACTO del ítem de la receta>": { sismat: {valor, fuente, fecha}, internet: {valor, fuente, fecha} } }`.
- Conseguir la **banda de mercado del rubro en $/m²** (`banda_m2: {min, max, fuente, fecha}`) para la sanidad.
- Extras fuera de receta (flete, volquete, …) como `extras[]` con fuente y fecha.

### 5. Motor (cantidades y totales — SOLO acá)
```bash
cd /Users/ezeotero/Documents/ravn && npx tsx scripts/cotizador/instanciar.ts < /tmp/entrada-cotizacion.json
```
Entrada: `{receta, parametros, precios, extras, imprevistos_pct, zona, banda_m2, dudas}`.
Salida: `{desglose, revision, total_min, total_max}` — o `{"error":"faltan_parametros","faltan":[...]}` → volver al paso 1 y preguntar. El motor ya marca divergencias >25%, checklist anti-olvidos (flete, volquete, consumibles, andamios, limpieza, escombros, imprevistos, factor zona countries +15–20%), sanidad física y precios vencidos (15d materiales / 30d MO).

### 6. Guardar (tabla + vault)
**Vínculo con la obra (la llave del loop de oro, §6.2.5) — intentalo SIEMPRE antes del INSERT:**
buscá el presupuesto de la obra por el nombre de cliente/obra de la ficha (probá con el apellido del cliente y con el nombre de la obra/lugar, una palabra por vez):
`GET presupuestos?or=(nombre_obra.ilike.*<palabra>*,nombre_cliente.ilike.*<palabra>*)&select=id,nombre_obra,nombre_cliente&limit=5`
- Exactamente UN candidato y el nombre cierra sin dudas → ese `id` va en `presupuesto_id`.
- Cero candidatos, varios candidatos, o duda razonable → `presupuesto_id: null` y agregá a `revision.dudas`: `"Vincular la obra en la mesa (selector de presupuesto) — sin vínculo el contraste al finalizar la obra no corre"`. NUNCA adivines la obra: un vínculo equivocado contamina las lecciones.

INSERT en `cotizaciones` vía REST: `titulo`, `zona`, `estado: "en_revision"`, `receta_id`, `trabajo_id` (si headless te lo dieron), `presupuesto_id` (el match inequívoco, o `null`), `ficha` (los 6 campos + parametros), `desglose`, `revision`, `total_min`, `total_max`.
Espejo `.md` en `/Users/ezeotero/Obsidian/RAVN/Cotizaciones/` (formato de siempre: receta + tabla doble precio + fuentes + nota "mesa: /cotizaciones/<id>/revision").

### 7. Auto-crítica (loop 4 del spec §6.5)
Releer la cotización terminada contra Seia, el checklist y el historial. ¿Quedó algo flojo, un precio dudoso, un ítem que siempre se olvida? → `INSERT cotizador_lecciones {tipo:'auto_critica', receta_nombre, cotizacion_id, leccion, ajuste?}`. Una lección concreta vale más que tres genéricas; si no hay nada real, no inventes.
**La lección va DOBLE (spec §6.5 — tabla Y vault, nunca una sola):** además del INSERT, appendeá la lección a `/Users/ezeotero/Obsidian/RAVN/Conocimiento/Precios/lecciones-cotizador.md` (si no existe, crealo con el encabezado `# Lecciones del cotizador`). Formato de línea: `- AAAA-MM-DD [<receta_nombre>] (<tipo>) <lección>`.

### 8. Presentar
Resumen de mesa: receta y su estado (confiable/investigada), total en RANGO (nunca número cerrado), divergencias >25% con tu opinión de cuál parece real, faltantes del checklist, alertas de sanidad, dudas. En sesión: sparring hasta cerrar. Headless: el daemon manda el resumen por el canal (si es WhatsApp, el daemon le agrega al final la línea de aprobación `Respondé OK <id-corto> ... o CORREGIR <id-corto>: ...` — no la escribas vos) y Eze aprueba respondiendo por WhatsApp o desde la app.

## REST de Supabase (credenciales del daemon)
Env: `/Users/ezeotero/.ravn-cotizador/.env` → `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DAEMON_EMAIL`, `DAEMON_PASSWORD`.
```bash
TOKEN=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$DAEMON_EMAIL\",\"password\":\"$DAEMON_PASSWORD\"}" | jq -r .access_token)
# luego: curl "$SUPABASE_URL/rest/v1/<tabla>" -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOKEN"
# insert: -X POST -H "Content-Type: application/json" -H "Prefer: return=representation" -d '<json>'
```
(OJO: el bot NO puede escribir en cotizaciones/recetas/lecciones — usar SIEMPRE las credenciales DAEMON para estas tablas.)

## Economía de tokens (regla de la casa)
- Lo determinístico NUNCA gasta IA: SISMAT es script, el motor es script, la memoria es un GET.
- Seia: índice → solo el destilado del tema.
- Internet: búsquedas batched y solo donde mueven la aguja (regla 80/20 del paso 4).
- Varios laburos en una sesión → una ficha por laburo, compartiendo lo ya investigado.

## Notas
- Sync mensual de SISMAT: `python3 .../sismat/sync.py` (primeros días del mes).
- Estados de `cotizaciones`: `borrador → en_revision → aprobada → documento_emitido` | `rechazada` (el motivo se vuelve lección solo).
- El documento para cliente sale de la app: `/cotizaciones/<id>/documento` (formato Presupuesto oficial).
```

- [ ] **Step 3: Verificar el contenido nuevo**

```bash
grep -c "Jerarquía de fuentes" /Users/ezeotero/.claude/skills/cotizador-maestro/SKILL.md
grep -c "Seia no lo tiene" /Users/ezeotero/.claude/skills/cotizador-maestro/SKILL.md
grep -c "cotizador_lecciones" /Users/ezeotero/.claude/skills/cotizador-maestro/SKILL.md
grep -c "instanciar.ts" /Users/ezeotero/.claude/skills/cotizador-maestro/SKILL.md
grep -c "en_revision" /Users/ezeotero/.claude/skills/cotizador-maestro/SKILL.md
grep -c "presupuesto_id" /Users/ezeotero/.claude/skills/cotizador-maestro/SKILL.md
grep -c "Conocimiento/Recetas" /Users/ezeotero/.claude/skills/cotizador-maestro/SKILL.md
grep -c "lecciones-cotizador.md" /Users/ezeotero/.claude/skills/cotizador-maestro/SKILL.md
```

Expected: todos > 0 (referencia: 1, 1, ≥4, ≥2, ≥4, ≥2, ≥1, ≥1).

No hay commit: el skill vive fuera del repo. El backup `.bak-frente-d` queda como rollback.

---

### Task 20: End-to-end con el daemon real + cierre del frente

Una corrida punta a punta: trabajo `cotizar` en la cola → daemon → Claude headless con el skill nuevo → cotización `en_revision` → mesa en la app. **⚠️ AVISO DE GASTO (regla de Eze): esto consume UNA corrida de Claude headless de varios minutos. Avisale a Eze antes de correr este task y no lo repitas en loop si falla — mostrá el error y consultá.**

**Requiere:** plan A ejecutado (tablas en prod), Tasks 1–19 de este plan hechos, y la app deployada o `npm run dev` corriendo.

**Files:** ninguno (verificación operativa).

- [ ] **Step 1: Avisar a Eze y encolar el trabajo de prueba**

Avisar: "voy a correr el E2E del cotizador — una corrida headless (~5-15 min de daemon)". Con OK:

```bash
cd /Users/ezeotero/Documents/ravn
set -a; source .env.local; set +a
DAEMON_EMAIL=$(grep '^DAEMON_EMAIL=' /Users/ezeotero/.ravn-cotizador/.env | cut -d= -f2-)
DAEMON_PASSWORD=$(grep '^DAEMON_PASSWORD=' /Users/ezeotero/.ravn-cotizador/.env | cut -d= -f2-)
DAEMON_TOKEN=$(curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$DAEMON_EMAIL\",\"password\":\"$DAEMON_PASSWORD\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))")

TRABAJO_ID=$(curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/trabajos_cola" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $DAEMON_TOKEN" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"tipo":"cotizar","origen":"tablero","prompt":"cotizame pintura interior de 80 m2 en Nordelta, paredes en buen estado, calidad estandar, acceso normal sin altura"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
echo "trabajo: $TRABAJO_ID"
```

Expected: un UUID. (Origen `tablero` a propósito: así la corrida no le manda WhatsApp a Eze.)

- [ ] **Step 2: Correr el daemon UNA vez a mano y mirar el log**

```bash
# variables re-derivadas (shell nueva — no dependas del Step 1):
cd /Users/ezeotero/Documents/ravn
set -a; source .env.local; set +a
DAEMON_EMAIL=$(grep '^DAEMON_EMAIL=' /Users/ezeotero/.ravn-cotizador/.env | cut -d= -f2-)
DAEMON_PASSWORD=$(grep '^DAEMON_PASSWORD=' /Users/ezeotero/.ravn-cotizador/.env | cut -d= -f2-)
DAEMON_TOKEN=$(curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$DAEMON_EMAIL\",\"password\":\"$DAEMON_PASSWORD\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))")
# el trabajo del Step 1: el último `cotizar` con origen tablero
TRABAJO_ID=$(curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/trabajos_cola?tipo=eq.cotizar&origen=eq.tablero&order=creado_at.desc&limit=1&select=id" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $DAEMON_TOKEN" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
echo "trabajo: $TRABAJO_ID"

python3 /Users/ezeotero/.ravn-cotizador/daemon.py
```

Expected (varios minutos): líneas `Trabajo #<id> [cotizar] (tablero): cotizame pintura...` y al final `Trabajo #<id> → en_revision (cotización <uuid>)`. Si termina en `→ esperando_datos`, el skill preguntó algo de la ficha: mirá la pregunta, respondé re-encolando y corré de nuevo (UNA vez). El bloque es auto-contenido — re-deriva sus variables como manda la convención del header (puede correr en una shell nueva):

```bash
# re-derivación (convención "Steps auto-contenidos"): credenciales + token + último trabajo
set -a; source /Users/ezeotero/Documents/ravn/.env.local; set +a
DAEMON_EMAIL=$(grep '^DAEMON_EMAIL=' ~/.ravn-cotizador/.env | cut -d= -f2)
DAEMON_PASSWORD=$(grep '^DAEMON_PASSWORD=' ~/.ravn-cotizador/.env | cut -d= -f2)
DAEMON_TOKEN=$(curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$DAEMON_EMAIL\",\"password\":\"$DAEMON_PASSWORD\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
TRABAJO_ID=$(curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/trabajos_cola?tipo=eq.cotizar&origen=eq.tablero&order=creado_at.desc&limit=1&select=id" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $DAEMON_TOKEN" | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["id"])')

curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/trabajos_cola?id=eq.$TRABAJO_ID&select=estado,contexto" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $DAEMON_TOKEN" | python3 -m json.tool
# leer contexto.pregunta y responder:
curl -s -X PATCH "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/trabajos_cola?id=eq.$TRABAJO_ID" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $DAEMON_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"estado":"pendiente","contexto":{"session_id":"<el session_id que quedó en contexto>","respuestas":[{"texto":"<tu respuesta>","ts":"2026-06-12T12:00:00Z"}]}}'
python3 /Users/ezeotero/.ravn-cotizador/daemon.py
```

Si termina en `error` → NO reintentar en loop: leer el log y el campo `error` de la fila, arreglar y consultar a Eze.

- [ ] **Step 3: Verificar la cotización y el evento**

```bash
# variables re-derivadas (shell nueva — no dependas de los steps anteriores):
cd /Users/ezeotero/Documents/ravn
set -a; source .env.local; set +a
DAEMON_EMAIL=$(grep '^DAEMON_EMAIL=' /Users/ezeotero/.ravn-cotizador/.env | cut -d= -f2-)
DAEMON_PASSWORD=$(grep '^DAEMON_PASSWORD=' /Users/ezeotero/.ravn-cotizador/.env | cut -d= -f2-)
DAEMON_TOKEN=$(curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$DAEMON_EMAIL\",\"password\":\"$DAEMON_PASSWORD\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))")
TRABAJO_ID=$(curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/trabajos_cola?tipo=eq.cotizar&origen=eq.tablero&order=creado_at.desc&limit=1&select=id" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $DAEMON_TOKEN" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")

curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/cotizaciones?trabajo_id=eq.$TRABAJO_ID&select=id,titulo,estado,total_min,total_max,presupuesto_id" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $DAEMON_TOKEN" | python3 -m json.tool

curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/eventos?destino_id=eq.$TRABAJO_ID&select=origen,tipo,titulo" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H "Authorization: Bearer $DAEMON_TOKEN" | python3 -m json.tool
```

Expected: una cotización `"estado": "en_revision"` con `total_min`/`total_max` numéricos (con `presupuesto_id` null — la prueba no nombra ninguna obra real, el matching del skill NO debe adivinar), y al menos un evento `"origen": "daemon"`.

- [ ] **Step 4: Mesa de revisión en la app — el gate, a ojo**

Abrir `/cotizaciones` (deploy o `npm run dev`) → la cotización aparece "En revisión" → entrar a la mesa y verificar que se ven: receta con bandera (investigada), ítems con doble precio fechado, fórmulas, checklist, sanidad, dudas, el selector "Obra vinculada — loop de oro" (con el aviso ámbar de sin vínculo), y los botones Aprobar/Rechazar. Probar el selector: elegir un presupuesto cualquiera → recarga y muestra "Vinculada a: …"; volver a "— sin obra vinculada —" para dejar la prueba limpia. **No aprobarla en nombre de Eze: el OK es de él** (puede usar esta misma de prueba para estrenar el flujo aprobar → emitir → documento).

- [ ] **Step 5: Cierre del frente — suite completa y build**

```bash
cd /Users/ezeotero/Documents/ravn
npm test
npx tsc --noEmit
npm run build
```

Expected: `npm test` con los 10 archivos de test del cotizador (texto, formula, instanciar, totales, vencimiento, checklist, sanidad, cotizar, contraste, estado) + los que ya tuviera el repo, **0 failed**; `tsc` sin errores; build OK.

- [ ] **Step 6: Commit de cierre (si quedó algo sin commitear)**

```bash
git status --short
# si hay restos de los tasks anteriores, commitearlos con su task; si está limpio, no hay commit acá.
```

Reportar a Eze: qué quedó andando, el resultado del E2E y el link a la cotización de prueba.

---

## Autorrevisión contra el spec (hecha al escribir el plan)

- §6.2.1 criterio vs cálculo separados → Tasks 2–5, 9 (motor TS puro con tests) + Task 10 (CLI) + prompts/skill que prohíben sumar a mano (Tasks 18–19).
- §6.2.2 recetario paramétrico → shape TS espejo del jsonb (Task 2), instanciador (Task 4), receta semilla (Task 17), creación/refinamiento de recetas en el skill (Task 19) **+ espejo legible `.md` de cada receta en el vault (`Conocimiento/Recetas/<nombre>.md` — Task 19, paso 3)**. La tabla la crea el plan A.
- §6.2.3 checklist anti-olvidos (flete, volquete, consumibles, andamios, limpieza, escombros, imprevistos %, factor zona countries +15–20%) → Tasks 5 y 7.
- §6.2.4 precios con vencimiento `{valor, fuente, fecha}`, 15d/30d → Tasks 2 y 6; mesa los muestra (Task 15). El sync programado de SISMAT/dólar/top-30 es del Frente E (jobs del daemon).
- §6.2.5 calibración con obras reales → Tasks 11–12 (contraste de plata ítem por ítem Y duración real por fechas de gastos vs `dias_min`/`dias_max` al finalizar obra → `cotizador_lecciones`). El vínculo cotización↔obra (`presupuesto_id`) se setea por DOBLE mecanismo: selector de obra en la mesa (Task 15, persiste vía `PATCH` de Task 13 Step 6) y matching por nombre en el skill (Task 19 paso 6, solo match inequívoco). Cuadrilla NO se calibra (no hay dato de personas en `presupuestos_gastos` — ver duda 9).
- §6.2.6 ficha por WhatsApp → Task 18 (`esperando_datos` + `contexto.pregunta`; el bot releva según plan C Tarea 4).
- §6.2.7 sanidad física → Task 8 (rangos + banda $/m²), resultado en `cotizaciones.revision` (Task 9).
- §6.3 jerarquía de fuentes + protocolo "Seia no lo tiene" → Task 19.
- §6.4 mesa de revisión + estados + rechazo→lección + documento final solo con OK → Tasks 13, 15, 16; daemon nunca pasa de `en_revision` (Task 18). Aprobación por WhatsApp ("OK / corregir X" del spec): el daemon cierra el resumen con la gramática `OK <id-corto>` / `CORREGIR <id-corto>: <detalle>` (Task 18); el reconocimiento de la respuesta del owner lo implementa el BOT (plan C — gramática acordada idéntica en ambos planes). Las rutas de transición verifican filas afectadas (`.select()` + 409) — sin éxitos fantasma.
- §6.5 los 4 loops → memoria (skill paso 0 y 2), contraste (11–12), precios frescos (6 + aviso en mesa), auto-crítica (skill paso 7, tipo `auto_critica`, con escritura DOBLE: tabla + `Conocimiento/Precios/lecciones-cotizador.md` del vault).
- Pantallas y API del alcance → Tasks 13–16. Extensión daemon → Task 18. Skill → Task 19. E2E → Task 20.
- Tipos consistentes: `Receta/PrecioItem/ItemDesglose/Desglose/Revision/DatosDocumento/EstadoCotizacion` definidos UNA vez en `tipos.ts` (Task 2) y usados por motor, API, pantallas y documento. `BandaM2` vive en `sanidad.ts`; `EntradaCotizacion/CotizacionCalculada` en `cotizar.ts`; `GastoRealObra/ResultadoContraste` en `contraste.ts`.

## Dudas abiertas (para Eze / coordinación entre frentes)

1. **Usuario daemon = acceso total.** Con las policies del plan A (`not es_bot()`), el usuario `daemon@ravn.local` tiene el mismo acceso que Eze a toda la base. El contrato no define un rol daemon con mínimo privilegio; si se quiere scoping fino haría falta `es_daemon()` + policies por tabla (lo dejé afuera por YAGNI — decisión a validar).
2. **Receta semilla `pintura-interior`** (Task 17): fórmulas y desperdicios armados con criterio de las memorias, pero son MÍOS — queda `investigada` a propósito. Validar números con Eze/Seia antes de la primera cotización real.
3. **Banda $/m² sin tabla propia:** la trae la IA en cada cotización (`banda_m2` con fuente+fecha). Si Eze quiere bandas persistentes por rubro, es una extensión futura (tabla o jsonb en `recetas`).
4. **PDF del documento:** Chrome headless no pasa el middleware de login → el PDF sale del navegador logueado (Cmd+P). Si Eze quiere PDF automatizado, hay que armar bypass con cookie de sesión o un endpoint server-side con service_role (pendiente, no de este frente).
5. **Responder preguntas de ficha desde el tablero:** el contrato queda cubierto (`contexto.respuestas` + estado `pendiente`, igual que el bot), pero la UI para responder desde el tablero es del Frente B; si no existe todavía, los trabajos `origen='tablero'` en `esperando_datos` se contestan re-encolando a mano (como en Task 20 Step 2).
6. **`cotizaciones_cola` tiene filas `estado='latido'`** que violan el CHECK del `schema.sql` original — en prod el check parece relajado. No lo toco: el latido se queda como está y lo migra el Frente E.
7. **`borrador` → `en_revision` no tiene endpoint:** el daemon inserta directo `en_revision`; un borrador manual creado por POST queda sin camino a la mesa hasta que alguien le cargue desglose. Decisión consciente (YAGNI); si molesta, es un endpoint de 10 líneas.
8. **Orden de ejecución entre frentes:** este plan asume plan A ejecutado (tablas + `es_bot()` + Vitest). Si C no está deployado, no pasa nada: el daemon nuevo atiende ambas colas (Task 18). El Frente E es el dueño de migrar el latido y dar de baja `cotizaciones_cola` y los prompts legacy del daemon. La aprobación por WhatsApp es a dos manos: este plan emite la gramática `OK/CORREGIR <id-corto>` (Task 18); el bot que la reconoce es del plan C — hasta que C deploye, las respuestas "OK …" por WhatsApp no hacen nada y Eze aprueba desde la app (la mesa funciona igual desde el día uno).
9. **Cuadrilla no se calibra (recorte consciente del §6.2.5):** `presupuestos_gastos` no registra cuántas personas trabajaron, así que el contraste calibra plata y duración (fechas) pero no cuadrilla. Si Eze quiere calibrar cuadrilla hay que empezar a registrar ese dato al cargar gastos de obra (extensión futura, no de este frente).
