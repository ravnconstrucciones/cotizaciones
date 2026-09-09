import {NextResponse} from "next/server";
import {createSupabaseAdminClient} from "@/lib/supabase/server";
import {readAll} from "@/lib/supabase/read-all";
import type {Operario} from "@/lib/operarios";
export async function GET(){
  try{
    const operarios=await readAll<Operario>(createSupabaseAdminClient(),"mo_operarios","id,nombre,aliases");
    return NextResponse.json({operarios},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return NextResponse.json({error:"No se pudieron leer los operarios"},{status:500});}
}
