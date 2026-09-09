import type { AcuerdoMO, PagoMO } from "./mano-obra";
import { esGastoManoObra, type GastoEconomico } from "./economia-obras";
export type PagoPersonal = {id:string;presupuestoId:string;obra:string;persona:string;trabajo:string;fecha:string;importe:number;cuenta:string;descripcion:string;acuerdoId:string|null};
export function registroPagos(acuerdos:AcuerdoMO[],gastos:(GastoEconomico & PagoMO)[],obras:{id:string;nombre_obra:string|null;nombre_cliente:string|null}[],cuentas:{id:string;nombre:string}[]):PagoPersonal[]{
  const acs=new Map(acuerdos.map(a=>[a.id,a]));const nombres=new Map(obras.map(o=>[o.id,o.nombre_obra||o.nombre_cliente||"Obra"]));const ctas=new Map(cuentas.map(c=>[c.id,c.nombre]));
  return [...new Map(gastos.filter(esGastoManoObra).map(g=>[g.id,g])).values()].map(g=>{
    const a=g.mo_acuerdo_id?acs.get(g.mo_acuerdo_id):undefined;
    return {id:g.id,presupuestoId:g.presupuesto_id,obra:nombres.get(g.presupuesto_id)??"Obra",persona:a?.persona?.trim()||"Sin operario asignado",trabajo:a?.trabajo||"Mano de obra sin acuerdo",fecha:g.fecha,importe:Number(g.importe),cuenta:g.cuenta_id?ctas.get(g.cuenta_id)||"Cuenta no disponible":"Medio sin registrar",descripcion:g.descripcion||"",acuerdoId:g.mo_acuerdo_id??null};
  }).sort((a,b)=>b.fecha.localeCompare(a.fecha)||a.id.localeCompare(b.id));
}
export function resumenPagosTexto(pagos:PagoPersonal[],persona:string,desde:string,hasta:string){
  const total=pagos.reduce((n,p)=>n+Math.round(p.importe*100),0)/100;
  const pesos=(n:number)=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",minimumFractionDigits:2}).format(n);
  return [`RAVN · Resumen de pagos`,persona,`${desde||"Inicio del historial"} al ${hasta||"hoy"}`,"",...([...pagos].reverse().map(p=>`${p.fecha} · ${p.obra}\n${p.descripcion||p.trabajo}\n${pesos(p.importe)} · ${p.cuenta}\n`)),`TOTAL PAGADO: ${pesos(total)}`,`${pagos.length} pagos registrados.`,"Este resumen informa pagos registrados; no reemplaza recibos ni acredita pagos no asentados."].join("\n");
}
