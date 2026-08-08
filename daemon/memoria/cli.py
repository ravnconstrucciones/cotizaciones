"""Punto de entrada neutral para los comandos de memoria compartida."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Sequence

from .app_ravn import BackendSupabaseJobs, ResolverAppRavn
from .cerrar import FalloPersistencia, cerrar
from .recuperar import ConsultaMemoria, recuperar, reindexar
from .sincronizacion_git import SincronizadorGitVault


CODIGO_VALIDACION = 2
CODIGO_PERSISTENCIA = 3
CODIGO_SINCRONIZACION = 4


def main(argv: Sequence[str] | None = None) -> int:
    parser = _crear_parser()
    args = parser.parse_args(argv)

    if args.comando == "cerrar":
        return _comando_cerrar(args)
    if args.comando == "recuperar":
        return _comando_recuperar(args)
    if args.comando == "reindexar":
        return _comando_reindexar(args)
    return _comando_no_disponible(args.comando)


def _crear_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ravn-memoria")
    subcomandos = parser.add_subparsers(dest="comando", required=True)
    cerrar_parser = subcomandos.add_parser("cerrar")
    cerrar_parser.add_argument("--vault", required=True, type=Path)
    cerrar_parser.add_argument("--session-path", type=Path)
    cerrar_parser.add_argument("--host")
    cerrar_parser.add_argument("--thread-id")
    cerrar_parser.add_argument(
        "--git-dir", type=Path, default=Path.home() / ".ravn-vault-git"
    )
    cerrar_parser.add_argument("--git-remote", default="origin")
    cerrar_parser.add_argument("--git-branch", default="main")
    cerrar_parser.add_argument("--sin-sincronizacion", action="store_true")
    recuperar_parser = subcomandos.add_parser("recuperar")
    recuperar_parser.add_argument("--vault", required=True, type=Path)
    recuperar_parser.add_argument("--query", required=True)
    recuperar_parser.add_argument("--entidad", action="append", default=[])
    recuperar_parser.add_argument("--obra", action="append", default=[])
    recuperar_parser.add_argument("--cliente", action="append", default=[])
    recuperar_parser.add_argument("--cotizacion", action="append", default=[])
    recuperar_parser.add_argument("--documento", action="append", default=[])
    recuperar_parser.add_argument("--max-notas", type=int, default=8)
    recuperar_parser.add_argument("--max-tokens", type=int, default=3000)
    recuperar_parser.add_argument("--sin-app", action="store_true")
    reindexar_parser = subcomandos.add_parser("reindexar")
    reindexar_parser.add_argument("--vault", required=True, type=Path)
    subcomandos.add_parser("estado")
    return parser


def _comando_cerrar(args: argparse.Namespace) -> int:
    try:
        datos = json.load(sys.stdin)
        evidencia = cerrar(
            args.vault,
            datos,
            session_path=args.session_path,
            host=args.host,
            thread_id=args.thread_id,
            sincronizador=_crear_sincronizador(args),
        )
    except (json.JSONDecodeError, ValueError) as error:
        _imprimir_error(CODIGO_VALIDACION, str(error))
        return CODIGO_VALIDACION
    except FalloPersistencia as error:
        _imprimir_error(CODIGO_PERSISTENCIA, str(error))
        return CODIGO_PERSISTENCIA
    except OSError as error:
        _imprimir_error(CODIGO_PERSISTENCIA, str(error))
        return CODIGO_PERSISTENCIA

    print(json.dumps(evidencia, ensure_ascii=False))
    return 0 if evidencia.get("ok") is True else CODIGO_SINCRONIZACION


def _crear_sincronizador(args: argparse.Namespace) -> SincronizadorGitVault | None:
    if args.sin_sincronizacion:
        return None
    return SincronizadorGitVault(
        vault=args.vault,
        git_dir=args.git_dir,
        remote=args.git_remote,
        branch=args.git_branch,
    )


def _comando_recuperar(args: argparse.Namespace) -> int:
    try:
        paquete = recuperar(
            ConsultaMemoria(
                args.query,
                args.entidad,
                args.max_notas,
                args.max_tokens,
                entidades_tipadas=_entidades_tipadas_cli(args),
            ),
            args.vault,
            resolver_app=None if args.sin_app else _crear_resolver_app(),
        )
    except (OSError, ValueError) as error:
        _imprimir_error(CODIGO_VALIDACION, str(error))
        return CODIGO_VALIDACION
    print(json.dumps(paquete.a_dict(), ensure_ascii=False))
    return 0


def _crear_resolver_app() -> ResolverAppRavn:
    return ResolverAppRavn(BackendSupabaseJobs.desde_jobslib())


def _entidades_tipadas_cli(args: argparse.Namespace) -> dict[str, list[str]] | None:
    tipadas = {
        "obras": list(args.obra),
        "clientes": list(args.cliente),
        "cotizaciones": list(args.cotizacion),
        "documentos": list(args.documento),
    }
    if not any(tipadas.values()):
        return None

    prefijos = {
        "obra": "obras",
        "obras": "obras",
        "cliente": "clientes",
        "clientes": "clientes",
        "cotizacion": "cotizaciones",
        "cotizaciones": "cotizaciones",
        "documento": "documentos",
        "documentos": "documentos",
    }
    for entidad in args.entidad:
        prefijo, separador, valor = entidad.partition(":")
        tipo = prefijos.get(prefijo.strip().casefold()) if separador else None
        if tipo and valor.strip():
            tipadas[tipo].append(valor.strip())
        else:
            for nombre_tipo in tipadas:
                tipadas[nombre_tipo].append(entidad)
    return tipadas


def _comando_reindexar(args: argparse.Namespace) -> int:
    try:
        evidencia = reindexar(args.vault)
    except (OSError, ValueError) as error:
        _imprimir_error(CODIGO_PERSISTENCIA, str(error))
        return CODIGO_PERSISTENCIA
    print(json.dumps(evidencia, ensure_ascii=False))
    return 0


def _comando_no_disponible(comando: str) -> int:
    _imprimir_error(CODIGO_VALIDACION, f"El comando '{comando}' todavía no está disponible.")
    return CODIGO_VALIDACION


def _imprimir_error(codigo: int, error: str) -> None:
    print(
        json.dumps(
            {
                "ok": False,
                "codigo": codigo,
                "error": error,
                "persistido_local": False,
                "indexado": False,
                "sincronizado": False,
                "paso": "validacion" if codigo == CODIGO_VALIDACION else "persistencia",
                "pendiente": "",
            },
            ensure_ascii=False,
        ),
        file=sys.stderr,
    )


if __name__ == "__main__":
    raise SystemExit(main())
