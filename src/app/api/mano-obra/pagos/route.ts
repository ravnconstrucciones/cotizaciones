import {NextResponse} from "next/server";
import {createSupabaseAdminClient} from "@/lib/supabase/server";
import {readAll} from "@/lib/supabase/read-all";
import {registroPagos} from "@/lib/registro-pagos";
import {resumirAcuerdos,type AcuerdoMO,type PagoMO} from "@/lib/mano-obra";
import type {GastoEconomico} from "@/lib/economia-obras";
export async function GET(){try{
  const sb=createSupabaseAdminClient();const [acuerdos,gastos,obras,cuentas]=await Promise.all([
    readAll<AcuerdoMO>(sb,"mo_acuerdos","id,presupuesto_id,persona,trabajo,monto_arreglado,moneda,estado,notas,created_at"),
    readAll<GastoEconomico & PagoMO>(sb,"presupuestos_gastos","id,presupuesto_id,mo_acuerdo_id,importe,fecha,descripcion,cotizacion_venta_ars_por_usd,cuenta_id"),
    readAll<{id:string;nombre_obra:string|null;nombre_cliente:string|null}>(sb,"presupuestos","id,nombre_obra,nombre_cliente"),
    readAll<{id:string;nombre:string}>(sb,"cuentas","id,nombre"),
  ]);
  return NextResponse.json({pagos:registroPagos(acuerdos,gastos,obras,cuentas),acuerdos:resumirAcuerdos(acuerdos,gastos).map(r=>({id:r.acuerdo.id,presupuestoId:r.acuerdo.presupuesto_id,persona:r.acuerdo.persona?.trim()||"Sin operario asignado",trabajo:r.acuerdo.trabajo,moneda:r.acuerdo.moneda,arreglado:Number(r.acuerdo.monto_arreglado),pagado:r.pagado,saldo:r.saldo,estado:r.acuerdo.estado,pagosSinCotizacion:r.pagosSinCotizacion})),actualizadoAt:new Date().toISOString()},{headers:{"Cache-Control":"private, no-store"}});
}catch{return NextResponse.json({error:"No se pudieron leer todos los pagos. Reintentá para ver el registro completo."},{status:500});}}
