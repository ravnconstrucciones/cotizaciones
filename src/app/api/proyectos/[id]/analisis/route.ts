import { NextResponse } from "next/server";
import { cargarEconomiaObras } from "@/lib/economia-obras-server";
import { calcularRubros, type PlanEconomico, type MedicionRubro } from "@/lib/economia-obras";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { readAll } from "@/lib/supabase/read-all";
import { todayBuenosAires } from "@/lib/cashflow-compute";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(_: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({error:"Obra inválida."},{status:400});
  try {
    const sb=createSupabaseAdminClient();
    const [base,plan,rubros,mediciones] = await Promise.all([
      cargarEconomiaObras(id),
      readAll<PlanEconomico>(sb,"obra_plan_items","id,nombre,tipo,unidad,cantidad,incluido,precio_unitario",{column:"presupuesto_id",value:id}),
      readAll<{id:string;nombre:string}>(sb,"rubros","id,nombre"),
      readAll<{id:string;rubro_id:string;cantidad:number;unidad:string;fecha:string}>(sb,"obra_rubro_mediciones","id,rubro_id,cantidad,unidad,fecha",{column:"presupuesto_id",value:id}),
    ]);
    if(!base.proyectos[0]) return NextResponse.json({error:"Obra no encontrada."},{status:404});
    const m:MedicionRubro[]=mediciones.map(r=>({rubroId:r.rubro_id,cantidad:Number(r.cantidad),unidad:r.unidad,fecha:r.fecha}));
    return NextResponse.json({obra:base.proyectos[0],...calcularRubros(base.gastos,plan,rubros,m),gastos:base.gastos.sort((a,b)=>b.fecha.localeCompare(a.fecha))},{headers:{"Cache-Control":"private, no-store"}});
  } catch(e) {return NextResponse.json({error:e instanceof Error?e.message:"No se pudo leer el detalle."},{status:500});}
}
export async function PUT(req:Request,ctx:Ctx) {
  const {id}=await ctx.params;
  const body=await req.json().catch(()=>null);
  if(!UUID.test(id)||!body||!/^\d+$/.test(String(body.rubroId))||typeof body.cantidad!=="number"||!Number.isFinite(body.cantidad)||body.cantidad<=0||body.cantidad>9999999999||!["m2","m","u","jornal","global"].includes(body.unidad)) return NextResponse.json({error:"Indicá rubro, cantidad positiva y unidad."},{status:400});
  try {
    const sb=createSupabaseAdminClient();
    const {data:rubro,error:re}=await sb.from("rubros").select("id").eq("id",body.rubroId).maybeSingle();
    if(re) throw re;
    if(!rubro) return NextResponse.json({error:"El rubro no existe."},{status:400});
    const {data,error}=await sb.from("obra_rubro_mediciones").upsert({presupuesto_id:id,rubro_id:String(body.rubroId),cantidad:body.cantidad,unidad:body.unidad,fecha:todayBuenosAires(),updated_at:new Date().toISOString()},{onConflict:"presupuesto_id,rubro_id"}).select("id,rubro_id,cantidad,unidad,fecha").single();
    if(error) throw error;
    return NextResponse.json({ok:true,medicion:data});
  } catch {return NextResponse.json({error:"No se pudo guardar la medición. Intentá nuevamente."},{status:500});}
}
