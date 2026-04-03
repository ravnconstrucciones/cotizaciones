#!/usr/bin/env python3
"""
Extrae fuentes incrustadas de un PDF (p. ej. export de Canva).

Uso:
  pip install -r scripts/requirements-fonts.txt
  npm run extract-fonts
  # o:
  python3 scripts/extract_pdf_fonts.py docs/mi-presupuesto-canva.pdf

Salida por defecto: src/fonts/canva-extracted/ (en .gitignore).
No se ejecuta en `npm run build` ni en Vercel: el deploy no depende de esto.

Pasos después de extraer:
  1. Revisá qué archivo corresponde a Raleway (nombre suele incluir "Raleway" o un prefijo tipo "ABCDEF+").
  2. Si son .otf/.ttf, Next acepta esos formatos en next/font/local (podés apuntar raleway-local.ts a ellos).
  3. O convertí a .woff2 y reemplazá los de src/fonts/raleway/ conservando pesos (200–700).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DEFAULT_PDF = REPO / "docs" / "presupuesto-canva.pdf"
DEFAULT_OUT = REPO / "src" / "fonts" / "canva-extracted"


def safe_name(s: str) -> str:
    s = s.strip() or "font"
    s = re.sub(r"[^\w.\-]+", "_", s)
    return s[:140]


def main() -> int:
    try:
        import fitz  # PyMuPDF
    except ImportError:
        print(
            "Falta PyMuPDF. Instalá con:\n"
            "  pip install -r scripts/requirements-fonts.txt\n"
            "o: pip install pymupdf",
            file=sys.stderr,
        )
        return 1

    pdf_path = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else DEFAULT_PDF
    out_dir = Path(sys.argv[2]).expanduser() if len(sys.argv) > 2 else DEFAULT_OUT

    if not pdf_path.is_file():
        print(
            f"No está el PDF: {pdf_path}\n"
            "Exportá tu plantilla desde Canva como PDF y guardala ahí, "
            "o pasá la ruta:\n"
            "  python3 scripts/extract_pdf_fonts.py /ruta/al/archivo.pdf",
            file=sys.stderr,
        )
        return 1

    out_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf_path)
    seen: set[int] = set()
    saved = 0

    for page in doc:
        for font in page.get_fonts():
            xref = int(font[0])
            if xref in seen:
                continue
            seen.add(xref)
            try:
                res = doc.extract_font(xref)
            except (ValueError, RuntimeError):
                continue
            if not res:
                continue
            # PyMuPDF: tupla (ext, type, name, buffer) o dict según versión
            if isinstance(res, dict):
                ext = str(res.get("ext") or "bin").lower()
                base = str(res.get("name") or f"font_{xref}")
                buf = res.get("buffer")
            else:
                r = list(res)
                buf = r[-1] if r else None
                ext = str(r[0] if r else "bin").lower()
                base = str(r[2]) if len(r) > 2 else f"font_{xref}"
            if not isinstance(buf, (bytes, bytearray)) or len(buf) < 100:
                continue

            if ext not in ("ttf", "otf", "cff", "woff", "woff2", "type1"):
                ext = "bin"
            fn = out_dir / f"{xref:05d}_{safe_name(base)}.{ext}"
            fn.write_bytes(buf)
            print(f"OK  {fn.relative_to(REPO)}  ({len(buf)} bytes)")
            saved += 1

    doc.close()

    if saved == 0:
        print(
            "No se extrajo ninguna fuente (PDF sin embeds accesibles o fuentes solo referenciadas).",
            file=sys.stderr,
        )
        return 2

    print(f"\nListo: {saved} archivo(s) en {out_dir.relative_to(REPO)}")
    print(
        "Siguiente: identificá Raleway, copiá/convertí y actualizá src/app/raleway-local.ts o src/fonts/raleway/."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
