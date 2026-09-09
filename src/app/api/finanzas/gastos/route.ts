import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { todayBuenosAires } from "@/lib/cashflow-compute";
import { resumirGastosPersonales, type GastoPersonalRegistro } from "@/lib/finanzas-registros";
export async function GET(req:Request){
  const url=new URL(req.url),hoy=todayBuenosAires();const desde=url.searchParams.get("desde")??`${hoy.slice(0,7)}-01`,hasta=url.searchParams.get("hasta")??hoy;
  const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(`${s}T12:00:00Z`))&&new Date(`${s}T12:00:00Z`).toISOString().slice(0,10)===s;
  if(!valid(desde)||!valid(hasta)||desde>hasta) return NextResponse.json({error:"Revisá el período: la fecha inicial no puede ser posterior a la final."},{status:400});
  try{
    const sb=createSupabaseAdminClient();const gastos:GastoPersonalRegistro[]=[];
    const cuentasPromise=sb.from("cuentas").select("id,nombre");
    for(let offset=0;;offset+=1000){const {data,error}=await sb.from("gastos_personales").select("id,fecha,concepto,monto,categoria,fijo_id,extraordinario,cuenta_id").gte("fecha",desde).lte("fecha",hasta).order("fecha",{ascending:false}).order("id").range(offset,offset+999);if(error)throw error;gastos.push(...(data??[]).map(g=>({...g,monto:Number(g.monto),categoria:g.categoria??"Sin categoría"})) as GastoPersonalRegistro[]);if(!data||data.length<1000)break;}
    const ctas=await cuentasPromise;if(ctas.error)throw ctas.error;const nombres=new Map((ctas.data??[]).map(c=>[c.id,c.nombre]));
    const filas=gastos.map(g=>({...g,cuenta:g.cuenta_id?nombres.get(g.cuenta_id)??"Cuenta no disponible":"Sin cuenta registrada"}));
    return NextResponse.json({desde,hasta,gastos:filas,resumen:resumirGastosPersonales(filas),actualizadoAt:new Date().toISOString()},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return NextResponse.json({error:"No se pudieron leer todos los gastos. Reintentá para obtener un total completo."},{status:500});}
}
