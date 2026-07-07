/* Sesión de FOTO INICIAL del módulo Dinero (Fase 2) y chequeo de convivencia.
 *   npx tsx scripts/dinero-foto.ts saldos   → saldo motor vs Σ bolsillos, por cuenta
 *   npx tsx scripts/dinero-foto.ts check    → divergencias (exit 1 si hay)
 * Lee .env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseNum } from "../src/lib/cashflow-compute";
import { saldosPorCuenta } from "../src/lib/cuentas";
import { chequeoConsistencia, saldosCuentasDesdeLedger } from "../src/lib/dinero";

// .env.local sin dotenv (mismo parser mínimo que gastos-obra.ts: cero deps,
// el script corre local en la Mac y la service key nunca sale de acá).
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

const env = cargarEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

async function motor() {
  const [cuentas, gastosObra, cashflow, retiros, personales, empresa, transferencias, ajustes] = await Promise.all([
    admin.from("cuentas").select("*").eq("activa", true).order("orden"),
    admin.from("presupuestos_gastos").select("cuenta_id, importe, cotizacion_venta_ars_por_usd, cashflow_item_id").not("cuenta_id", "is", null),
    admin.from("cashflow_items").select("id, cuenta_id, tipo, monto_real, moneda, monto_usd, deleted_at").not("cuenta_id", "is", null).is("deleted_at", null),
    admin.from("retiros_socio").select("cuenta_id, tipo, monto_ars").not("cuenta_id", "is", null),
    admin.from("gastos_personales").select("cuenta_id, monto").not("cuenta_id", "is", null),
    admin.from("gastos_empresa").select("cuenta_id, monto, moneda").not("cuenta_id", "is", null),
    admin.from("transferencias").select("cuenta_origen_id, cuenta_destino_id, monto_origen, monto_destino"),
    admin.from("cuenta_ajustes").select("cuenta_id, delta"),
  ]);
  // PostgREST devuelve numeric como STRING; roundArs2 no coerciona → sin esto
  // saldo_inicial cae a 0. Misma coerción que /api/cuentas (route.ts, num()).
  const cuentasNum = (cuentas.data ?? []).map((c) => ({
    ...c,
    saldo_inicial: parseNum(c.saldo_inicial),
  }));
  return saldosPorCuenta({
    cuentas: cuentasNum, gastosObra: gastosObra.data ?? [],
    cashflow: cashflow.data ?? [], retiros: retiros.data ?? [],
    gastosPersonales: personales.data ?? [], gastosEmpresa: empresa.data ?? [],
    transferencias: transferencias.data ?? [], ajustes: ajustes.data ?? [],
  });
}

async function main() {
  const modo = process.argv[2] ?? "saldos";
  const [s, movs] = await Promise.all([
    motor(),
    admin.from("movimientos_plata").select("id, cuenta_id, dueno_tipo, dueno_obra_id, monto, moneda, grupo_id, origen_tipo, estado"),
  ]);
  const ledger = saldosCuentasDesdeLedger((movs.data ?? []) as never);
  if (modo === "saldos") {
    for (const c of s.cuentas.filter((c) => c.activa)) {
      const l = ledger.get(c.id);
      console.log(`${c.nombre.padEnd(34)} ${c.moneda}  motor=${c.saldo}  ledger=${l ?? "—"}`);
    }
    return;
  }
  const saldosMotor = new Map(s.cuentas.map((c) => [c.id, c.saldo]));
  const div = chequeoConsistencia((movs.data ?? []) as never, saldosMotor);
  if (!div.length) { console.log("✅ consistencia OK: ledger = motor en todas las cuentas del ledger"); return; }
  const nombres = new Map(s.cuentas.map((c) => [c.id, c.nombre]));
  for (const d of div) console.log(`⚠️ ${nombres.get(d.cuenta_id) ?? d.cuenta_id}: ledger=${d.saldoLedger} motor=${d.saldoMotor} delta=${d.delta}`);
  process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
