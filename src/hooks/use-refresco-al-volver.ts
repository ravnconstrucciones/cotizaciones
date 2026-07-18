"use client";

import { useEffect, useRef } from "react";

/**
 * Re-dispara `cargar` cuando el usuario VUELVE a la página: pestaña que pasa
 * a visible (volver a la app en el iPhone), foco de ventana, o restauración
 * desde el bfcache (pageshow persisted).
 *
 * Por qué existe: los módulos de la home cargaban UNA vez al montar, y en
 * Safari iOS la página vive horas en memoria — se cargaba un gasto o un pago
 * por el bot y la home seguía mostrando los números viejos hasta recargar a
 * mano (bug "no refresca en la página principal", 18/07).
 *
 * Throttle por `minMs`: un visibilitychange y un focus llegan casi juntos al
 * volver — refresca una sola vez, y nunca pisa la carga del montaje.
 */
export function useRefrescoAlVolver(cargar: () => void, minMs = 10_000) {
  const ultimaRef = useRef(Date.now());

  useEffect(() => {
    const intentar = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultimaRef.current < minMs) return;
      ultimaRef.current = Date.now();
      cargar();
    };
    const alRestaurar = (e: PageTransitionEvent) => {
      if (e.persisted) intentar();
    };
    document.addEventListener("visibilitychange", intentar);
    window.addEventListener("focus", intentar);
    window.addEventListener("pageshow", alRestaurar);
    return () => {
      document.removeEventListener("visibilitychange", intentar);
      window.removeEventListener("focus", intentar);
      window.removeEventListener("pageshow", alRestaurar);
    };
  }, [cargar, minMs]);
}
