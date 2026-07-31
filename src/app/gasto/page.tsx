import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { parsePropuestaPrefJsonDesdeMismaFila } from "@/lib/ravn-propuesta-pref";
import { GastoScreen, type ObraRapida, type RubroRapido } from "./gasto-screen";

/**
 * /gasto — CARGA RÁPIDA DE GASTOS (obra / empresa / personal).
 *
 * Server component: prefetchea en un solo round-trip lo que la pantalla
 * necesita para llegar interactiva (obras aprobadas + pref de moneda +
 * flag de libreta de Caja, rubros y la fecha de hoy BA) — sin la cascada
 * de 8-10 requests client-side de gastos-screen. Los únicos fetch del
 * cliente son /api/cuentas (SelectorCuenta, compartido) y /api/dolar lazy
 * si aparece una cuenta USD.
 *
 * Detrás del middleware de sesión; service_role solo en el server.
 */

export const dynamic = "force-dynamic";

/** Hoy en zona BA (no UTC): el gasto de la noche cae en el día correcto. */
function hoyBAIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function GastoPage() {
  const sb = createSupabaseAdminClient();

  const [presRes, obrasRes, rubrosRes] = await Promise.all([
    sb
      .from("presupuestos")
      .select("id, nombre_obra, nombre_cliente, fecha, propuesta_comercial_pref")
      .eq("presupuesto_aprobado", true)
      .order("fecha", { ascending: false }),
    sb.from("obras").select("id, presupuesto_id"),
    sb.from("rubros").select("id, nombre").order("id", { ascending: true }),
  ]);

  const obraPorPresupuesto = new Map<string, string>();
  for (const o of (obrasRes.data ?? []) as Array<{
    id: unknown;
    presupuesto_id: unknown;
  }>) {
    if (o.presupuesto_id) {
      obraPorPresupuesto.set(String(o.presupuesto_id), String(o.id));
    }
  }

  const obras: ObraRapida[] = ((presRes.data ?? []) as Array<{
    id: unknown;
    nombre_obra?: string | null;
    nombre_cliente?: string | null;
    propuesta_comercial_pref?: unknown;
  }>).map((p) => {
    const pid = String(p.id);
    const pref = parsePropuestaPrefJsonDesdeMismaFila(
      p.propuesta_comercial_pref,
      pid
    );
    return {
      presupuestoId: pid,
      etiqueta:
        (p.nombre_obra ?? "").trim() ||
        (p.nombre_cliente ?? "").trim() ||
        "Sin nombre",
      obraId: obraPorPresupuesto.get(pid) ?? null,
      cotizacionPref:
        pref && pref.cotizacionVentaArsPorUsd > 0
          ? pref.cotizacionVentaArsPorUsd
          : null,
      casaDolarLabel: pref?.casaDolarLabel ?? null,
    };
  });

  const rubros: RubroRapido[] = ((rubrosRes.data ?? []) as Array<{
    id: unknown;
    nombre: unknown;
  }>).map((r) => ({ id: String(r.id), nombre: String(r.nombre ?? "") }));

  return <GastoScreen obras={obras} rubros={rubros} hoy={hoyBAIso()} />;
}
