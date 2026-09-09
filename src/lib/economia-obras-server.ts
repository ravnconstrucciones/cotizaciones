import { createSupabaseAdminClient } from "./supabase/server";
import { readAll } from "./supabase/read-all";
import { calcularEconomiaObra, type PresEconomico, type ObraEconomica, type GastoEconomico, type MovimientoObra, type AcuerdoEconomico } from "./economia-obras";

export async function cargarEconomiaObras(presupuestoId?: string) {
  const sb = createSupabaseAdminClient();
  const filtro = presupuestoId ? { column: "presupuesto_id", value: presupuestoId } : undefined;
  const [pres, obras, gastos, acuerdos, items, movimientosGlobales] = await Promise.all([
    readAll<PresEconomico & { libreta_caja_empresa?: boolean }>(sb, "presupuestos", "id,nombre_obra,nombre_cliente,presupuesto_aprobado,created_at,propuesta_comercial_pref,rentabilidad_inputs,moneda,libreta_caja_empresa", presupuestoId ? { column: "id", value: presupuestoId } : undefined),
    readAll<ObraEconomica>(sb, "obras", "id,presupuesto_id,monto_total_a_cobrar_ars,monto_total_a_cobrar_usd,finalizada_at,cobranza_cerrada_at,foto_portada_path", filtro),
    readAll<GastoEconomico>(sb, "presupuestos_gastos", "id,presupuesto_id,fecha,descripcion,importe,rubro_id,mo_acuerdo_id,plan_item_id,cashflow_item_id,cuenta_id", filtro),
    readAll<AcuerdoEconomico>(sb, "mo_acuerdos", "id,presupuesto_id,moneda,monto_arreglado,estado", filtro),
    readAll<{id:string;presupuesto_id:string}>(sb, "presupuestos_items", "id,presupuesto_id", filtro),
    presupuestoId ? Promise.resolve(null) : readAll<MovimientoObra>(sb, "cashflow_items", "id,obra_id,tipo,categoria,monto_real,fecha_real,estado,deleted_at,moneda,monto_usd"),
  ]);
  const movimientos = movimientosGlobales ?? (presupuestoId && !obras.length ? [] : await readAll<MovimientoObra>(sb, "cashflow_items", "id,obra_id,tipo,categoria,monto_real,fecha_real,estado,deleted_at,moneda,monto_usd", presupuestoId ? { column: "obra_id", value: obras[0].id } : undefined));
  const porPres = new Map(obras.map(o => [o.presupuesto_id, o]));
  const proyectos = pres.filter(p => !p.libreta_caja_empresa).map(p => calcularEconomiaObra({ ...p, cant_items: items.filter(i=>i.presupuesto_id===p.id).length }, porPres.get(p.id) ?? null, gastos, movimientos, acuerdos)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  const paths = proyectos.map(p => p.fotoPath).filter((p): p is string => Boolean(p));
  if (paths.length) {
    const { data } = await sb.storage.from("obra-archivos").createSignedUrls(paths, 1800);
    const urls = new Map((data ?? []).map(s => [s.path, s.signedUrl]));
    for (const p of proyectos) p.fotoUrl = p.fotoPath ? urls.get(p.fotoPath) ?? null : null;
  }
  return { proyectos, gastos };
}
