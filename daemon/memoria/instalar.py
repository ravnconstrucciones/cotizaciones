"""Instala el protocolo de memoria compartida sin tocar contenido ajeno."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shlex
import tempfile
from typing import Sequence


INICIO = "<!-- RAVN_MEMORIA_COMPARTIDA:START -->"
FIN = "<!-- RAVN_MEMORIA_COMPARTIDA:END -->"
FUENTE_PREDETERMINADA = Path("/Users/ezeotero/Documents/ravn")
PYTHON_313 = Path("/Library/Frameworks/Python.framework/Versions/3.13/bin/python3")
DESTINOS_INSTRUCCIONES = (
    Path("/Users/ezeotero/.codex/AGENTS.md"),
    Path("/Users/ezeotero/.claude/CLAUDE.md"),
    Path("/Users/ezeotero/Obsidian/RAVN/CLAUDE.md"),
)
GRAPHIFYIGNORE = Path("/Users/ezeotero/Obsidian/RAVN/.graphifyignore")
IGNORADO_CRUDO = "Conversaciones/crudo/"
SCHEMA_DESTINO = Path(
    "/Users/ezeotero/Obsidian/RAVN/Sistema/Memoria/esquemas/cierre-conversacion.schema.json"
)
DIRECTORIOS_VAULT = (
    Path("/Users/ezeotero/Obsidian/RAVN/Conversaciones/crudo"),
    Path("/Users/ezeotero/Obsidian/RAVN/Conversaciones/cierres"),
    Path("/Users/ezeotero/Obsidian/RAVN/Sistema/Memoria/esquemas"),
    Path("/Users/ezeotero/Obsidian/RAVN/Sistema/Memoria/indices"),
    Path("/Users/ezeotero/Obsidian/RAVN/Sistema/Memoria/pendientes-escritura"),
)
DIRECTORIOS_PRIVADOS = frozenset((DIRECTORIOS_VAULT[0], DIRECTORIOS_VAULT[-1]))
WRAPPER = Path("/Users/ezeotero/.local/bin/ravn-memoria")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m daemon.memoria.instalar")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--root", type=Path, default=Path("/"))
    parser.add_argument("--source", type=Path, default=FUENTE_PREDETERMINADA)
    args = parser.parse_args(argv)

    resultado = instalar(root=args.root, source=args.source, dry_run=args.dry_run)
    print(json.dumps(resultado, ensure_ascii=False))
    return 0


def instalar(*, root: Path, source: Path, dry_run: bool = False) -> dict[str, object]:
    """Instala los artefactos; ``root`` redirige sólo destinos absolutos."""
    bloque = _cargar_bloque(source / "daemon/memoria/instrucciones.md")
    schema_contenido = _cargar_schema(source / "daemon/memoria/cierre-conversacion.schema.json")
    destinos = [_bajo_root(root, ruta) for ruta in DESTINOS_INSTRUCCIONES]
    graphifyignore = _bajo_root(root, GRAPHIFYIGNORE)
    schema = _bajo_root(root, SCHEMA_DESTINO)
    directorios = [_bajo_root(root, ruta) for ruta in DIRECTORIOS_VAULT]
    wrapper = _bajo_root(root, WRAPPER)
    contenidos = {
        **{ruta: _reemplazar_bloques(_leer_opcional(ruta), bloque) for ruta in destinos},
        graphifyignore: _agregar_ignorado(_leer_opcional(graphifyignore)),
        schema: schema_contenido,
        wrapper: _contenido_wrapper(source),
    }
    cambios = _plan_cambios(contenidos, directorios, wrapper)

    if not dry_run:
        for ruta in destinos:
            _escribir_si_cambio(ruta, contenidos[ruta])

        _escribir_si_cambio(graphifyignore, contenidos[graphifyignore])
        _escribir_si_cambio(schema, contenidos[schema])

        for logico, ruta in zip(DIRECTORIOS_VAULT, directorios, strict=True):
            ruta.mkdir(parents=True, exist_ok=True)
            if logico in DIRECTORIOS_PRIVADOS:
                ruta.chmod(0o700)

        _escribir_si_cambio(wrapper, contenidos[wrapper], modo=0o755)

    return {
        "ok": True,
        "dry_run": dry_run,
        "managed_targets": [str(ruta) for ruta in (*destinos, graphifyignore)],
        "directories": [str(ruta) for ruta in directorios],
        "schema": str(schema),
        "wrapper": str(wrapper),
        "changes": cambios,
    }


def _bajo_root(root: Path, absoluto: Path) -> Path:
    if not absoluto.is_absolute():
        raise ValueError(f"El destino debe ser absoluto: {absoluto}")
    if root == Path("/"):
        return absoluto
    return root / absoluto.relative_to("/")


def _cargar_bloque(ruta: Path) -> str:
    contenido = _leer_texto(ruta)
    if contenido.count(INICIO) != 1 or contenido.count(FIN) != 1:
        raise ValueError(f"Bloque administrado inválido: {ruta}")
    inicio = contenido.index(INICIO)
    fin = contenido.index(FIN, inicio) + len(FIN)
    return contenido[inicio:fin]


def _cargar_schema(ruta: Path) -> str:
    contenido = _leer_texto(ruta)
    schema = json.loads(contenido)
    if not isinstance(schema, dict) or schema.get("type") != "object":
        raise ValueError(f"Schema de cierre inválido: {ruta}")
    return contenido


def _reemplazar_bloques(contenido: str, bloque: str) -> str:
    cantidad_inicios = contenido.count(INICIO)
    cantidad_finales = contenido.count(FIN)
    if cantidad_inicios != cantidad_finales:
        raise ValueError("Marcadores de memoria compartida desbalanceados")

    patron = re.compile(re.escape(INICIO) + r".*?" + re.escape(FIN), re.DOTALL)
    coincidencias = list(patron.finditer(contenido))
    if len(coincidencias) != cantidad_inicios:
        raise ValueError("Marcadores de memoria compartida desordenados o anidados")
    if not coincidencias:
        separador = "" if not contenido or contenido.endswith(("\n", "\r")) else "\n"
        return f"{contenido}{separador}{bloque}\n"

    partes: list[str] = []
    cursor = 0
    for indice, coincidencia in enumerate(coincidencias):
        partes.append(contenido[cursor : coincidencia.start()])
        if indice == 0:
            partes.append(bloque)
        cursor = coincidencia.end()
    partes.append(contenido[cursor:])
    return "".join(partes)


def _agregar_ignorado(contenido: str) -> str:
    lineas = contenido.splitlines(keepends=True)
    resultado: list[str] = []
    encontrado = False
    for linea in lineas:
        if linea.rstrip("\r\n") == IGNORADO_CRUDO:
            if encontrado:
                continue
            encontrado = True
        resultado.append(linea)

    if encontrado:
        return "".join(resultado)
    if contenido and not contenido.endswith(("\n", "\r")):
        resultado.append("\n")
    resultado.append(f"{IGNORADO_CRUDO}\n")
    return "".join(resultado)


def _contenido_wrapper(source: Path) -> str:
    source_texto = str(source)
    if "\n" in source_texto or "\r" in source_texto:
        raise ValueError("--source no puede contener saltos de línea")
    return (
        "#!/bin/sh\n"
        f"PYTHONPATH={shlex.quote(source_texto)} "
        f"exec {shlex.quote(str(PYTHON_313))} -m daemon.memoria.cli \"$@\"\n"
    )


def _plan_cambios(
    contenidos: dict[Path, str], directorios: list[Path], wrapper: Path
) -> list[dict[str, object]]:
    cambios: list[dict[str, object]] = []
    for ruta, contenido in contenidos.items():
        if _leer_opcional(ruta) != contenido:
            cambio: dict[str, object] = {"action": "write", "path": str(ruta)}
            if ruta == wrapper:
                cambio["mode"] = "0755"
            cambios.append(cambio)

    for logico, ruta in zip(DIRECTORIOS_VAULT, directorios, strict=True):
        if not ruta.is_dir():
            cambios.append({"action": "mkdir", "path": str(ruta)})
        if logico in DIRECTORIOS_PRIVADOS and _modo_actual(ruta) != 0o700:
            cambios.append({"action": "chmod", "path": str(ruta), "mode": "0700"})
    return cambios


def _modo_actual(ruta: Path) -> int | None:
    try:
        return ruta.stat().st_mode & 0o777
    except FileNotFoundError:
        return None


def _leer_opcional(ruta: Path) -> str:
    try:
        return _leer_texto(ruta)
    except FileNotFoundError:
        return ""


def _leer_texto(ruta: Path) -> str:
    with ruta.open("r", encoding="utf-8", newline="") as archivo:
        return archivo.read()


def _escribir_si_cambio(ruta: Path, contenido: str, modo: int | None = None) -> None:
    existente = _leer_opcional(ruta)
    modo_existente = _modo_actual(ruta)
    modo_final = (
        modo if modo is not None else (0o644 if modo_existente is None else modo_existente)
    )
    if existente != contenido:
        ruta.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporal = tempfile.mkstemp(prefix=f".{ruta.name}.", dir=ruta.parent)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as archivo:
                archivo.write(contenido)
                archivo.flush()
                os.fsync(archivo.fileno())
            os.chmod(temporal, modo_final)
            os.replace(temporal, ruta)
        finally:
            try:
                Path(temporal).unlink()
            except FileNotFoundError:
                pass
    if modo is not None and _modo_actual(ruta) != modo:
        ruta.chmod(modo)


if __name__ == "__main__":
    raise SystemExit(main())
