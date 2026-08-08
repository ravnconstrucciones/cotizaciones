"""Recuperación determinística de cierres validados, sin leer transcripciones crudas."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from math import ceil
import json
import os
from pathlib import Path
import re
import tempfile
from typing import Any

from .almacen import _bloquear_indice, claves_indice
from .modelo import Cierre, cierre_a_markdown, validar_cierre


_CIERRES = Path("Conversaciones") / "cierres"
_INDICE = Path("Sistema") / "Memoria" / "indices" / "entidades.json"
_TOKEN = re.compile(r"[^\W_]+", re.UNICODE)
_GRAFOS = (
    Path("Sistema") / "Graphify" / "grafo-app.json",
    Path("Sistema") / "Memoria" / "grafo-app.json",
    Path("grafo-app.json"),
)
_SECCIONES_CIERRE = {
    "Hechos confirmados": "hechos",
    "Decisiones": "decisiones",
    "Métodos reutilizables": "metodos",
    "Cambios realizados": "cambios",
    "Pendientes": "pendientes",
    "Separaciones de alcance": "separaciones",
    "Enlaces": "enlaces",
}


@dataclass(frozen=True)
class ConsultaMemoria:
    texto: str
    entidades: list[str]
    max_notas: int = 8
    max_tokens: int = 3000

    def __post_init__(self) -> None:
        if not isinstance(self.texto, str):
            raise ValueError("La consulta debe ser texto.")
        if not all(isinstance(entidad, str) and entidad.strip() for entidad in self.entidades):
            raise ValueError("Las entidades deben ser textos no vacíos.")
        if self.max_notas < 0 or self.max_tokens < 0:
            raise ValueError("Los límites de recuperación no pueden ser negativos.")


@dataclass(frozen=True)
class NotaContexto:
    ruta: str
    titulo: str
    contenido: str
    entidades: dict[str, list[str]]
    razones: list[str]
    puntaje: float
    tokens_estimados: int


@dataclass(frozen=True)
class PaqueteContexto:
    notas: list[NotaContexto]
    app_refs: list[str]
    tokens_estimados: int
    procedencia: list[dict[str, object]]
    confianza: float

    def a_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class _CierreLeido:
    cierre: Cierre
    ruta: str
    entidades: dict[str, list[str]]
    contenido: str
    cuerpo: str
    app_refs: list[str]


def recuperar(consulta: ConsultaMemoria, vault: Path) -> PaqueteContexto:
    """Devuelve cierres relevantes dentro de límites duros de notas y tokens.

    El recorrido está intencionalmente confinado a ``Conversaciones/cierres``:
    una consulta nunca abre ``Conversaciones/crudo``.
    """
    vault = Path(vault)
    entidades_consulta = {_normalizar(valor) for valor in consulta.entidades}
    tokens_consulta = _tokens(consulta.texto)
    vecinos = _vecinos_graphify(vault, entidades_consulta)

    candidatas: list[NotaContexto] = []
    refs_por_ruta: dict[str, list[str]] = {}
    for nota in _cierres_validados(vault):
        puntaje, razones = _puntuar(nota, entidades_consulta, tokens_consulta, vecinos)
        if not razones:
            continue
        tokens = _estimar_tokens(nota.contenido)
        candidatas.append(
            NotaContexto(
                ruta=nota.ruta,
                titulo=nota.cierre.tema,
                contenido=nota.contenido,
                entidades=nota.entidades,
                razones=razones,
                puntaje=puntaje,
                tokens_estimados=tokens,
            )
        )
        refs_por_ruta[nota.ruta] = nota.app_refs

    candidatas.sort(key=lambda nota: (-nota.puntaje, nota.ruta))
    seleccionadas: list[NotaContexto] = []
    tokens_totales = 0
    for nota in candidatas:
        if len(seleccionadas) >= consulta.max_notas:
            break
        if tokens_totales + nota.tokens_estimados > consulta.max_tokens:
            break
        seleccionadas.append(nota)
        tokens_totales += nota.tokens_estimados

    app_refs = _sin_duplicados(
        referencia for nota in seleccionadas for referencia in refs_por_ruta[nota.ruta]
    )
    procedencia = [
        {"ruta": nota.ruta, "razones": list(nota.razones), "puntaje": nota.puntaje}
        for nota in seleccionadas
    ]
    confianza = min(1.0, seleccionadas[0].puntaje / 100) if seleccionadas else 0.0
    return PaqueteContexto(seleccionadas, app_refs, tokens_totales, procedencia, confianza)


def reindexar(vault: Path) -> dict[str, object]:
    """Reconstruye el índice exclusivamente desde cierres Markdown válidos."""
    vault = Path(vault)
    entidades: dict[str, list[dict[str, str]]] = {}
    ultima_actualizacion = ""
    cierres = list(_cierres_validados(vault))
    for nota in cierres:
        cierre = nota.cierre
        entrada_base = {
            "ruta": nota.ruta,
            "updated_at": cierre.fecha_cierre,
            "host": cierre.host,
            "thread_id": cierre.thread_id,
            "tema": cierre.tema,
            "estado": cierre.estado,
        }
        for clave, origen in claves_indice(cierre):
            entradas = entidades.setdefault(clave, [])
            entradas.append({**entrada_base, "origen": origen})
        ultima_actualizacion = max(ultima_actualizacion, cierre.fecha_cierre)

    for entradas in entidades.values():
        entradas.sort(key=lambda entrada: (entrada["updated_at"], entrada["ruta"]), reverse=True)
    indice: dict[str, object] = {"entidades": entidades}
    if ultima_actualizacion:
        indice["updated_at"] = ultima_actualizacion
    _escribir_indice(vault / _INDICE, indice)
    return {"ok": True, "cierres_indexados": len(cierres), "indice": _INDICE.as_posix()}


def _cierres_validados(vault: Path) -> list[_CierreLeido]:
    directorio = vault / _CIERRES
    if not directorio.is_dir():
        return []
    cierres: list[_CierreLeido] = []
    for ruta in sorted(directorio.rglob("*.md")):
        nota = _leer_cierre_validado(vault, ruta)
        if nota is not None:
            cierres.append(nota)
    return cierres


def _leer_cierre_validado(vault: Path, ruta: Path) -> _CierreLeido | None:
    try:
        frontmatter, cuerpo = _separar_markdown(ruta.read_text(encoding="utf-8"))
        entidades = _entidades_por_categoria(frontmatter.get("entidades", []))
        datos = dict(frontmatter)
        datos["entidades"] = [
            entidad for valores in entidades.values() for entidad in valores
        ]
        datos.update(_listas_del_cierre(cuerpo))
        cierre = validar_cierre(datos)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return None

    _, cuerpo_redactado = _separar_markdown(cierre_a_markdown(cierre))
    contenido = _contenido_contexto(cierre, cuerpo_redactado)
    return _CierreLeido(
        cierre=cierre,
        ruta=ruta.relative_to(vault).as_posix(),
        entidades=entidades,
        contenido=contenido,
        cuerpo=cuerpo_redactado,
        app_refs=_referencias_app(cierre.enlaces, cuerpo_redactado),
    )


def _separar_markdown(texto: str) -> tuple[dict[str, object], str]:
    if not texto.startswith("---\n"):
        raise ValueError("El cierre no tiene frontmatter.")
    final = texto.find("\n---\n", 4)
    if final < 0:
        raise ValueError("El cierre no cierra el frontmatter.")
    datos: dict[str, object] = {}
    for linea in texto[4:final].splitlines():
        clave, separador, valor = linea.partition(":")
        if not separador or not clave.strip():
            raise ValueError("Frontmatter inválido.")
        datos[clave.strip()] = _valor_frontmatter(valor.strip())
    return datos, texto[final + 5 :]


def _valor_frontmatter(valor: str) -> object:
    if valor.startswith(("[", "{", '"')):
        return json.loads(valor)
    return valor


def _entidades_por_categoria(valor: object) -> dict[str, list[str]]:
    if isinstance(valor, list) and all(isinstance(item, str) for item in valor):
        return {"obras": list(valor)}
    if isinstance(valor, dict) and all(
        isinstance(clave, str)
        and isinstance(items, list)
        and all(isinstance(item, str) for item in items)
        for clave, items in valor.items()
    ):
        return {clave: list(items) for clave, items in valor.items()}
    raise ValueError("Las entidades del cierre son inválidas.")


def _contenido_contexto(cierre: Cierre, cuerpo: str) -> str:
    secciones = [linea for linea in cuerpo.splitlines() if linea != "- Sin registros."]
    contenido = f"# {cierre.tema}\n" + "\n".join(secciones).strip()
    return contenido.rstrip() + "\n"


def _listas_del_cierre(cuerpo: str) -> dict[str, list[str]]:
    """Recupera las siete listas canónicas para validar el Markdown leído."""
    listas = {campo: [] for campo in _SECCIONES_CIERRE.values()}
    actual: str | None = None
    vistos: set[str] = set()
    for linea in cuerpo.splitlines():
        if linea.startswith("## "):
            actual = _SECCIONES_CIERRE.get(linea[3:])
            if actual is None or actual in vistos:
                raise ValueError("El cierre contiene secciones no canónicas o repetidas.")
            vistos.add(actual)
            continue
        if actual is None or not linea:
            continue
        if not linea.startswith("- "):
            raise ValueError("El cuerpo del cierre no respeta el formato canónico.")
        valor = linea[2:]
        if valor != "Sin registros.":
            listas[actual].append(valor)
    if vistos != set(listas):
        raise ValueError("El cierre no contiene todas las secciones canónicas.")
    return listas


def _puntuar(
    nota: _CierreLeido,
    entidades_consulta: set[str],
    tokens_consulta: set[str],
    vecinos: set[str],
) -> tuple[float, list[str]]:
    puntaje = 0.0
    razones: list[str] = []
    entidades = [valor for valores in nota.entidades.values() for valor in valores]
    entidades_normalizadas = {_normalizar(valor): valor for valor in entidades}
    exactas = sorted(entidades_consulta.intersection(entidades_normalizadas))
    for entidad in exactas:
        puntaje += 100
        razones.append(f"entidad_exacta:{entidades_normalizadas[entidad]}")

    tokens_entidad = _tokens(" ".join(entidades))
    for token in sorted(tokens_consulta.intersection(tokens_entidad)):
        puntaje += 40
        razones.append(f"token_entidad:{token}")
    for token in sorted(tokens_consulta.intersection(_tokens(nota.cierre.tema))):
        puntaje += 20
        razones.append(f"token_titulo:{token}")
    cuerpo_tokens = _tokens(nota.cuerpo)
    for token in sorted(tokens_consulta.intersection(cuerpo_tokens)):
        puntaje += 5
        razones.append(f"token_cuerpo:{token}")
    if nota.cierre.estado == "parcial":
        puntaje += 10
        razones.append("estado_parcial")
    for entidad in sorted(set(entidades_normalizadas).intersection(vecinos)):
        puntaje += 15
        razones.append(f"vecino_graphify:{entidades_normalizadas[entidad]}")

    if razones:
        descuento = _descuento_antiguedad(nota.cierre.fecha_cierre)
        if descuento:
            puntaje -= descuento
            razones.append(f"antiguedad:-{descuento:g}")
    return puntaje, razones


def _descuento_antiguedad(fecha: str) -> float:
    try:
        cierre = datetime.fromisoformat(fecha.replace("Z", "+00:00"))
    except ValueError:
        return 0.0
    if cierre.tzinfo is None:
        cierre = cierre.replace(tzinfo=timezone.utc)
    dias = max(0.0, (datetime.now(timezone.utc) - cierre.astimezone(timezone.utc)).total_seconds() / 86400)
    return min(20.0, dias * 0.05)


def _vecinos_graphify(vault: Path, entidades_consulta: set[str]) -> set[str]:
    if not entidades_consulta:
        return set()
    grafo = next((vault / ruta for ruta in _GRAFOS if (vault / ruta).is_file()), None)
    if grafo is None:
        return set()
    try:
        datos = json.loads(grafo.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return set()
    nodos = datos.get("nodes", datos.get("nodos", [])) if isinstance(datos, dict) else []
    aristas = datos.get("links", datos.get("edges", datos.get("aristas", []))) if isinstance(datos, dict) else []
    if not isinstance(nodos, list) or not isinstance(aristas, list):
        return set()
    nombres: dict[str, str] = {}
    for nodo in nodos:
        if isinstance(nodo, dict):
            identificador = nodo.get("id")
            nombre = nodo.get("label", nodo.get("name", nodo.get("titulo", identificador)))
            if isinstance(identificador, (str, int)) and isinstance(nombre, str):
                nombres[str(identificador)] = _normalizar(nombre)
    vecinos: set[str] = set()
    for arista in aristas:
        if not isinstance(arista, dict):
            continue
        origen = str(arista.get("source", arista.get("origen", "")))
        destino = str(arista.get("target", arista.get("destino", "")))
        origen_nombre = nombres.get(origen, _normalizar(origen))
        destino_nombre = nombres.get(destino, _normalizar(destino))
        if origen_nombre in entidades_consulta:
            vecinos.add(destino_nombre)
        if destino_nombre in entidades_consulta:
            vecinos.add(origen_nombre)
    return vecinos


def _referencias_app(enlaces: list[str], cuerpo: str) -> list[str]:
    candidatas = list(enlaces) + re.findall(r"\[[^]]*\]\(([^)]+)\)", cuerpo)
    return _sin_duplicados(
        referencia for referencia in candidatas if referencia.startswith(("app://", "/"))
    )


def _escribir_indice(destino: Path, indice: dict[str, object]) -> None:
    with _bloquear_indice(destino.parent):
        destino.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=destino.parent, delete=False
        ) as archivo:
            temporal = Path(archivo.name)
            json.dump(indice, archivo, ensure_ascii=False, indent=2)
            archivo.write("\n")
            archivo.flush()
            os.fsync(archivo.fileno())
        try:
            os.replace(temporal, destino)
        except Exception:
            temporal.unlink(missing_ok=True)
            raise


def _estimar_tokens(texto: str) -> int:
    return ceil(len(texto) / 4)


def _tokens(texto: str) -> set[str]:
    return {_normalizar(token) for token in _TOKEN.findall(texto) if token}


def _normalizar(texto: str) -> str:
    import unicodedata

    sin_acentos = "".join(
        caracter
        for caracter in unicodedata.normalize("NFKD", texto)
        if not unicodedata.combining(caracter)
    )
    return " ".join(sin_acentos.casefold().split())


def _sin_duplicados(valores: Any) -> list[str]:
    vistos: set[str] = set()
    resultado: list[str] = []
    for valor in valores:
        if valor not in vistos:
            vistos.add(valor)
            resultado.append(valor)
    return resultado
