import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { readAll } from '@/lib/supabase/read-all';
import { esTarjeta } from '@/lib/dinero-tablero';
import { todayBuenosAires } from '@/lib/cashflow-compute';
import { prepararRegistrosTarjeta,saldoTarjeta,type MovimientoTarjeta,type DetalleTarjeta } from '@/lib/tarjetas-informe';

type Cuenta={id:string;nombre:string;moneda:string};
type Personal={id:string;categoria:string;concepto:string};
type Empresa={id:string;categoria:string;concepto:string};
type Gasto={id:string;descripcion:string;presupuesto_id:string};
type Arqueo={id:string;cuenta_id:string;fecha:string;saldo_declarado:number};
export async function GET(){try{
 const sb=createSupabaseAdminClient();const hoy=todayBuenosAires();
 const {data:cuentas,error}=await sb.from('cuentas').select('id,nombre,moneda').eq('activa',true).order('orden');if(error)throw error;
 const tarjetas=(cuentas??[] as Cuenta[]).filter(c=>esTarjeta(c.nombre));const ids=tarjetas.map(c=>c.id);
 if(!ids.length)return NextResponse.json({hoy,cuentas:[],registros:[],informes:[],actualizadoEn:new Date().toISOString()});
 const filtro={column:'cuenta_id',value:ids};
 const [movimientos,personales,empresa,obra,arqueos,presupuestos,informes]=await Promise.all([
  readAll<MovimientoTarjeta>(sb,'movimientos_plata','id,fecha,cuenta_id,monto,moneda,origen_tipo,origen_id,estado,descripcion,dueno_obra_id',filtro),
  readAll<Personal>(sb,'gastos_personales','id,categoria,concepto',filtro),
  readAll<Empresa>(sb,'gastos_empresa','id,categoria,concepto',filtro),
  readAll<Gasto>(sb,'presupuestos_gastos','id,descripcion,presupuesto_id',filtro),
  readAll<Arqueo>(sb,'cuenta_ajustes','id,cuenta_id,fecha,saldo_declarado',filtro),
  readAll<{id:string;nombre_obra:string}>(sb,'presupuestos','id,nombre_obra'),
  sb.from('eventos').select('id,creado_at,titulo,contenido').in('tipo',['informe_financiero','revision_financiera_integral']).eq('estado','procesado').order('creado_at',{ascending:false}).limit(8)
 ]);
 if(informes.error)throw informes.error;
 const nombres=new Map(presupuestos.map(p=>[p.id,p.nombre_obra]));const detalles:Record<string,DetalleTarjeta>={};
 for(const p of personales)detalles[`gasto_personal:${p.id}`]={categoria:p.categoria,concepto:p.concepto};
 for(const p of empresa)detalles[`gasto_empresa:${p.id}`]={categoria:p.categoria,concepto:p.concepto};
 for(const p of obra)detalles[`gasto_obra:${p.id}`]={categoria:'Gastos de obra',concepto:p.descripcion,obra:nombres.get(p.presupuesto_id)||'Obra'};
 const registros=prepararRegistrosTarjeta(movimientos,detalles);
 const revisiones=(informes.data??[]).map(i=>{
  const c=i.contenido??{};
  if(!c.informe)return i;
  return {...i,contenido:{resumen:[c.informe.resumen,...(c.informe.indicadores??[]).map((v:{nombre:string;valor:string;detalle:string})=>`${v.nombre}: ${v.valor}. ${v.detalle}`)].filter(Boolean),fuentes:[{nombre:'Revisión histórica',estado:c.informe.fecha??i.creado_at.slice(0,10),detalle:'Estado conservado de esa fecha. Las resoluciones posteriores se muestran en las revisiones más recientes.'}],pendientes:(c.informe.pendientes??[]).map((p:{titulo:string;detalle:string})=>`${p.titulo}. ${p.detalle}`)}};
 });
 const result=NextResponse.json({hoy,actualizadoEn:new Date().toISOString(),cuentas:tarjetas.map(c=>({...c,saldo:saldoTarjeta(movimientos,c.id,hoy),ultimoMovimiento:registros.filter(r=>r.cuenta_id===c.id&&r.fecha<=hoy).sort((a,b)=>b.fecha.localeCompare(a.fecha))[0]?.fecha??null,ultimoArqueo:arqueos.filter(a=>a.cuenta_id===c.id&&a.fecha<=hoy).sort((a,b)=>b.fecha.localeCompare(a.fecha))[0]??null})),registros,informes:revisiones});
 result.headers.set('Cache-Control','private, max-age=15, stale-while-revalidate=30');return result;
}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'No se pudo leer el informe de tarjetas'},{status:500});}}
