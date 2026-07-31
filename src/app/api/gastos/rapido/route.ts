import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { sincronizarEspejo, type ResultadoSync } from "@/lib/dinero-sync";
import { estadoDesdeTipo } from "@/lib/cashflow-matching";
import { roundArs2 } from "@/lib/format-currency";

/**
 * CARGA RÁPIDA DE GASTOS — write-point único de la pantalla /gasto.
 *
 * NO inventa motor nuevo: replica los contratos existentes de cada tabla y usa
 * sincronizarEspejo (src/lib/dinero-sync.ts) como único motor del espejo del
 * ledger — mismo patrón que /api/finanzas y /api/pendientes-cuenta: operación
 * original primero, espejo best-effort que jamás bloquea el guardado. La
 * diferencia con el fire-and-forget de gastos-screen: acá el espejo se ESPERA
 * para poder devolver el estado real ("asentado" solo si hay patas — nunca
 * mentir).
 *
 * Body: { tipo: "obra" | "empresa" | "personal", ...campos }
 *   obra     → presupuestos_gastos (contrato calcado de guardarDraft() de
 *              gastos-screen: cashflow_items espejo primero si la obra tiene
 *              libreta, rollback si falla el gasto).
 *   empresa  → gastos_empresa (la app no tenía alta: este route ES la vía;
 *              moneda derivada de la cuenta elegida para no caer en la trampa
 *              cross-moneda = 0 patas).
 *   personal → gastos_personales (mismo contrato que POST /api/finanzas más
 *              cuenta_id directo, que finanzas no acepta).
 *
 * Campos transversales opcionales (revisión 31/07):
 *   moneda_cuenta_vista — moneda de cuenta que la UI le mostró al usuario;
 *                         si difiere de la real → 400 (candado anti-desync).
 *   reintento           — true cuando el cliente reintenta tras respuesta
 *                         perdida; habilita el dedupe de fila idéntica
 *                         reciente (ventana 2 min) para no restar dos veces.
 *
 * Respuesta: { ok, id, espejo: { ok, accion, patas } | { ok: false } }
 *            (+ duplicado: true si se devolvió una fila ya existente).
 * Service_role (bypass RLS), detrás del middleware de sesión.
 */

type Espejo = ({ ok: true } & ResultadoSync) | { ok: false };

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Hoy en zona BA (no UTC): un gasto cargado de noche cae en el día correcto. */
function hoyBAIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function malo(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) return malo("Body inválido");

    const tipo = body.tipo;
    if (tipo !== "obra" && tipo !== "empresa" && tipo !== "personal") {
      return malo("tipo debe ser obra, empresa o personal");
    }

    const fecha = str(body.fecha) || hoyBAIso();
    if (!FECHA_RE.test(fecha)) return malo("fecha inválida (YYYY-MM-DD)");

    const cuentaId = str(body.cuenta_id) || null;

    const sb = createSupabaseAdminClient();

    // Cuenta (opcional): debe existir y estar activa — mismo check que
    // pendientes-cuenta. Sin cuenta el guardado vale igual (queda PENDIENTE
    // en la bandeja de /archivados) y el espejo es no-op.
    let cuenta: { id: string; moneda: "ARS" | "USD" } | null = null;
    if (cuentaId) {
      const res = await sb
        .from("cuentas")
        .select("id, moneda")
        .eq("id", cuentaId)
        .eq("activa", true)
        .maybeSingle();
      if (res.error) return malo(res.error.message, 500);
      if (!res.data) return malo("Cuenta inválida o inactiva");
      cuenta = res.data as { id: string; moneda: "ARS" | "USD" };
    }

    // Candado de moneda (revisión 31/07): el cliente declara qué moneda de
    // cuenta VIO al armar el monto (moneda_cuenta_vista). Si el fetch de
    // /api/cuentas falló en el cliente y la UI asumió pesos sobre una cuenta
    // USD, el monto viene en la moneda equivocada (~1000x) — acá se corta con
    // 400 en vez de asentar un ledger corrido. Campo opcional: clientes
    // viejos sin el campo siguen pasando.
    const monedaVista = str(body.moneda_cuenta_vista);
    if (
      cuenta &&
      (monedaVista === "ARS" || monedaVista === "USD") &&
      monedaVista !== cuenta.moneda
    ) {
      return malo(
        "La pantalla mostró la cuenta en otra moneda que la real — recargá y volvé a cargar el gasto"
      );
    }

    // Idempotencia sin migración (revisión 31/07): si el cliente marca que
    // esto es un REINTENTO (la respuesta anterior se perdió: red móvil de
    // obra, Safari suspendido), buscar una fila idéntica recién creada y
    // devolver ESA en vez de insertar otra — el gasto no se resta dos veces
    // del ledger. Solo con reintento=true: dos cargas legítimas idénticas
    // seguidas (form nuevo) nunca se dedupean.
    const esReintento = body.reintento === true;
    const buscarReciente = async (
      tabla: "presupuestos_gastos" | "gastos_empresa" | "gastos_personales",
      filtros: Record<string, string | number | null>
    ): Promise<string | null> => {
      if (!esReintento) return null;
      const desde = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      let q = sb.from(tabla).select("id").gte("created_at", desde);
      for (const [col, val] of Object.entries(filtros)) {
        q = val === null ? q.is(col, null) : q.eq(col, val);
      }
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        // El dedupe jamás frena el guardado: sin lectura, camino normal.
        console.error("[gastos/rapido dedupe]", error.message);
        return null;
      }
      return data ? String((data as { id: unknown }).id) : null;
    };

    const espejar = async (
      tabla: "presupuestos_gastos" | "cashflow_items" | "gastos_empresa" | "gastos_personales",
      id: string
    ): Promise<Espejo> => {
      try {
        return { ok: true, ...(await sincronizarEspejo(sb, tabla, id)) };
      } catch (e) {
        console.error("[gastos/rapido espejo]", e);
        return { ok: false };
      }
    };

    // ── OBRA → presupuestos_gastos ────────────────────────────────────────
    if (tipo === "obra") {
      const presupuestoId = str(body.presupuesto_id);
      if (!presupuestoId) return malo("presupuesto_id requerido");

      const importe = roundArs2(num(body.importe));
      if (!(importe > 0)) return malo("El importe debe ser mayor a cero");

      const cot = roundArs2(num(body.cotizacion_venta_ars_por_usd));
      // Trampa 0-patas: gasto desde cuenta USD sin cotización quedaría con
      // cuenta y SIN espejo (huérfano real en dinero_huerfanos). Se corta acá.
      if (cuenta?.moneda === "USD" && !(cot > 0)) {
        return malo(
          "La cuenta elegida es en dólares: falta cotización venta (ARS por US$ 1)"
        );
      }

      // Presupuesto aprobado + su obra (si existe, el gasto espeja en Caja).
      const [presRes, obraRes] = await Promise.all([
        sb
          .from("presupuestos")
          .select("id, presupuesto_aprobado")
          .eq("id", presupuestoId)
          .maybeSingle(),
        sb
          .from("obras")
          .select("id")
          .eq("presupuesto_id", presupuestoId)
          .maybeSingle(),
      ]);
      if (presRes.error) return malo(presRes.error.message, 500);
      if (!presRes.data) return malo("El presupuesto no existe", 404);
      if (!(presRes.data as { presupuesto_aprobado?: boolean }).presupuesto_aprobado) {
        return malo("El presupuesto no está aprobado");
      }
      if (obraRes.error) return malo(obraRes.error.message, 500);
      const obraId = obraRes.data
        ? String((obraRes.data as { id: unknown }).id)
        : null;

      const descripcion = str(body.descripcion);

      // 0) Reintento tras respuesta perdida: ¿ya existe este mismo gasto?
      //    (la fila encontrada ya tiene su espejo de Caja del primer POST).
      const dupObra = await buscarReciente("presupuestos_gastos", {
        presupuesto_id: presupuestoId,
        fecha,
        importe,
        descripcion,
        rubro_id: str(body.rubro_id) || null,
        cuenta_id: cuentaId,
      });
      if (dupObra) {
        const espejo = await espejar("presupuestos_gastos", dupObra);
        return NextResponse.json({ ok: true, id: dupObra, espejo, duplicado: true });
      }

      // 1) Espejo en la libreta de Caja PRIMERO (contrato de guardarDraft):
      //    la cuenta vive en el GASTO, nunca en su espejo (no restar 2 veces).
      let cashflowItemId: string | null = null;
      if (obraId) {
        const { data: cfIns, error: errCf } = await sb
          .from("cashflow_items")
          .insert({
            obra_id: obraId,
            tipo: "egreso",
            categoria: "otro",
            descripcion: descripcion || "Gasto de obra",
            monto_proyectado: importe,
            fecha_proyectada: fecha,
            monto_real: importe,
            fecha_real: fecha,
            estado: estadoDesdeTipo("egreso"),
            notas: "RAVN_GASTO_OBRA",
          })
          .select("id")
          .single();
        if (errCf) return malo(errCf.message, 500);
        cashflowItemId = String((cfIns as { id: unknown }).id);
      }

      // 2) El gasto en sí (importe SIEMPRE en ARS).
      const insertPayload: Record<string, unknown> = {
        presupuesto_id: presupuestoId,
        fecha,
        rubro_id: str(body.rubro_id) || null,
        descripcion,
        importe,
        cuenta_id: cuentaId,
      };
      if (cot > 0) {
        insertPayload.cotizacion_venta_ars_por_usd = cot;
        const casa = str(body.casa_dolar);
        if (casa) insertPayload.casa_dolar = casa;
      }
      if (cashflowItemId) insertPayload.cashflow_item_id = cashflowItemId;

      const { data: gastoIns, error: errG } = await sb
        .from("presupuestos_gastos")
        .insert(insertPayload)
        .select("id")
        .single();
      if (errG) {
        // Rollback manual del espejo de Caja (contrato de guardarDraft).
        if (cashflowItemId) {
          await sb.from("cashflow_items").delete().eq("id", cashflowItemId);
        }
        return malo(errG.message, 500);
      }
      const gastoId = String((gastoIns as { id: unknown }).id);

      // 3) Espejo del ledger: se espera para el feedback honesto. El del
      //    cashflow espejo devuelve 0 patas por diseño (esEspejoDeGasto).
      const espejo = await espejar("presupuestos_gastos", gastoId);
      if (cashflowItemId) await espejar("cashflow_items", cashflowItemId);

      return NextResponse.json({ ok: true, id: gastoId, espejo });
    }

    // ── EMPRESA → gastos_empresa ──────────────────────────────────────────
    if (tipo === "empresa") {
      const concepto = str(body.concepto);
      if (!concepto) return malo("concepto requerido");
      const monto = roundArs2(num(body.monto));
      if (!(monto > 0)) return malo("El monto debe ser mayor a cero");

      // Moneda DERIVADA de la cuenta: un gasto con moneda distinta a la de su
      // cuenta suma 0 en el motor (trampa cross-moneda) — se previene acá.
      const moneda = cuenta?.moneda === "USD" ? "USD" : "ARS";

      const dupEmp = await buscarReciente("gastos_empresa", {
        concepto,
        monto,
        moneda,
        fecha,
        cuenta_id: cuentaId,
      });
      if (dupEmp) {
        const espejo = await espejar("gastos_empresa", dupEmp);
        return NextResponse.json({ ok: true, id: dupEmp, espejo, duplicado: true });
      }

      const { data, error } = await sb
        .from("gastos_empresa")
        .insert({
          concepto,
          monto,
          moneda,
          categoria: str(body.categoria) || null,
          fecha,
          origen: "app",
          cuenta_id: cuentaId,
        })
        .select("id")
        .single();
      if (error) return malo(error.message, 500);
      const id = String((data as { id: unknown }).id);

      const espejo = await espejar("gastos_empresa", id);
      return NextResponse.json({ ok: true, id, espejo });
    }

    // ── PERSONAL → gastos_personales ──────────────────────────────────────
    const concepto = str(body.concepto);
    if (!concepto) return malo("concepto requerido");
    const monto = roundArs2(num(body.monto));
    if (!(monto > 0)) return malo("El monto debe ser mayor a cero");
    // Gasto personal siempre ARS: desde una cuenta USD el motor sumaría 0.
    if (cuenta?.moneda === "USD") {
      return malo("Un gasto personal sale de una cuenta en pesos");
    }

    const dupPer = await buscarReciente("gastos_personales", {
      concepto,
      monto,
      fecha,
      cuenta_id: cuentaId,
    });
    if (dupPer) {
      const espejo = await espejar("gastos_personales", dupPer);
      return NextResponse.json({ ok: true, id: dupPer, espejo, duplicado: true });
    }

    const { data, error } = await sb
      .from("gastos_personales")
      .insert({
        concepto,
        monto,
        categoria: str(body.categoria) || "Varios",
        fecha,
        origen: "app",
        cuenta_id: cuentaId,
      })
      .select("id")
      .single();
    if (error) return malo(error.message, 500);
    const id = String((data as { id: unknown }).id);

    const espejo = await espejar("gastos_personales", id);
    return NextResponse.json({ ok: true, id, espejo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
