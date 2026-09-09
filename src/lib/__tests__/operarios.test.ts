import {describe,expect,it} from "vitest";
import {operarioPorNombre} from "../operarios";
const fran={id:"f",nombre:"Francisco Pacheco (Fran)",aliases:["Fran","Pacheco Francisco"]};
describe("identidad de operarios",()=>{
  it("resuelve únicamente nombres y alias confirmados completos",()=>{
    expect(operarioPorNombre("  PACHECO   FRANCISCO ",[fran])?.id).toBe("f");
    expect(operarioPorNombre("Francisco Pérez",[fran])).toBeNull();
    expect(operarioPorNombre("Pago a Fran",[fran])).toBeNull();
  });
  it("no elige una identidad cuando el alias es ambiguo",()=>{
    expect(operarioPorNombre("Fran",[fran,{id:"otro",nombre:"Otro Francisco",aliases:["Fran"]}])).toBeNull();
  });
});
