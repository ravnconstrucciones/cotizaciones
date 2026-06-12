"use client";

import { useEffect } from "react";

/**
 * ¿Este montaje puede animar su entrada? (ronda 6 — bug del "vacío negro")
 *
 * Los wrappers de Framer Motion con `initial={{opacity: 0}}` se SSR-ean con
 * opacity:0 inline: la página queda INVISIBLE hasta que FM hidrata (segundos
 * en frío). Regla: la carga de documento NO anima (el contenido pinta con el
 * HTML); las navegaciones client-side — donde la hidratación ya pasó y la
 * animación corre al toque — SÍ.
 *
 * Devuelve false en el SSR y en el primer montaje (hidratación de la carga
 * inicial); true en montajes posteriores (navegación client-side).
 */
let yaHidrato = false;

export function useEntradaAnimada(): boolean {
  const animar = yaHidrato;
  useEffect(() => {
    yaHidrato = true;
  }, []);
  return animar;
}
