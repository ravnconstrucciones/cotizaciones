import { describe, expect, it } from "vitest";
import {
  estadoInicialUltimosGastos,
  normalizarGastosRecientes,
  reducirUltimosGastos,
  type FuenteGastoRapido,
  type GastoRapidoReciente,
} from "@/lib/gastos-rapidos";

const gasto = (
  id: string,
  createdAt: string,
  tipo: GastoRapidoReciente["tipo"] = "empresa"
): FuenteGastoRapido => ({
  id,
  tipo,
  concepto: `Concepto ${id}`,
  importe: id.length * 100,
  moneda: "ARS",
  fecha: "2026-08-06",
  createdAt,
  cuenta: "Caja",
  detalle: tipo === "obra" ? "Obra Norte" : null,
});

describe("normalizarGastosRecientes", () => {
  it("mezcla los tres tipos, ordena por createdAt e id descendentes y limita a diez", () => {
    const fuentes: FuenteGastoRapido[] = [
      gasto("a", "2026-08-06T10:00:00.000Z", "obra"),
      gasto("c", "2026-08-06T11:00:00.000Z", "personal"),
      gasto("b", "2026-08-06T11:00:00.000Z", "empresa"),
      ...Array.from({ length: 9 }, (_, i) =>
        gasto(`viejo-${i}`, `2026-08-05T0${i}:00:00.000Z`)
      ),
    ];

    const result = normalizarGastosRecientes(fuentes);

    expect(result).toHaveLength(10);
    expect(result.slice(0, 3).map((item) => item.id)).toEqual(["c", "b", "a"]);
    expect(result.map((item) => item.tipo)).toEqual(
      expect.arrayContaining(["obra", "empresa", "personal"])
    );
    expect(result.some((item) => item.id === "viejo-0")).toBe(false);
  });

  it("descarta fuentes inválidas en vez de mostrar ingresos o filas incompletas", () => {
    const fuentes = [
      gasto("valido", "2026-08-06T12:00:00.000Z", "obra"),
      { ...gasto("ingreso", "2026-08-06T13:00:00.000Z"), tipo: "ingreso" },
      { ...gasto("sin-fecha", ""), createdAt: "" },
      { ...gasto("monto-roto", "2026-08-06T14:00:00.000Z"), importe: Number.NaN },
    ] as FuenteGastoRapido[];

    expect(normalizarGastosRecientes(fuentes).map((item) => item.id)).toEqual([
      "valido",
    ]);
  });
});

describe("reducirUltimosGastos", () => {
  const item = normalizarGastosRecientes([
    gasto("g-1", "2026-08-06T12:00:00.000Z", "obra"),
    gasto("g-2", "2026-08-06T11:00:00.000Z", "empresa"),
  ]);

  it("representa loading, error y reintento sin inventar filas", () => {
    const fallo = reducirUltimosGastos(estadoInicialUltimosGastos, {
      tipo: "carga_error",
      mensaje: "Sin conexión",
    });
    expect(fallo).toMatchObject({ cargando: false, error: "Sin conexión", items: [] });

    const reintento = reducirUltimosGastos(fallo, { tipo: "carga_inicio" });
    expect(reintento).toMatchObject({ cargando: true, error: null, items: [] });
  });

  it("mantiene una sola fila expandida y permite cerrarla", () => {
    const listo = reducirUltimosGastos(estadoInicialUltimosGastos, {
      tipo: "carga_ok",
      items: item,
    });
    const primera = reducirUltimosGastos(listo, { tipo: "alternar", id: "g-1" });
    const segunda = reducirUltimosGastos(primera, { tipo: "alternar", id: "g-2" });
    const cerrada = reducirUltimosGastos(segunda, { tipo: "alternar", id: "g-2" });

    expect(primera.expandidoId).toBe("g-1");
    expect(segunda.expandidoId).toBe("g-2");
    expect(cerrada.expandidoId).toBeNull();
  });

  it("abre, cancela y confirma sin quitar la fila antes del éxito", () => {
    const listo = reducirUltimosGastos(estadoInicialUltimosGastos, {
      tipo: "carga_ok",
      items: item,
    });
    const confirma = reducirUltimosGastos(listo, { tipo: "confirmar_abrir", id: "g-1" });
    const enviando = reducirUltimosGastos(confirma, { tipo: "deshacer_inicio" });
    const error = reducirUltimosGastos(enviando, {
      tipo: "deshacer_error",
      mensaje: "No se pudo deshacer",
    });
    const cancelado = reducirUltimosGastos(error, { tipo: "confirmar_cerrar" });

    expect(confirma.confirmandoId).toBe("g-1");
    expect(enviando.deshaciendo).toBe(true);
    expect(enviando.items).toHaveLength(2);
    expect(error).toMatchObject({ deshaciendo: false, errorDeshacer: "No se pudo deshacer" });
    expect(cancelado).toMatchObject({ confirmandoId: null, errorDeshacer: null });
  });

  it("quita sólo la fila confirmada y anuncia éxito o conflicto 409", () => {
    const listo = reducirUltimosGastos(estadoInicialUltimosGastos, {
      tipo: "carga_ok",
      items: item,
    });
    const confirma = reducirUltimosGastos(listo, { tipo: "confirmar_abrir", id: "g-1" });
    const exito = reducirUltimosGastos(confirma, { tipo: "deshacer_ok", id: "g-1" });
    const conflicto = reducirUltimosGastos(
      reducirUltimosGastos(listo, { tipo: "confirmar_abrir", id: "g-2" }),
      { tipo: "deshacer_ya_hecho", id: "g-2" }
    );

    expect(exito.items.map((g) => g.id)).toEqual(["g-2"]);
    expect(exito.anuncio).toBe("Gasto deshecho. Quedó en Papelera.");
    expect(conflicto.items.map((g) => g.id)).toEqual(["g-1"]);
    expect(conflicto.anuncio).toBe("Ese gasto ya había sido deshecho.");
  });
});
