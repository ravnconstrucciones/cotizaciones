import { roundArs2 } from './format-currency';
import { categoriaPersonal } from './finanzas-registros';
export type MovimientoTarjeta={id:string;fecha:string;cuenta_id:string;monto:number;moneda:string;origen_tipo:string;origen_id:string;estado:string;descripcion:string;dueno_obra_id:string|null};
export type DetalleTarjeta={categoria:string;concepto:string;obra?:string};
export type RegistroTarjeta=MovimientoTarjeta&{ambito:string;clase:'consumo'|'reintegro'|'pago'|'ajuste';importe:number;categoria:string;obra:string};
const gastos=new Set(['gasto_personal','gasto_empresa','gasto_obra']);
export function prepararRegistrosTarjeta(rows:MovimientoTarjeta[],detalles:Record<string,DetalleTarjeta>):RegistroTarjeta[]{
 return [...new Map(rows.map(r=>[r.id,r])).values()].filter(r=>r.estado==='asentado').map(r=>{
  const d=detalles[`${r.origen_tipo}:${r.origen_id}`];
  const esGasto=gastos.has(r.origen_tipo);
  const clase=esGasto?(Number(r.monto)<=0?'consumo':'reintegro'):r.origen_tipo==='transferencia'&&Number(r.monto)>0?'pago':'ajuste';
  return {...r,monto:Number(r.monto),descripcion:d?.concepto||r.descripcion,ambito:r.origen_tipo==='gasto_personal'?'Personal':r.origen_tipo==='gasto_empresa'?'Empresa':r.origen_tipo==='gasto_obra'?'Obra':'Cuenta',clase,importe:esGasto?-Number(r.monto):Number(r.monto),categoria:categoriaPersonal(d?.categoria||(r.origen_tipo==='gasto_obra'?'Gastos de obra':r.origen_tipo==='gasto_empresa'?'Empresa':clase==='pago'?'Pago de tarjeta':'Otros movimientos')),obra:d?.obra||''};
 });
}
export function resumirTarjeta(rows:RegistroTarjeta[],desde:string,hasta:string,moneda:string){
 const periodo=rows.filter(r=>r.fecha>=desde&&r.fecha<=hasta&&r.moneda===moneda);
 const consumos=periodo.filter(r=>r.clase==='consumo'||r.clase==='reintegro');
 const cents=(n:number)=>Math.round(n*100);
 const total=(items:RegistroTarjeta[],field:'importe'|'monto'='importe')=>items.reduce((n,r)=>n+cents(r[field]),0)/100;
 const cats=new Map<string,number>(),dias=new Map<string,number>();
 for(const r of consumos){cats.set(r.categoria,(cats.get(r.categoria)||0)+cents(r.importe));dias.set(r.fecha,(dias.get(r.fecha)||0)+cents(r.importe));}
 return {consumos:total(consumos.filter(r=>r.clase==='consumo')),reintegros:-total(consumos.filter(r=>r.clase==='reintegro')),neto:total(consumos),pagos:total(periodo.filter(r=>r.clase==='pago')),cantidad:consumos.filter(r=>r.clase==='consumo').length,porAmbito:['Personal','Empresa','Obra'].map(nombre=>({nombre,total:total(consumos.filter(r=>r.ambito===nombre))})),categorias:[...cats].map(([nombre,importe])=>({nombre,total:importe/100})).sort((a,b)=>b.total-a.total),dias:[...dias].sort(([a],[b])=>a.localeCompare(b)).map(([fecha,importe])=>({fecha,total:importe/100}))};
}
export function saldoTarjeta(rows:MovimientoTarjeta[],cuentaId:string,hoy:string){return roundArs2([...new Map(rows.map(r=>[r.id,r])).values()].filter(r=>r.estado==='asentado'&&r.cuenta_id===cuentaId&&r.fecha<=hoy).reduce((n,r)=>n+Math.round(Number(r.monto)*100),0)/100);}
export function periodoMesAnterior(desde:string,hasta:string){
 const move=(fecha:string)=>{const [y,m,d]=fecha.split('-').map(Number);const end=new Date(Date.UTC(y,m-1,0));return new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth(),Math.min(d,end.getUTCDate()))).toISOString().slice(0,10);};
 return {desde:move(desde),hasta:move(hasta)};
}
