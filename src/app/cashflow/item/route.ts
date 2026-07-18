import { NextResponse } from "next/server";
import { categoriaValidaParaTipo } from "@/lib/cashflow-validate";
import { todayBuenosAires, type CashflowTipo } from "@/lib/cashflow-compute";
import { estadoDesdeTipo } from "@/lib/cashflow-matching";
import { roundArs2 } from "@/lib/format-currency";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { sincronizarEspejo } from "@/lib/dinero-sync";

type Body = {
  obra_id?: string;
  tipo?: string;
  categoria?: string;
  descripcion?: string;
  /** Atajos de libreta (se copian a proy. y real) */
  monto?: number;
  fecha?: string;
  monto_proyectado?: number;
  fecha_proyectada?: string;
  monto_real?: number | null;
  fecha_real?: string | null;
  estado?: string;
  notas?: string;
  /** Operación en dólares: moneda USD + cantidad de billetes (el monto ARS es el equivalente). */
  moneda?: string;
  monto_usd?: number | null;
};

const ESTADOS = new Set(["pendiente", "cobrado", "pagado", "vencido"]);

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const obra_id = body.obra_id?.trim();
    const tipo: CashflowTipo =
      body.tipo === "egreso" ? "egreso" : "ingreso";
    const hoy = todayBuenosAires();

    const rawMonto =
      body.monto ?? body.monto_proyectado ?? body.monto_real ?? NaN;
    const m = roundArs2(Number(rawMonto));
    const fecha = String(
      body.fecha ?? body.fecha_proyectada ?? body.fecha_real ?? hoy
    ).slice(0, 10);

    let categoria = String(body.categoria ?? "").trim();
    if (!categoria || !categoriaValidaParaTipo(tipo, categoria)) {
      categoria = "otro";
    }

    const descripcion = String(body.descripcion ?? "").trim();
    const notas = String(body.notas ?? "").trim();
    const estadoDefault = estadoDesdeTipo(tipo);
    const estado = ESTADOS.has(String(body.estado))
      ? String(body.estado)
      : estadoDefault;

    if (!obra_id) {
      return NextResponse.json({ error: "obra_id requerido." }, { status: 400 });
    }
    if (!Number.isFinite(m) || m <= 0) {
      return NextResponse.json(
        { error: "Indicá un monto válido mayor a cero." },
        { status: 400 }
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return NextResponse.json(
        { error: "fecha debe ser YYYY-MM-DD." },
        { status: 400 }
      );
    }

    const moneda = body.moneda === "USD" ? "USD" : "ARS";
    const montoUsd =
      moneda === "USD" ? roundArs2(Number(body.monto_usd ?? NaN)) : null;
    if (moneda === "USD" && (!Number.isFinite(montoUsd!) || montoUsd! <= 0)) {
      return NextResponse.json(
        { error: "Operación en dólares: indicá la cantidad de US$ (mayor a cero)." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const { data: obra, error: eObra } = await supabase
      .from("obras")
      .select("id")
      .eq("id", obra_id)
      .maybeSingle();
    if (eObra) {
      return NextResponse.json({ error: eObra.message }, { status: 500 });
    }
    if (!obra) {
      return NextResponse.json({ error: "Obra no encontrada." }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("cashflow_items")
      .insert({
        obra_id,
        tipo,
        categoria,
        descripcion,
        monto_proyectado: m,
        fecha_proyectada: fecha,
        monto_real: m,
        fecha_real: fecha,
        estado,
        notas,
        moneda,
        monto_usd: montoUsd,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Espejo Dinero (Fase 2): best-effort, jamás rompe la operación original.
    await sincronizarEspejo(supabase, "cashflow_items", data.id).catch((e) =>
      console.error("[dinero espejo]", e)
    );

    return NextResponse.json({ item: data }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
