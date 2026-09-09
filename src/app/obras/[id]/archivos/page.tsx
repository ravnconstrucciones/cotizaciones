import { ObraOrbitalScreen } from "../obra-orbital-screen";
export default async function ArchivosPage({params}:{params:Promise<{id:string}>}) {const {id}=await params;return <ObraOrbitalScreen presupuestoId={id}/>;}
