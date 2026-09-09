import {NextResponse} from "next/server";
import {createSupabaseAdminClient} from "@/lib/supabase/server";
import {readAll} from "@/lib/supabase/read-all";
import {calcularRubros,type GastoEconomico} from "@/lib/economia-obras";
export async function GET(){try{
  const sb=createSupabaseAdminClient();const [mediciones,pres,gastos,rubros,obras]=await Promise.all([
    readAll<{id:string;presupuesto_id:string;rubro_id:string;cantidad:number;unidad:string;fecha:string}>(sb,"obra_rubro_mediciones","id,presupuesto_id,rubro_id,cantidad,unidad,fecha"),
    readAll<{id:string;nombre_obra:string|null;nombre_cliente:string|null;libreta_caja_empresa:boolean}>(sb,"presupuestos","id,nombre_obra,nombre_cliente,libreta_caja_empresa"),
    readAll<GastoEconomico>(sb,"presupuestos_gastos","id,presupuesto_id,importe,rubro_id,fecha,mo_acuerdo_id,descripcion"),
    readAll<{id:string;nombre:string}>(sb,"rubros","id,nombre"),
    readAll<{id:string;presupuesto_id:string;finalizada_at:string|null}>(sb,"obras","id,presupuesto_id,finalizada_at"),
  ]);
  const filas=pres.filter(p=>!p.libreta_caja_empresa).flatMap(p=>{
    const ms=mediciones.filter(m=>m.presupuesto_id===p.id).map(m=>({rubroId:m.rubro_id,cantidad:Number(m.cantidad),unidad:m.unidad,fecha:m.fecha}));
    return calcularRubros(gastos.filter(g=>g.presupuesto_id===p.id),[],rubros,ms).rubros.filter(r=>r.medicion&&r.costoUnitario!=null).map(r=>({...r,presupuestoId:p.id,obra:p.nombre_obra||p.nombre_cliente||"Obra",finalizada:Boolean(obras.find(o=>o.presupuesto_id===p.id)?.finalizada_at)}));
  });return NextResponse.json({filas},{headers:{"Cache-Control":"private, no-store"}});
}catch{return NextResponse.json({error:"No se pudo leer la base de costos reales."},{status:500});}}
