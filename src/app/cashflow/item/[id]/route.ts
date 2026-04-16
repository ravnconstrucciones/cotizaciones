import { NextResponse } from "next/server";
import { categoriaValidaParaTipo } from "@/lib/cashflow-validate";
import type { CashflowTipo } from "@/lib/cashflow-compute";
import { estadoDesdeTipo } from "@/lib/cashflow-matching";
import { roundArs2 } from "@/lib/format-currency";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

const ESTADOS = new Set(["pendiente", "cobrado", "pagado", "vencido"]);

type Body = {
  tipo?: string;
  categoria?: string;
  descripcion?: string;
  monto_proyectado?: number;
  fecha_proyectada?: string;
  monto_real?: number | null;
  fecha_real?: string | null;
  estado?: string;
  notas?: string;
  adjunto_path?: string | null;
  adjunto_kind?: string | null;
};

export async function PUT(req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as Body;
    const supabase = createSupabaseServerClient();

    const { data: existing, error: e0 } = await supabase
      .from("cashflow_items")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (e0) {
      return NextResponse.json({ error: e0.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Ítem no encontrado." }, { status: 404 });
    }

    const patch: Record<string, unknown> = {};

    if (body.descripcion !== undefined) {
      patch.descripcion = String(body.descripcion ?? "").trim();
    }
    if (body.notas !== undefined) {
      patch.notas = String(body.notas ?? "").trim();
    }
    if (body.adjunto_path !== undefined) {
      const p = body.adjunto_path;
      patch.adjunto_path =
        p === null || p === "" ? null : String(p).trim();
    }
    if (body.adjunto_kind !== undefined) {
      const k = body.adjunto_kind;
      if (k === null || k === "") {
        patch.adjunto_kind = null;
      } else if (k === "foto" || k === "audio") {
        patch.adjunto_kind = k;
      } else {
        return NextResponse.json(
          { error: "adjunto_kind inválido." },
          { status: 400 }
        );
      }
    }
    if (body.estado !== undefined) {
      const st = String(body.estado);
      if (!ESTADOS.has(st)) {
        return NextResponse.json({ error: "estado inválido." }, { status: 400 });
      }
      patch.estado = st;
    }

    let tipo: CashflowTipo =
      existing.tipo === "egreso" ? "egreso" : "ingreso";
    if (body.tipo !== undefined) {
      tipo = body.tipo === "egreso" ? "egreso" : "ingreso";
      patch.tipo = tipo;
    }

    if (body.categoria !== undefined) {
      const cat = String(body.categoria).trim();
      if (!categoriaValidaParaTipo(tipo, cat)) {
        return NextResponse.json(
          { error: "Categoría inválida para el tipo." },
          { status: 400 }
        );
      }
      patch.categoria = cat;
    } else if (body.tipo !== undefined) {
      const cat = String(existing.categoria);
      if (!categoriaValidaParaTipo(tipo, cat)) {
        return NextResponse.json(
          {
            error:
              "El tipo no admite la categoría actual; cambiá también categoria.",
          },
          { status: 400 }
        );
      }
    }

    if (body.monto_proyectado !== undefined) {
      const mp = roundArs2(Number(body.monto_proyectado));
      if (!Number.isFinite(mp) || mp < 0) {
        return NextResponse.json(
          { error: "monto_proyectado inválido." },
          { status: 400 }
        );
      }
      patch.monto_proyectado = mp;
    }
    if (body.fecha_proyectada !== undefined) {
      const fp = String(body.fecha_proyectada).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fp)) {
        return NextResponse.json(
          { error: "fecha_proyectada debe ser YYYY-MM-DD." },
          { status: 400 }
        );
      }
      patch.fecha_proyectada = fp;
    }

    if (body.monto_real !== undefined || body.fecha_real !== undefined) {
      const mr =
        body.monto_real === undefined
          ? existing.monto_real == null
            ? null
            : roundArs2(Number(existing.monto_real))
          : body.monto_real === null
            ? null
            : roundArs2(Number(body.monto_real));
      const fr =
        body.fecha_real === undefined
          ? existing.fecha_real == null || existing.fecha_real === ""
            ? null
            : String(existing.fecha_real).slice(0, 10)
          : body.fecha_real === null || body.fecha_real === ""
            ? null
            : String(body.fecha_real).slice(0, 10);

      if (mr != null && (!Number.isFinite(mr) || mr < 0)) {
        return NextResponse.json({ error: "monto_real inválido." }, { status: 400 });
      }
      if (fr && !/^\d{4}-\d{2}-\d{2}$/.test(fr)) {
        return NextResponse.json(
          { error: "fecha_real debe ser YYYY-MM-DD." },
          { status: 400 }
        );
      }
      if ((mr == null) !== (fr == null)) {
        return NextResponse.json(
          { error: "monto_real y fecha_real van juntos o ambos null." },
          { status: 400 }
        );
      }
      patch.monto_real = mr;
      patch.fecha_real = fr;
    }

    const touchesMontos =
      body.monto_real !== undefined ||
      body.fecha_real !== undefined ||
      body.monto_proyectado !== undefined ||
      body.fecha_proyectada !== undefined;
    if (touchesMontos) {
      const ex = existing as Record<string, unknown>;
      const mr =
        patch.monto_real !== undefined
          ? patch.monto_real
          : ex.monto_real != null
            ? roundArs2(Number(ex.monto_real))
            : null;
      const fr =
        patch.fecha_real !== undefined
          ? patch.fecha_real
          : ex.fecha_real
            ? String(ex.fecha_real).slice(0, 10)
            : null;
      if (mr != null && fr != null && typeof mr === "number") {
        patch.monto_real = mr;
        patch.fecha_real = fr;
        patch.monto_proyectado = mr;
        patch.fecha_proyectada = fr;
        if (body.estado === undefined) {
          patch.estado = estadoDesdeTipo(tipo);
        }
      } else {
        const mpRaw =
          patch.monto_proyectado !== undefined
            ? patch.monto_proyectado
            : ex.monto_proyectado;
        const mp = roundArs2(Number(mpRaw));
        const fp =
          patch.fecha_proyectada !== undefined
            ? String(patch.fecha_proyectada).slice(0, 10)
            : String(ex.fecha_proyectada).slice(0, 10);
        if (Number.isFinite(mp) && mp >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(fp)) {
          patch.monto_proyectado = mp;
          patch.fecha_proyectada = fp;
          patch.monto_real = mp;
          patch.fecha_real = fp;
          if (body.estado === undefined) {
            patch.estado = estadoDesdeTipo(tipo);
          }
        }
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ item: existing });
    }

    const { data, error } = await supabase
      .from("cashflow_items")
      .update(patch)
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ item: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("cashflow_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "Movimiento no encontrado o ya anulado." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, anulado: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
