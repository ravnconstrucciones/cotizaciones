import { describe, expect, it } from "vitest";
import { interpretarMovimiento, type InventarioItem, type InventarioUbicacion } from "./inventario";

const ubicaciones: InventarioUbicacion[] = [
  { id: "d", clave: "deposito", nombre: "Depósito", tipo: "deposito", obra_id: null },
  { id: "p", clave: "obra-p", nombre: "Pueyrredón", tipo: "obra", obra_id: "o" },
];
const items: InventarioItem[] = [{ id: "a", nombre: "Amoladora", tipo: "herramienta", rubro: "herramientas-mantenimiento", cantidad: 1, unidad: "unidad", cantidad_texto: null, ubicacion_id: "d", estado_revision: "confirmado", nota_revision: null }];

describe("interpretarMovimiento", () => {
  it("arma un borrador sin persistir para un dictado natural", () => {
    const r = interpretarMovimiento("Mandé la amoladora del depósito a Pueyrredón", items, ubicaciones);
    expect(r.borrador).toMatchObject({ item_id: "a", origen_id: "d", destino_id: "p" });
  });
  it("explica qué falta si no reconoce el destino", () => {
    expect(interpretarMovimiento("moví la amoladora", items, ubicaciones).faltantes).toContain("destino");
  });
});
