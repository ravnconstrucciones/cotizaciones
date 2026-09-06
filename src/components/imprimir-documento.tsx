"use client";
import { useState } from "react";
export function ImprimirDocumento() {
  const [preparando, setPreparando] = useState(false);
  async function imprimir() {
    setPreparando(true);
    try {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => {})));
      window.print();
    } finally { setPreparando(false); }
  }
  return <button type="button" disabled={preparando} onClick={imprimir}
    style={{minHeight:44,padding:"10px 20px",border:"1px solid currentColor",marginBottom:12,cursor:"pointer"}}>
    {preparando ? "Preparando documento…" : "Imprimir / guardar PDF"}
  </button>;
}
