import { ObraEconomiaScreen } from "./obra-economia-screen";
export default async function ObraPage({params}:{params:Promise<{id:string}>}) { const {id}=await params; return <ObraEconomiaScreen presupuestoId={id}/>; }
