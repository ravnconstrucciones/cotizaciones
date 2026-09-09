/** Identidades confirmadas en App RAVN; nunca se deducen de descripciones. */
export type Operario = { id: string; nombre: string; aliases: string[] };
const normalizar = (nombre: string) => nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");

export function operarioPorNombre(nombre: string | null | undefined, operarios: Operario[]): Operario | null {
  if (!nombre?.trim()) return null;
  const buscado = normalizar(nombre);
  const candidatos = operarios.filter(o => [o.nombre, ...(o.aliases ?? [])].some(alias => normalizar(alias) === buscado));
  return candidatos.length === 1 ? candidatos[0] : null;
}

export function nombreOperario(nombre: string | null | undefined, operarios: Operario[]): string {
  return operarioPorNombre(nombre, operarios)?.nombre ?? (nombre?.trim() || "Sin operario asignado");
}
