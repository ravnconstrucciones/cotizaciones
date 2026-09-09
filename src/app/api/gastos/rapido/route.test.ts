import {beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
const state=vi.hoisted(()=>({writes:[] as {table:string;payload:Record<string,unknown>}[],acuerdoPres:"p",fijoOwner:"personal",dedupeError:false}));
vi.mock("@/lib/supabase/server",()=>({createSupabaseAdminClient:()=>({from:(table:string)=>{
  let write=false;const q:Record<string,unknown>={};
  for(const m of ["select","eq","is","gte","order","limit"])q[m]=()=>q;
  q.insert=(payload:Record<string,unknown>)=>{write=true;state.writes.push({table,payload});return q;};
  const resolve=()=>{if(state.dedupeError&&table==="gastos_personales"&&!write)return{data:null,error:{message:"Network"}};const data=write?{id:`new-${table}`}:{cuentas:{id:"c",moneda:"ARS"},presupuestos:{id:"p",presupuesto_aprobado:true},obras:{id:"o"},mo_acuerdos:{id:"a",presupuesto_id:state.acuerdoPres},obra_plan_items:{id:"plan",presupuesto_id:"p"},finanzas_fijos:{id:"f",dueno:state.fijoOwner}}[table];return {data:data??null,error:null};};
  q.maybeSingle=async()=>resolve();q.single=async()=>resolve();return q;
}})}));
vi.mock("@/lib/dinero-sync",()=>({sincronizarEspejo:vi.fn(async()=>({accion:"asentado",patas:1}))}));
import {POST} from "./route";
const post=(body:Record<string,unknown>)=>POST(new NextRequest("http://localhost/api/gastos/rapido",{method:"POST",body:JSON.stringify(body)}));
beforeEach(()=>{state.writes=[];state.acuerdoPres="p";state.fijoOwner="personal";state.dedupeError=false;});
describe("registro desde relevos",()=>{
  it("conserva operario y trabajo sin duplicar el pago",async()=>{const r=await post({tipo:"obra",presupuesto_id:"p",importe:10.25,descripcion:"Pago",cuenta_id:"c",mo_acuerdo_id:"a",plan_item_id:"plan"});expect(r.status).toBe(200);expect(state.writes.find(w=>w.table==="presupuestos_gastos")?.payload).toMatchObject({mo_acuerdo_id:"a",plan_item_id:"plan",importe:10.25});});
  it("rechaza un acuerdo de otra obra antes de crear cualquier movimiento",async()=>{state.acuerdoPres="otra";const r=await post({tipo:"obra",presupuesto_id:"p",importe:100,mo_acuerdo_id:"a"});expect(r.status).toBe(400);expect(state.writes).toHaveLength(0);});
  it("conserva el fijo pagado y el gasto extraordinario en su destino",async()=>{const r=await post({tipo:"personal",concepto:"Fijo",monto:100,fijo_id:"f",extraordinario:true});expect(r.status).toBe(200);expect(state.writes[0].payload).toMatchObject({fijo_id:"f",extraordinario:true});});
  it("no carga un fijo de empresa como personal",async()=>{state.fijoOwner="empresa";expect((await post({tipo:"personal",concepto:"Fijo",monto:100,fijo_id:"f"})).status).toBe(400);expect(state.writes).toHaveLength(0);});
  it("un error de lectura en un reintento no produce un duplicado",async()=>{state.dedupeError=true;expect((await post({tipo:"personal",concepto:"Compra",monto:100,reintento:true})).status).toBe(500);expect(state.writes).toHaveLength(0);});
});
