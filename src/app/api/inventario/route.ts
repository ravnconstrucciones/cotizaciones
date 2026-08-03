import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const db = createSupabaseAdminClient();
    const { data: obras, error: obrasError } = await db.from("obras").select("id, finalizada_at, presupuestos!inner(nombre_obra, nombre_cliente, estado)");
    if (obrasError) throw obrasError;
    for (const raw of obras ?? []) {
      const o = raw as unknown as { id: string; finalizada_at: string | null; presupuestos: { nombre_obra: string | null; nombre_cliente: string | null; estado: string | null } };
      const activa = !o.finalizada_at && o.presupuestos.estado !== "finalizado";
      const nombre = o.presupuestos.nombre_obra?.trim() || o.presupuestos.nombre_cliente?.trim() || "Obra sin nombre";
      await db.from("inventario_ubicaciones").upsert({ clave: `obra-${o.id}`, nombre, tipo: "obra", obra_id: o.id, activa }, { onConflict: "obra_id" });
    }
    const [u, i, m] = await Promise.all([
      db.from("inventario_ubicaciones").select("id,clave,nombre,tipo,obra_id").eq("activa", true).order("tipo").order("nombre"),
      db.from("inventario_items").select("id,nombre,tipo,rubro,cantidad,unidad,cantidad_texto,ubicacion_id,estado_revision,nota_revision").eq("activo", true).order("nombre"),
      db.from("inventario_movimientos").select("id,item_id,origen_id,destino_id,texto_original,nota,creado_at").order("creado_at", { ascending: false }).limit(100),
    ]);
    if (u.error || i.error || m.error) throw u.error ?? i.error ?? m.error;
    return NextResponse.json({ ubicaciones: u.data, items: i.data, movimientos: m.data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo cargar el inventario." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { item_id?: string; origen_id?: string; destino_id?: string; texto_original?: string; nota?: string };
    if (!body.item_id || !body.origen_id || !body.destino_id || body.origen_id === body.destino_id) {
      return NextResponse.json({ error: "Ítem, origen y destino válidos son obligatorios." }, { status: 400 });
    }
    const db = createSupabaseAdminClient();
    // La función SQL bloquea el ítem y registra historial + ubicación en una
    // única transacción. La ruta usa admin porque la sesión ya está protegida
    // por middleware y los endpoints existentes siguen este mismo patrón.
    const { error: moveError } = await db.rpc("mover_inventario_item", {
      p_item_id: body.item_id,
      p_origen_id: body.origen_id,
      p_destino_id: body.destino_id,
      p_texto_original: body.texto_original?.slice(0, 500) || null,
      p_nota: body.nota?.slice(0, 500) || null,
    });
    if (moveError) {
      const conflict = moveError.message.toLowerCase().includes("cambió");
      return NextResponse.json({ error: conflict ? "La ubicación cambió. Recargá y revisá el movimiento." : moveError.message }, { status: conflict ? 409 : 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo registrar el movimiento." }, { status: 500 });
  }
}
