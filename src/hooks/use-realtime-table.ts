"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Refresca datos ante cualquier cambio (insert/update/delete) de una tabla
 * pública vía Supabase Realtime. Requiere la tabla en la publicación
 * supabase_realtime (eventos/trabajos_cola: las publica el Frente A;
 * cotizaciones: migración 20260613100000) y RLS que deje SELECT al
 * usuario autenticado.
 *
 * TOPIC ÚNICO POR INSTANCIA (no "optimizar" a un topic compartido): el
 * cliente browser es singleton y channel(topic) devuelve el MISMO canal si
 * el topic ya existe; subscribe() sobre un canal ya unido es no-op y los
 * bindings agregados después no disparan. Con topic compartido, el segundo
 * consumidor de la misma tabla queda sordo y el removeChannel de cualquiera
 * desuscribe a todos. El sufijo aleatorio por corrida del efecto evita ambas
 * cosas (y hace inocuo el re-subscribe cuando cambia `onChange`, p.ej. el
 * filtro por origen de /actividad).
 *
 * `onChange` DEBE ser estable (useCallback en el caller).
 */
export function useRealtimeTable(table: string, onChange: () => void) {
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`cdm-${table}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => onChange()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, onChange]);
}
