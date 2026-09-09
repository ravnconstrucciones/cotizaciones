import type { SupabaseClient } from "@supabase/supabase-js";

/** Pagina para no presentar un total parcial como el total real (límite REST: 1000). */
export async function readAll<T>(sb: SupabaseClient, table: string, columns: string, filter?: { column: string; value: string }): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    let q = sb.from(table).select(columns).order("id").range(offset, offset + 999);
    if (filter) q = q.eq(filter.column, filter.value);
    const { data, error } = await q;
    if (error) throw new Error(`No se pudo leer ${table}: ${error.message}`);
    rows.push(...(data ?? []) as unknown as T[]);
    if (!data || data.length < 1000) return rows;
  }
}
