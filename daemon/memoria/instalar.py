"""Instala el protocolo de memoria compartida sin tocar contenido ajeno."""

from __future__ import annotations

import argparse
from dataclasses import dataclass, fields
import json
import os
from pathlib import Path
import re
import shlex
import stat
import tempfile
from typing import Iterable, Sequence

from .modelo import Cierre, ESTADOS, HOSTS, SENSIBILIDADES


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
VAULT_LOGICO = Path("/Users/ezeotero/Obsidian/RAVN")
VAULT_FISICO = Path(
    "/Users/ezeotero/Library/Mobile Documents/iCloud~md~obsidian/Documents/RAVN"
)


@dataclass(frozen=True)
class _EstadoArchivo:
    contenido: bytes | None
    modo: int | None


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
    """Prepara y aplica una instalación confinada, atómica e idempotente."""
    root = _normalizar_root(root)
    source = source.resolve(strict=False)
    instrucciones_fuente = source / "daemon/memoria/instrucciones.md"
    schema_fuente = source / "daemon/memoria/cierre-conversacion.schema.json"
    _preflight_fuente(instrucciones_fuente)
    _preflight_fuente(schema_fuente)

    destinos = [_bajo_root(root, ruta) for ruta in DESTINOS_INSTRUCCIONES]
    graphifyignore = _bajo_root(root, GRAPHIFYIGNORE)
    schema = _bajo_root(root, SCHEMA_DESTINO)
    directorios = [_bajo_root(root, ruta) for ruta in DIRECTORIOS_VAULT]
    wrapper = _bajo_root(root, WRAPPER)
    archivos = [*destinos, graphifyignore, schema, wrapper]
    _preflight_destinos(root, archivos, directorios)

    bloque = _cargar_bloque(instrucciones_fuente)
    schema_contenido = _cargar_schema(schema_fuente)
    contenidos = {
        **{ruta: _reemplazar_bloque(_leer_opcional(ruta), bloque) for ruta in destinos},
        graphifyignore: _agregar_ignorado(_leer_opcional(graphifyignore)),
        schema: schema_contenido,
        wrapper: _contenido_wrapper(source),
    }
    cambios = _plan_cambios(contenidos, directorios, wrapper)

    if not dry_run and cambios:
        _aplicar_transaccion(root, contenidos, directorios, wrapper)

    return {
        "ok": True,
        "dry_run": dry_run,
        "managed_targets": [str(ruta) for ruta in (*destinos, graphifyignore)],
        "directories": [str(ruta) for ruta in directorios],
        "schema": str(schema),
        "wrapper": str(wrapper),
        "changes": cambios,
    }


def _normalizar_root(root: Path) -> Path:
    if not root.is_absolute():
        raise ValueError("--root debe ser una ruta absoluta")
    if ".." in root.parts:
        raise ValueError("--root no puede contener '..'")
    _rechazar_symlinks_hasta(root)
    normalizado = root.resolve(strict=False)
    _rechazar_symlinks_hasta(normalizado)
    if normalizado.exists() and not normalizado.is_dir():
        raise ValueError(f"--root no es un directorio: {normalizado}")
    return normalizado


def _bajo_root(root: Path, absoluto: Path) -> Path:
    if not absoluto.is_absolute():
        raise ValueError(f"El destino debe ser absoluto: {absoluto}")
    if _es_root_vivo(root):
        return absoluto
    destino = root / absoluto.relative_to("/")
    _validar_ruta_destino(root, destino)
    return destino


def _preflight_fuente(ruta: Path) -> None:
    if ruta.is_symlink() or not ruta.is_file():
        raise ValueError(f"Fuente ausente o no regular: {ruta}")
    if not os.access(ruta, os.R_OK):
        raise PermissionError(f"Fuente sin permiso de lectura: {ruta}")


def _preflight_destinos(root: Path, archivos: list[Path], directorios: list[Path]) -> None:
    for ruta in (*archivos, *directorios):
        _validar_ruta_destino(root, ruta)

    for ruta in archivos:
        if ruta.exists() and not ruta.is_file():
            raise ValueError(f"El destino de archivo no es regular: {ruta}")
        if ruta.exists() and not os.access(ruta, os.R_OK):
            raise PermissionError(f"Destino sin permiso de lectura: {ruta}")
        _asegurar_escribible(ruta.parent, permitir_symlink=_es_root_vivo(root))

    for logico, ruta in zip(DIRECTORIOS_VAULT, directorios, strict=True):
        if ruta.exists() and not ruta.is_dir():
            raise ValueError(f"El destino de directorio no es un directorio: {ruta}")
        _asegurar_escribible(ruta, permitir_symlink=_es_root_vivo(root))
        if (
            logico in DIRECTORIOS_PRIVADOS
            and ruta.exists()
            and _modo_actual(ruta) != 0o700
            and os.geteuid() not in (0, ruta.stat().st_uid)
        ):
            raise PermissionError(f"Sin permiso para cambiar el modo de {ruta}")


def _asegurar_confinado(root: Path, ruta: Path) -> None:
    try:
        ruta.relative_to(root)
    except ValueError as error:
        raise ValueError(f"Destino fuera de --root: {ruta}") from error
    fisico = ruta.resolve(strict=False)
    try:
        fisico.relative_to(root)
    except ValueError as error:
        raise ValueError(f"Destino físico fuera de --root: {ruta} -> {fisico}") from error


def _validar_ruta_destino(root: Path, ruta: Path) -> None:
    """`/` confía sólo en destinos codificados; roots redirigidos son sandboxes."""
    if _es_root_vivo(root):
        if not ruta.is_absolute():
            raise ValueError(f"Destino vivo no absoluto: {ruta}")
        permitidos = {VAULT_LOGICO: VAULT_FISICO} if ruta.is_relative_to(VAULT_LOGICO) else {}
        _rechazar_symlinks_hasta(ruta, permitidos=permitidos)
        return
    _asegurar_confinado(root, ruta)
    _rechazar_symlinks_hasta(ruta)


def _es_root_vivo(root: Path) -> bool:
    return root == Path("/")


def _rechazar_symlinks_hasta(
    ruta: Path, *, permitidos: dict[Path, Path] | None = None
) -> None:
    permitidos = permitidos or {}
    actual = Path(ruta.anchor)
    for parte in ruta.parts[1:]:
        actual /= parte
        if actual.is_symlink():
            esperado = permitidos.get(actual)
            if esperado is None or actual.resolve(strict=False) != esperado:
                raise ValueError(f"No se permiten symlinks en rutas de instalación: {actual}")


def _asegurar_escribible(ruta: Path, *, permitir_symlink: bool) -> None:
    existente = ruta
    while not existente.exists():
        if existente.is_symlink():
            raise ValueError(f"Symlink roto en ruta de instalación: {existente}")
        if existente == existente.parent:
            raise ValueError(f"No existe un ancestro para crear {ruta}")
        existente = existente.parent
    if (existente.is_symlink() and not permitir_symlink) or not existente.is_dir():
        raise ValueError(f"El ancestro no es un directorio regular: {existente}")
    if not os.access(existente, os.W_OK | os.X_OK):
        raise PermissionError(f"Sin permiso para escribir bajo {existente}")


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

    campos = {campo.name for campo in fields(Cierre)}
    requeridos = schema.get("required")
    propiedades = schema.get("properties")
    if (
        not isinstance(requeridos, list)
        or len(requeridos) != len(set(requeridos))
        or set(requeridos) != campos
        or not isinstance(propiedades, dict)
        or set(propiedades) != campos
    ):
        raise ValueError(f"Schema divergente de Cierre: {ruta}")
    _validar_enum_schema(propiedades, "host", HOSTS, ruta)
    _validar_enum_schema(propiedades, "estado", ESTADOS, ruta)
    _validar_enum_schema(propiedades, "sensibilidad", SENSIBILIDADES, ruta)
    return contenido


def _validar_enum_schema(
    propiedades: dict[str, object], campo: str, esperado: set[str], ruta: Path
) -> None:
    propiedad = propiedades.get(campo)
    valores = propiedad.get("enum") if isinstance(propiedad, dict) else None
    if (
        not isinstance(valores, list)
        or len(valores) != len(set(valores))
        or set(valores) != esperado
    ):
        raise ValueError(f"Enum '{campo}' divergente en {ruta}")


def _reemplazar_bloque(contenido: str, bloque: str) -> str:
    cantidad_inicios = contenido.count(INICIO)
    cantidad_finales = contenido.count(FIN)
    if cantidad_inicios != cantidad_finales:
        raise ValueError("Marcadores de memoria compartida desbalanceados")
    if cantidad_inicios > 1:
        raise ValueError("Hay más de un bloque administrado; se requiere revisión manual")

    patron = re.compile(re.escape(INICIO) + r".*?" + re.escape(FIN), re.DOTALL)
    coincidencias = list(patron.finditer(contenido))
    if len(coincidencias) != cantidad_inicios:
        raise ValueError("Marcadores de memoria compartida desordenados o anidados")
    if not coincidencias:
        separador = "" if not contenido or contenido.endswith(("\n", "\r")) else "\n"
        return f"{contenido}{separador}{bloque}\n"

    coincidencia = coincidencias[0]
    return f"{contenido[:coincidencia.start()]}{bloque}{contenido[coincidencia.end():]}"


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
        elif ruta == wrapper and _modo_actual(ruta) != 0o755:
            cambios.append({"action": "chmod", "path": str(ruta), "mode": "0755"})

    for logico, ruta in zip(DIRECTORIOS_VAULT, directorios, strict=True):
        if not ruta.is_dir():
            cambios.append({"action": "mkdir", "path": str(ruta)})
        if logico in DIRECTORIOS_PRIVADOS and _modo_actual(ruta) != 0o700:
            cambios.append({"action": "chmod", "path": str(ruta), "mode": "0700"})
    return cambios


def _aplicar_transaccion(
    root: Path, contenidos: dict[Path, str], directorios: list[Path], wrapper: Path
) -> None:
    archivos = list(contenidos)
    _preflight_destinos(root, archivos, directorios)
    originales = {ruta: _estado_archivo(ruta) for ruta in archivos}
    por_escribir = {
        ruta: contenido
        for ruta, contenido in contenidos.items()
        if _leer_opcional(ruta) != contenido
    }
    creados: list[Path] = []
    preparados: dict[Path, Path] = {}
    publicados: list[Path] = []
    modos_cambiados: dict[Path, int] = {}

    try:
        permitir_symlink = _es_root_vivo(root)
        for ruta in directorios:
            _crear_directorio(ruta, creados, permitir_symlink=permitir_symlink)
        for ruta in archivos:
            _crear_directorio(ruta.parent, creados, permitir_symlink=permitir_symlink)

        preparados = _preparar_archivos(root, por_escribir, originales, wrapper)

        for logico, ruta in zip(DIRECTORIOS_VAULT, directorios, strict=True):
            _validar_ruta_destino(root, ruta)
            if logico in DIRECTORIOS_PRIVADOS and _modo_actual(ruta) != 0o700:
                modo_anterior = _modo_actual(ruta)
                ruta.chmod(0o700)
                if modo_anterior is not None and ruta not in creados:
                    modos_cambiados[ruta] = modo_anterior

        for ruta, preparado in preparados.items():
            _validar_ruta_destino(root, ruta)
            _publicar_archivo(preparado, ruta)
            publicados.append(ruta)

        if wrapper not in preparados and _modo_actual(wrapper) != 0o755:
            _validar_ruta_destino(root, wrapper)
            modo_anterior = _modo_actual(wrapper)
            wrapper.chmod(0o755)
            if modo_anterior is not None:
                modos_cambiados[wrapper] = modo_anterior

        _limpiar_preparados(preparados.values())
    except BaseException as error:
        errores = _rollback(
            originales,
            publicados,
            modos_cambiados,
            creados,
            preparados.values(),
        )
        if errores:
            detalle = "; ".join(errores)
            raise RuntimeError(f"Falló la instalación y el rollback: {detalle}") from error
        raise


def _preparar_archivos(
    root: Path,
    contenidos: dict[Path, str],
    originales: dict[Path, _EstadoArchivo],
    wrapper: Path,
) -> dict[Path, Path]:
    preparados: dict[Path, Path] = {}
    try:
        for destino, contenido in contenidos.items():
            _validar_ruta_destino(root, destino)
            modo_original = originales[destino].modo
            modo = (
                0o755
                if destino == wrapper
                else (0o644 if modo_original is None else modo_original)
            )
            preparados[destino] = _preparar_archivo(
                destino, contenido.encode("utf-8"), modo
            )
    except BaseException:
        _limpiar_preparados(preparados.values())
        raise
    return preparados


def _preparar_archivo(destino: Path, contenido: bytes, modo: int) -> Path:
    descriptor, nombre = tempfile.mkstemp(
        prefix=f".{destino.name}.ravn-stage-", dir=destino.parent
    )
    preparado = Path(nombre)
    try:
        with os.fdopen(descriptor, "wb") as archivo:
            archivo.write(contenido)
            archivo.flush()
            os.fsync(archivo.fileno())
        preparado.chmod(modo)
        return preparado
    except BaseException:
        try:
            os.close(descriptor)
        except OSError:
            pass
        try:
            preparado.unlink()
        except FileNotFoundError:
            pass
        raise


def _publicar_archivo(origen: str | os.PathLike[str], destino: str | os.PathLike[str]) -> None:
    os.replace(origen, destino)


def _rollback(
    originales: dict[Path, _EstadoArchivo],
    publicados: list[Path],
    modos_cambiados: dict[Path, int],
    creados: list[Path],
    preparados: Iterable[Path],
) -> list[str]:
    errores: list[str] = []
    for ruta in reversed(publicados):
        original = originales[ruta]
        try:
            if original.contenido is None:
                if ruta.is_symlink() or ruta.exists():
                    ruta.unlink()
            else:
                _restaurar_archivo(ruta, original)
        except OSError as error:
            errores.append(f"archivo {ruta}: {error}")

    for ruta, modo in reversed(list(modos_cambiados.items())):
        try:
            if ruta.is_dir() and _modo_actual(ruta) != modo:
                ruta.chmod(modo)
        except OSError as error:
            errores.append(f"modo {ruta}: {error}")

    try:
        _limpiar_preparados(preparados)
    except OSError as error:
        errores.append(f"temporales: {error}")

    for ruta in sorted(set(creados), key=lambda item: len(item.parts), reverse=True):
        try:
            if ruta.exists():
                ruta.rmdir()
        except OSError as error:
            errores.append(f"directorio {ruta}: {error}")
    return errores


def _restaurar_archivo(ruta: Path, original: _EstadoArchivo) -> None:
    if original.contenido is None or original.modo is None:
        raise ValueError("Estado original incompleto")
    descriptor, temporal = tempfile.mkstemp(prefix=f".{ruta.name}.rollback-", dir=ruta.parent)
    try:
        with os.fdopen(descriptor, "wb") as archivo:
            archivo.write(original.contenido)
            archivo.flush()
            os.fsync(archivo.fileno())
        os.chmod(temporal, original.modo)
        os.replace(temporal, ruta)
    finally:
        try:
            Path(temporal).unlink()
        except FileNotFoundError:
            pass


def _crear_directorio(
    ruta: Path, creados: list[Path], *, permitir_symlink: bool
) -> None:
    faltantes: list[Path] = []
    actual = ruta
    while not actual.exists():
        if actual.is_symlink():
            raise ValueError(f"No se permite crear a través de symlink: {actual}")
        faltantes.append(actual)
        if actual == actual.parent:
            raise ValueError(f"No existe un ancestro para crear {ruta}")
        actual = actual.parent
    if (actual.is_symlink() and not permitir_symlink) or not actual.is_dir():
        raise ValueError(f"El ancestro no es un directorio regular: {actual}")
    for directorio in reversed(faltantes):
        directorio.mkdir()
        creados.append(directorio)


def _limpiar_preparados(preparados: Iterable[Path]) -> None:
    for ruta in preparados:
        if ruta.is_symlink() or ruta.exists():
            ruta.unlink()


def _estado_archivo(ruta: Path) -> _EstadoArchivo:
    if not ruta.exists():
        return _EstadoArchivo(None, None)
    return _EstadoArchivo(ruta.read_bytes(), _modo_actual(ruta))


def _modo_actual(ruta: Path) -> int | None:
    try:
        return stat.S_IMODE(ruta.stat().st_mode)
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


if __name__ == "__main__":
    raise SystemExit(main())
