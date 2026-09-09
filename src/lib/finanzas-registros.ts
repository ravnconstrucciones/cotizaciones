import { roundArs2 } from "./format-currency";
export type GastoPersonalRegistro = {id:string;fecha:string;concepto:string;monto:number;categoria:string;fijo_id:string|null;extraordinario:boolean;cuenta_id:string|null;cuenta?:string|null};
export function resumirGastosPersonales(gastos:GastoPersonalRegistro[]) {
  const filas=[...new Map(gastos.map(g=>[g.id,g])).values()];
  const porCategoria=new Map<string,number>(); const porDia=new Map<string,number>();
  let total=0,fijos=0,extraordinarios=0;
  for(const g of filas){const cents=Math.round(Number(g.monto)*100);total+=cents;if(g.fijo_id)fijos+=cents;else if(g.extraordinario)extraordinarios+=cents;const cat=g.categoria.trim()||"Sin categoría";porCategoria.set(cat,(porCategoria.get(cat)??0)+cents);porDia.set(g.fecha,(porDia.get(g.fecha)??0)+cents);}
  let acumulado=0;
  return {total:total/100,fijos:fijos/100,extraordinarios:extraordinarios/100,variables:(total-fijos-extraordinarios)/100,cantidad:filas.length,
    categorias:[...porCategoria].map(([nombre,centavos])=>({nombre,total:centavos/100,pct:total>0?roundArs2(centavos/total*100):0})).sort((a,b)=>b.total-a.total),
    dias:[...porDia].sort(([a],[b])=>a.localeCompare(b)).map(([fecha,cents])=>{acumulado+=cents;return {fecha,total:cents/100,acumulado:acumulado/100};})};
}
/** Conserva fechas de Buenos Aires; semanas lunes-domingo, incluso al cambiar de año. */
export function semanaRegistro(hoy:string,desplazamiento=0) {
  const d=new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7)+desplazamiento*7);
  const desde=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return {desde,hasta:d.toISOString().slice(0,10)};
}
export function csvRegistros(headers:string[],rows:(string|number|null|undefined)[][]) {
  const cell=(v:string|number|null|undefined)=>{let text=String(v??"");if(typeof v!=="number"&&/^\s*[=+@\-\t\r\n]/.test(text))text="'"+text;return `"${text.replace(/"/g,'""')}"`;};
  return "\uFEFF"+[headers,...rows].map(r=>r.map(cell).join(";")).join("\r\n");
}
