import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/obras — ALTA DE OBRA desde el cockpit (botón "+ NUEVA OBRA").
 *
 * Eze es constructor: a veces arranca una obra sin pasar por el presupuesto
 * formal con ítems (eso sigue en /nuevo-presupuesto). Este endpoint da de alta
 * la obra liviana: crea un presupuesto YA APROBADO (presupuesto_aprobado=true,
 * estado en_curso) — el trigger presupuestos_after_insert_obra le crea su fila
 * en `obras` —, opcionalmente carga el primer avance (instancia/estado inicial),
 * y la obra aparece de inmediato como ACTIVA en home y galería, lista para
 * cargarle avances y gastos.
 *
 * Service_role (bypass RLS) — la ruta vive detrás del middleware (sesión).
 * NO toca el flujo de /nuevo-presupuesto (ese arma el presupuesto con ítems).
 */

type Body = {
  nombre_obra?: string;
  nombre_cliente?: string;
  /** Instancia/estado inicial opcional → primer avance en obra_avances. */
  instancia_inicial?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const nombreObra = (body.nombre_obra ?? "").trim();
    const nombreCliente = (body.nombre_cliente ?? "").trim();
    const instancia = (body.instancia_inicial ?? "").trim();

    if (!nombreObra) {
      return NextResponse.json(
        { error: "El nombre de la obra es obligatorio." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const hoy = new Date().toISOString().slice(0, 10);

    // Presupuesto aprobado y en curso → entra de una a las obras activas.
    // numero_correlativo / prefijo se autoasignan; el resto toma sus defaults.
    const { data: pres, error: ePres } = await supabase
      .from("presupuestos")
      .insert({
        nombre_obra: nombreObra.slice(0, 200),
        nombre_cliente: (nombreCliente || nombreObra).slice(0, 200),
        presupuesto_aprobado: true,
        estado: "en_curso",
        fecha: hoy,
      })
      .select("id")
      .single();

    if (ePres || !pres) {
      return NextResponse.json(
        { error: ePres?.message ?? "No se pudo crear la obra." },
        { status: 500 }
      );
    }

    const presupuestoId = String((pres as { id: string }).id);

    // El trigger ya debería haber creado la fila en obras; la aseguramos de
    // forma defensiva (mismo patrón que planificar-confirmar) por si en algún
    // entorno el trigger no estuviera activo.
    let { data: obra, error: eObra } = await supabase
      .from("obras")
      .select("id")
      .eq("presupuesto_id", presupuestoId)
      .maybeSingle();

    if (eObra) {
      return NextResponse.json({ error: eObra.message }, { status: 500 });
    }
    if (!obra) {
      const ins = await supabase
        .from("obras")
        .insert({ presupuesto_id: presupuestoId })
        .select("id")
        .single();
      if (ins.error || !ins.data) {
        return NextResponse.json(
          { error: ins.error?.message ?? "No se pudo crear la obra." },
          { status: 500 }
        );
      }
      obra = ins.data;
    }

    const obraId = String((obra as { id: string }).id);

    // Instancia/estado inicial → primer avance de la bitácora (best-effort:
    // si falla, la obra ya quedó creada; no la tiramos por esto).
    if (instancia) {
      await supabase.from("obra_avances").insert({
        presupuesto_id: presupuestoId,
        texto: `Obra iniciada — ${instancia}`,
        instancia,
      });
    }

    return NextResponse.json({
      ok: true,
      obra_id: obraId,
      presupuesto_id: presupuestoId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
