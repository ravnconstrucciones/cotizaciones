import type { SupabaseClient } from "@supabase/supabase-js";
import { roundArs2 } from "@/lib/format-currency";
import { parseNum } from "@/lib/cashflow-compute";
import type { PataEspejo } from "@/lib/dinero-espejo";
import {
  filasEspejoCashflow, filasEspejoGastoEmpresa, filasEspejoGastoObra,
  filasEspejoGastoPersonal, filasEspejoRetiro, filasEspejoTransferencia,
} from "@/lib/dinero-espejo";

/**
 * SINCRONIZADOR del espejo (Fase 2): después de CUALQUIER escritura de plata
 * de la app se llama sincronizarEspejo(admin, tabla, id). Relee la fila de
 * detalle, calcula qué patas DEBERÍAN existir (0 si se borró / no tiene
 * cuenta) y reconcilia contra lo que hay en movimientos_plata para ese
 * origen. Idempotente: llamarlo dos veces no cambia nada. La app escribe
 * ASENTADO directo — la app ES la confirmación de Eze; el borrador es cosa
 * del bot. Sin foto inicial el sync es no-op (nada se espeja sobre bolsillos
 * vacíos). NUNCA lanza hacia el caller: los write-points lo llaman en
 * try/catch y la operación original sale igual.
 */

export type TablaEspejo =
  | "presupuestos_gastos" | "cashflow_items" | "gastos_empresa"
  | "gastos_personales" | "retiros_socio" | "transferencias";

export type ResultadoSync = {
  accion: "sin_foto" | "igual" | "reescrito" | "salteado_financiamiento";
  patas: number;
};

const TIPOS_POR_TABLA: Record<TablaEspejo, string[]> = {
  presupuestos_gastos: ["gasto_obra"],
  cashflow_items: ["cobro", "gasto_obra"],
  gastos_empresa: ["gasto_empresa"],
  gastos_personales: ["gasto_personal"],
  retiros_socio: ["retiro"],
  transferencias: ["transferencia"],
};

const hoyIso = () => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function cuentaDe(admin: SupabaseClient, id: string | null) {
  if (!id) return undefined;
  const { data } = await admin.from("cuentas").select("id, moneda").eq("id", id).maybeSingle();
  return (data as { id: string; moneda: "ARS" | "USD" } | null) ?? undefined;
}

/** Qué patas debería tener hoy esta fila de detalle. Fila borrada → []. */
async function patasEsperadas(
  admin: SupabaseClient, tabla: TablaEspejo, id: string
): Promise<{ patas: PataEspejo[]; origenTipo: string }> {
  switch (tabla) {
    case "presupuestos_gastos": {
      const { data: g } = await admin.from("presupuestos_gastos")
        .select("id, presupuesto_id, importe, cuenta_id, cotizacion_venta_ars_por_usd, fecha, descripcion")
        .eq("id", id).maybeSingle();
      if (!g) return { patas: [], origenTipo: "gasto_obra" };
      const cuenta = await cuentaDe(admin, g.cuenta_id);
      return {
        origenTipo: "gasto_obra",
        patas: filasEspejoGastoObra(
          { ...g, fecha: g.fecha ?? hoyIso(), descripcion: g.descripcion ?? "" }, cuenta),
      };
    }
    case "cashflow_items": {
      const { data: m } = await admin.from("cashflow_items")
        .select("id, obra_id, tipo, monto_real, monto_usd, cuenta_id, deleted_at, fecha_real, fecha_proyectada, descripcion")
        .eq("id", id).maybeSingle();
      const origenTipo = m?.tipo === "egreso" ? "gasto_obra" : "cobro";
      if (!m) return { patas: [], origenTipo: "cobro" };
      const [{ data: obra }, { count }] = await Promise.all([
        admin.from("obras").select("presupuesto_id").eq("id", m.obra_id).maybeSingle(),
        admin.from("presupuestos_gastos").select("id", { count: "exact", head: true })
          .eq("cashflow_item_id", id),
      ]);
      const cuenta = await cuentaDe(admin, m.cuenta_id);
      return {
        origenTipo,
        patas: filasEspejoCashflow(
          { ...m, fecha: m.fecha_real ?? m.fecha_proyectada ?? hoyIso(), descripcion: m.descripcion ?? "" },
          cuenta, obra?.presupuesto_id ?? null, (count ?? 0) > 0),
      };
    }
    case "gastos_empresa": {
      const { data: g } = await admin.from("gastos_empresa")
        .select("id, monto, moneda, cuenta_id, fecha, concepto").eq("id", id).maybeSingle();
      if (!g) return { patas: [], origenTipo: "gasto_empresa" };
      const cuenta = await cuentaDe(admin, g.cuenta_id);
      return {
        origenTipo: "gasto_empresa",
        patas: filasEspejoGastoEmpresa(
          { ...g, fecha: g.fecha ?? hoyIso(), descripcion: g.concepto ?? "" }, cuenta),
      };
    }
    case "gastos_personales": {
      const { data: g } = await admin.from("gastos_personales")
        .select("id, monto, cuenta_id, fecha, concepto").eq("id", id).maybeSingle();
      if (!g) return { patas: [], origenTipo: "gasto_personal" };
      const cuenta = await cuentaDe(admin, g.cuenta_id);
      return {
        origenTipo: "gasto_personal",
        patas: filasEspejoGastoPersonal(
          { ...g, fecha: g.fecha ?? hoyIso(), descripcion: g.concepto ?? "" }, cuenta),
      };
    }
    case "retiros_socio": {
      const { data: r } = await admin.from("retiros_socio")
        .select("id, tipo, monto_ars, cuenta_id, fecha, concepto").eq("id", id).maybeSingle();
      if (!r) return { patas: [], origenTipo: "retiro" };
      const cuenta = await cuentaDe(admin, r.cuenta_id);
      return {
        origenTipo: "retiro",
        patas: filasEspejoRetiro(
          { ...r, fecha: r.fecha ?? hoyIso(), descripcion: r.concepto ?? "" }, cuenta),
      };
    }
    case "transferencias": {
      const { data: t } = await admin.from("transferencias")
        .select("id, cuenta_origen_id, cuenta_destino_id, monto_origen, monto_destino, fecha, concepto")
        .eq("id", id).maybeSingle();
      if (!t) return { patas: [], origenTipo: "transferencia" };
      const ids = [t.cuenta_origen_id, t.cuenta_destino_id].filter(Boolean) as string[];
      const { data: cuentas } = await admin.from("cuentas")
        .select("id, moneda, obra_id").in("id", ids);
      const porId = new Map((cuentas ?? []).map((c) => [c.id, c]));
      const origen = porId.get(t.cuenta_origen_id ?? "");
      const destino = porId.get(t.cuenta_destino_id ?? "");
      // Dueño default (convención F2): obra de la cuenta destino, sino de la
      // de origen, sino empresa. Los cruces reales se cargan por bot.
      const obraId = destino?.obra_id ?? origen?.obra_id ?? null;
      const dueno = obraId
        ? { dueno_tipo: "obra" as const, dueno_obra_id: obraId }
        : { dueno_tipo: "empresa" as const, dueno_obra_id: null };
      return {
        origenTipo: "transferencia",
        patas: filasEspejoTransferencia(
          { ...t, fecha: t.fecha ?? hoyIso(), descripcion: t.concepto ?? "" },
          origen, destino, dueno),
      };
    }
  }
}

const clavePata = (p: { cuenta_id: string; dueno_tipo: string; dueno_obra_id: string | null; moneda: string; monto: unknown }) =>
  `${p.cuenta_id}|${p.dueno_tipo}|${p.dueno_obra_id ?? ""}|${p.moneda}|${roundArs2(parseNum(p.monto))}`;

export async function sincronizarEspejo(
  admin: SupabaseClient, tabla: TablaEspejo, id: string
): Promise<ResultadoSync> {
  // Sin foto inicial no se espeja nada (bolsillos vacíos = ledger apagado).
  const { count: foto } = await admin.from("movimientos_plata")
    .select("id", { count: "exact", head: true })
    .eq("origen_tipo", "foto_inicial").eq("estado", "asentado");
  if (!foto) return { accion: "sin_foto", patas: 0 };

  const { patas: esperadas, origenTipo } = await patasEsperadas(admin, tabla, id);

  const { data: existentes } = await admin.from("movimientos_plata")
    .select("id, grupo_id, cuenta_id, dueno_tipo, dueno_obra_id, monto, moneda")
    .eq("origen_id", id).in("origen_tipo", TIPOS_POR_TABLA[tabla]);
  const viejas = existentes ?? [];

  const iguales =
    viejas.length === esperadas.length &&
    [...viejas].map(clavePata).sort().join("\n") ===
    [...esperadas].map(clavePata).sort().join("\n");
  if (iguales) return { accion: "igual", patas: viejas.length };

  // Grupos con financiamiento son operaciones del bot con libro de deudas:
  // reescribirlos rompería el vínculo — se saltea y queda para conciliar.
  if (viejas.length) {
    const grupos = [...new Set(viejas.map((v) => v.grupo_id))];
    const { count: fin } = await admin.from("financiamientos")
      .select("id", { count: "exact", head: true }).in("origen_grupo_id", grupos);
    if (fin) {
      console.error(`[dinero-sync] ${tabla}/${id}: grupo con financiamiento, no se reescribe (a conciliar)`);
      return { accion: "salteado_financiamiento", patas: viejas.length };
    }
    await admin.from("movimientos_plata").delete().eq("origen_id", id)
      .in("origen_tipo", TIPOS_POR_TABLA[tabla]);
  }

  if (esperadas.length) {
    const grupo = crypto.randomUUID();
    await admin.from("movimientos_plata").insert(esperadas.map((p) => ({
      ...p, grupo_id: grupo, origen_tipo: origenTipo, origen_id: id, estado: "asentado",
    })));
  }
  return { accion: "reescrito", patas: esperadas.length };
}
