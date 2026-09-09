import {describe,expect,it} from "vitest";
import {registroPagos,resumenPagosTexto} from "../registro-pagos";
import type {AcuerdoMO} from "../mano-obra";
const a:AcuerdoMO={id:"a",presupuesto_id:"p",persona:"Fran",trabajo:"Pintura",monto_arreglado:1000,moneda:"ARS",estado:"abierto",notas:null,created_at:"2026-09-01"};
const pago={id:"g",presupuesto_id:"p",importe:450.25,fecha:"2026-09-09",descripcion:"Anticipo",mo_acuerdo_id:"a",cuenta_id:null,cotizacion_venta_ars_por_usd:null};
describe("registro por operario",()=>{
  it("mantiene cada pago y marca el medio faltante sin inventarlo",()=>{const rows=registroPagos([a],[pago,pago],[{id:"p",nombre_obra:"Obra A",nombre_cliente:null}],[]);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({persona:"Fran",importe:450.25,cuenta:"Medio sin registrar"});expect(resumenPagosTexto(rows,"Fran","2026-09-07","2026-09-13")).toContain("450,25");});
  it("muestra la MO sin acuerdo como pago sin asignación, no la adjudica a un operario",()=>{const rows=registroPagos([a],[{...pago,mo_acuerdo_id:null,descripcion:"mano de obra"}],[],[]);expect(rows[0].persona).toBe("Sin operario asignado");});
});
