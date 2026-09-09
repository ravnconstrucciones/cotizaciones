import { describe, expect, it } from "vitest";
import {resumirGastosPersonales,semanaRegistro,csvRegistros,type GastoPersonalRegistro} from "../finanzas-registros";
const g:GastoPersonalRegistro={id:"1",fecha:"2026-09-09",concepto:"Compra",monto:100.25,categoria:"Comida",fijo_id:null,extraordinario:false,cuenta_id:null};
describe("registros financieros",()=>{
  it("suma fijos pagados y extraordinarios una vez, sin incluir presupuestos",()=>{const r=resumirGastosPersonales([g,g,{...g,id:"2",monto:50.1,fijo_id:"f"},{...g,id:"3",monto:25.9,extraordinario:true}]);expect(r.total).toBe(176.25);expect(r.cantidad).toBe(3);expect(r.fijos).toBe(50.1);expect(r.variables).toBe(100.25);expect(r.dias[0].acumulado).toBe(176.25);});
  it("calcula semana y semana anterior atravesando fin de año",()=>{expect(semanaRegistro("2026-01-01")).toEqual({desde:"2025-12-29",hasta:"2026-01-04"});expect(semanaRegistro("2026-01-01",-1)).toEqual({desde:"2025-12-22",hasta:"2025-12-28"});});
  it("escapa celdas y evita fórmulas en CSV",()=>{const csv=csvRegistros(["Detalle","Pesos"],[["=SUM(A1)",10.25],["texto; con \"comillas\"",-5]]);expect(csv).toContain('"\'=SUM(A1)"');expect(csv).toContain('"texto; con ""comillas"""');expect(csv).toContain('"-5"');});
});
