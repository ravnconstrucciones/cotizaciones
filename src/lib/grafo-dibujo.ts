import { COORD_MAX, type GrafoVault } from "@/lib/grafo";

/**
 * Dibujo del grafo en canvas — compartido entre la pantalla /grafo y la
 * mini-preview de la home. Screen-space puro: acá no hay física ni layout
 * (viene precalculado), solo proyección x' = x·escala·k + off y pintado
 * batcheado (una pasada de aristas, nodos agrupados por color).
 */

export type VistaGrafo = {
  /** Zoom (1 = encaja todo el grafo en el canvas). */
  k: number;
  /** Offset en px de pantalla. */
  ox: number;
  oy: number;
};

export type OpcionesDibujo = {
  tema: "dark" | "light";
  /** Comunidad resaltada (leyenda) o null. */
  comunidadActiva: number | null;
  /** Índice del nodo seleccionado o null. */
  nodoActivo: number | null;
  /** Índices que matchean la búsqueda (se resaltan) o null. */
  busqueda: Set<number> | null;
  /** Dibuja etiquetas de los nodos grandes según zoom. */
  etiquetas: boolean;
  /** Alpha global 0-1 (para la entrada animada). */
  alpha: number;
};

/** Tonos base por comunidad (monocromo con variación de luminancia — ADN
 *  RAVN: cero arcoíris). El acento cian queda para lo activo/seleccionado. */
const LUMINANCIAS_DARK = [82, 72, 62, 54, 47, 40];
const LUMINANCIAS_LIGHT = [30, 40, 48, 56, 63, 70];

export const ACENTO = { dark: "#22d3ee", light: "#0891b2" };

function tonoComunidad(comunidad: number, tema: "dark" | "light"): string {
  const lum =
    tema === "dark"
      ? LUMINANCIAS_DARK[comunidad % LUMINANCIAS_DARK.length]
      : LUMINANCIAS_LIGHT[comunidad % LUMINANCIAS_LIGHT.length];
  return `hsl(220 9% ${lum}%)`;
}

/** Escala base para que el grafo encaje en (ancho, alto) con padding. */
export function escalaBase(ancho: number, alto: number, padding = 24): number {
  return Math.min(ancho - padding * 2, alto - padding * 2) / COORD_MAX;
}

/** Vista inicial: grafo entero centrado. */
export function vistaInicial(ancho: number, alto: number): VistaGrafo {
  const e = escalaBase(ancho, alto);
  return {
    k: 1,
    ox: (ancho - COORD_MAX * e) / 2,
    oy: (alto - COORD_MAX * e) / 2,
  };
}

export function proyectar(
  x: number,
  y: number,
  vista: VistaGrafo,
  base: number
): [number, number] {
  return [x * base * vista.k + vista.ox, y * base * vista.k + vista.oy];
}

/** Radio en px de pantalla: crece con el grado, amortiguado con el zoom. */
export function radioNodo(grado: number, k: number): number {
  return (1.1 + Math.sqrt(grado) * 0.75) * Math.pow(k, 0.55);
}

export function dibujarGrafo(
  ctx: CanvasRenderingContext2D,
  g: GrafoVault,
  vista: VistaGrafo,
  ancho: number,
  alto: number,
  op: OpcionesDibujo
): void {
  const base = escalaBase(ancho, alto);
  const { k } = vista;
  const dark = op.tema === "dark";
  const hayFoco =
    op.comunidadActiva !== null || (op.busqueda !== null && op.busqueda.size > 0);

  ctx.clearRect(0, 0, ancho, alto);
  ctx.globalAlpha = op.alpha;

  // Proyección una sola vez.
  const px = new Float32Array(g.nodos.length);
  const py = new Float32Array(g.nodos.length);
  for (let i = 0; i < g.nodos.length; i++) {
    const n = g.nodos[i];
    px[i] = n[0] * base * k + vista.ox;
    py[i] = n[1] * base * k + vista.oy;
  }

  const enFoco = (i: number): boolean => {
    if (!hayFoco) return true;
    if (op.busqueda && op.busqueda.size > 0) return op.busqueda.has(i);
    return g.nodos[i][3] === op.comunidadActiva;
  };

  // ── Aristas: dos pasadas (apagadas / en foco) para batchear color ──
  const alphaArista = dark ? 0.075 : 0.09;
  ctx.lineWidth = Math.min(1, 0.5 + k * 0.15);
  for (const pasada of [false, true]) {
    ctx.beginPath();
    let hay = false;
    for (const [a, b] of g.aristas) {
      const foco = enFoco(a) && enFoco(b);
      if (foco !== pasada) continue;
      ctx.moveTo(px[a], py[a]);
      ctx.lineTo(px[b], py[b]);
      hay = true;
    }
    if (!hay) continue;
    const alfa = pasada
      ? hayFoco
        ? alphaArista * 4
        : alphaArista
      : alphaArista * 0.35;
    ctx.strokeStyle = dark
      ? `rgba(244,244,245,${alfa})`
      : `rgba(24,24,27,${alfa})`;
    ctx.stroke();
  }

  // ── Nodos: agrupados por color para minimizar cambios de estado ──
  const grupos = new Map<string, number[]>();
  for (let i = 0; i < g.nodos.length; i++) {
    const n = g.nodos[i];
    const foco = enFoco(i);
    let color: string;
    if (!foco) {
      color = dark ? "hsl(220 9% 30% / 0.35)" : "hsl(220 9% 72% / 0.5)";
    } else if (hayFoco) {
      color = ACENTO[op.tema];
    } else {
      color = tonoComunidad(n[3], op.tema);
    }
    const lista = grupos.get(color);
    if (lista) lista.push(i);
    else grupos.set(color, [i]);
  }
  for (const [color, indices] of grupos) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const i of indices) {
      const r = radioNodo(g.nodos[i][2], k);
      ctx.moveTo(px[i] + r, py[i]);
      ctx.arc(px[i], py[i], r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // ── Nodo activo: anillo + punto acento ──
  if (op.nodoActivo !== null && g.nodos[op.nodoActivo]) {
    const i = op.nodoActivo;
    const r = radioNodo(g.nodos[i][2], k);
    ctx.strokeStyle = ACENTO[op.tema];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px[i], py[i], r + 3.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ACENTO[op.tema];
    ctx.beginPath();
    ctx.arc(px[i], py[i], Math.max(r, 2.2), 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Etiquetas: los hubs según zoom + el activo siempre ──
  if (op.etiquetas) {
    const umbralGrado = k > 3.5 ? 3 : k > 2 ? 8 : 14;
    ctx.font =
      '10px "Space Grotesk", ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = "middle";
    for (let i = 0; i < g.nodos.length; i++) {
      const n = g.nodos[i];
      const esActivo = i === op.nodoActivo;
      if (!esActivo && (n[2] < umbralGrado || !enFoco(i))) continue;
      if (
        px[i] < -50 || px[i] > ancho + 50 ||
        py[i] < -20 || py[i] > alto + 20
      )
        continue;
      const r = radioNodo(n[2], k);
      ctx.fillStyle = esActivo
        ? ACENTO[op.tema]
        : dark
          ? "rgba(244,244,245,0.62)"
          : "rgba(24,24,27,0.62)";
      ctx.fillText(n[4], px[i] + r + 4, py[i]);
    }
  }

  ctx.globalAlpha = 1;
}

/** Índice del nodo más cercano a (sx, sy) dentro de `radio` px, o null. */
export function nodoEn(
  g: GrafoVault,
  vista: VistaGrafo,
  ancho: number,
  alto: number,
  sx: number,
  sy: number,
  radio = 14
): number | null {
  const base = escalaBase(ancho, alto);
  let mejor: number | null = null;
  let mejorD = radio * radio;
  for (let i = 0; i < g.nodos.length; i++) {
    const n = g.nodos[i];
    const dx = n[0] * base * vista.k + vista.ox - sx;
    const dy = n[1] * base * vista.k + vista.oy - sy;
    const d = dx * dx + dy * dy;
    if (d < mejorD) {
      mejorD = d;
      mejor = i;
    }
  }
  return mejor;
}
