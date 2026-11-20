"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export type ItemBotonera = { id: string; label: string };

/** Distancia desde arriba a partir de la cual una sección cuenta como "la que estás viendo". */
const UMBRAL = 120;

/**
 * Botonera fija arriba dentro de la obra (pedido de Eze, 20/11/2026): cada botón baja suave
 * hasta su sección (#id) y la raya marca en qué parte de la página está el cliente.
 */
export function Botonera({ items }: { items: ItemBotonera[] }) {
  const quieto = useReducedMotion();
  const [activo, setActivo] = useState<string | null>(null);
  const tira = useRef<HTMLDivElement>(null);
  const clave = items.map((i) => i.id).join("|");

  // Sección activa = la última cuyo borde superior ya pasó el umbral.
  useEffect(() => {
    let raf = 0;
    const calcular = () => {
      let actual: string | null = null;
      for (const { id } of items) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= UMBRAL) actual = id;
      }
      // Al fondo de la página la última sección no llega al umbral: igual es la activa.
      const alFondo = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (alFondo && items.length) actual = items[items.length - 1].id;
      setActivo(actual);
    };
    const alScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(calcular);
    };
    calcular();
    window.addEventListener("scroll", alScroll, { passive: true });
    window.addEventListener("resize", alScroll);
    return () => {
      window.removeEventListener("scroll", alScroll);
      window.removeEventListener("resize", alScroll);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  // En el celular la tira desliza de costado: el botón activo queda a la vista.
  useEffect(() => {
    const cont = tira.current;
    const btn = activo ? cont?.querySelector<HTMLElement>(`[data-seccion="${activo}"]`) : null;
    if (!cont || !btn) return;
    const destino = btn.offsetLeft - (cont.clientWidth - btn.offsetWidth) / 2;
    cont.scrollTo({ left: Math.max(0, destino), behavior: quieto ? "auto" : "smooth" });
  }, [activo, quieto]);

  function ir(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    setActivo(id);
    el.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  }

  if (items.length < 2) return null;

  return (
    <nav
      aria-label="Secciones de la obra"
      className="sticky top-0 z-30 -mx-5 border-b border-[#f2efe8]/15 bg-[#070707]/85 backdrop-blur-md sm:-mx-8"
    >
      <div
        ref={tira}
        className="flex gap-1 overflow-x-auto px-3 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden"
      >
        {items.map(({ id, label }) => {
          const esActivo = activo === id;
          return (
            <a
              key={id}
              href={`#${id}`}
              data-seccion={id}
              onClick={(e) => ir(e, id)}
              aria-current={esActivo ? "location" : undefined}
              className={`relative inline-flex min-h-12 shrink-0 items-center px-3 text-[14px] font-semibold tracking-[-0.015em] transition-colors duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#f2efe8] ${esActivo ? "text-[#f2efe8]" : "text-[#f2efe8]/55 hover:text-[#f2efe8]"}`}
            >
              {label}
              {esActivo ? (
                <motion.span
                  layoutId="botonera-activo"
                  aria-hidden
                  className="absolute inset-x-3 bottom-0 h-[2px] bg-[#f2efe8]"
                  transition={quieto ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38 }}
                />
              ) : null}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
