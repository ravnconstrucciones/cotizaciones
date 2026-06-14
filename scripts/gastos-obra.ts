/**
 * gastos-obra.ts — responde "¿cuánto llevo gastado en obra X?" con el número
 * REAL de la base, igual que lo ve la app. Lo invoca Claude Code headless en la
 * Mac de Eze cuando el bot encola una pregunta de plata como `orden`.
 *
 * Uso:  cd ~/Documents/ravn && npx tsx scripts/gastos-obra.ts "Saavedra"
 *
 * Qué hace: matchea la obra en `presupuestos` aprobados (por nombre_obra o
 * nombre_cliente, igual que el bot) y suma `presupuestos_gastos.importe` (ARS).
 * Imprime un resumen en texto plano que el asistente relata tal cual.
 *
 * Regla madre: el código consulta y suma; la IA solo relata. NO inventa números.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// .env.local del repo (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
// Parser mínimo sin deps: el script corre local en la Mac, la service key nunca
// sale de acá (lectura exacta de la base, sin trabas de RLS).
// __dirname (= scripts/) funciona porque el repo es CommonJS, igual que instanciar.ts.
function cargarEnv(): Record<string, string> {
  const raiz = join(__dirname, "..");
  const env: Record<string, string> = {};
  try {
    for (const linea of readFileSync(join(raiz, ".env.local"), "utf8").split("\n")) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* sin .env.local: caemos a process.env */
  }
  return { ...env, ...process.env } as Record<string, string>;
}

const ars = (n: number) =>
  "$" + Math.round(n).toLocaleString("es-AR");

async function main() {
  const nombre = process.argv.slice(2).join(" ").trim();
  if (!nombre) {
    console.error('Uso: npx tsx scripts/gastos-obra.ts "<nombre de obra>"');
    process.exit(1);
  }

  const env = cargarEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 1) Matchear la obra (mismo criterio que el bot: presupuestos aprobados).
  const limpio = nombre.replace(/[,()%]/g, " ").trim();
  const patron = `%${limpio}%`;
  const { data: obras, error: errObras } = await sb
    .from("presupuestos")
    .select("id, nombre_obra, nombre_cliente")
    .eq("presupuesto_aprobado", true)
    .or(`nombre_obra.ilike.${patron},nombre_cliente.ilike.${patron}`)
    .order("created_at", { ascending: false })
    .limit(5);

  if (errObras) {
    console.error("Error consultando presupuestos:", errObras.message);
    process.exit(1);
  }
  if (!obras || obras.length === 0) {
    console.log(`No encontré ninguna obra aprobada que matchee "${nombre}". Revisá el nombre o fijate en el tablero.`);
    return;
  }

  // 2) Por cada obra candidata, sumar sus gastos reales (importe en ARS).
  const lineas: string[] = [];
  let totalGlobal = 0;
  for (const o of obras) {
    const titulo = o.nombre_obra || o.nombre_cliente || String(o.id).slice(0, 8);
    const { data: gastos, error: errG } = await sb
      .from("presupuestos_gastos")
      .select("descripcion, importe, fecha")
      .eq("presupuesto_id", o.id)
      .order("fecha", { ascending: false });

    if (errG) {
      lineas.push(`• ${titulo}: error leyendo gastos (${errG.message})`);
      continue;
    }
    const filas = gastos || [];
    const total = filas.reduce((s, g) => s + (Number(g.importe) || 0), 0);
    totalGlobal += total;

    lineas.push(
      `• ${titulo}: ${ars(total)} en ${filas.length} gasto${filas.length === 1 ? "" : "s"}.`
    );
    // Detalle de los últimos 5 movimientos (contexto, no relleno).
    for (const g of filas.slice(0, 5)) {
      const f = g.fecha ? `${g.fecha} · ` : "";
      lineas.push(`    - ${f}${g.descripcion || "(sin detalle)"} — ${ars(Number(g.importe) || 0)}`);
    }
    if (filas.length > 5) lineas.push(`    … y ${filas.length - 5} más.`);
  }

  const encabezado =
    obras.length === 1
      ? `Gastado en ${obras[0].nombre_obra || obras[0].nombre_cliente}: ${ars(totalGlobal)}.`
      : `Encontré ${obras.length} obras que matchean "${nombre}" — total combinado ${ars(totalGlobal)}:`;

  console.log(encabezado);
  console.log(lineas.join("\n"));
  console.log(
    "\n(Es lo gastado/cargado en presupuestos_gastos, en ARS. No incluye el saldo contra lo presupuestado.)"
  );
}

main().catch((e) => {
  console.error("gastos-obra falló:", e?.message || e);
  process.exit(1);
});
