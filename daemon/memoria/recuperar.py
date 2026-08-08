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


@dataclass(frozen=True)
class PaqueteContexto:
    notas: list[NotaContexto]
    app_refs: list[str]
    tokens_estimados: int
    procedencia: list[str]
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

    candidatas: list[tuple[float, NotaContexto]] = []
    refs_por_ruta: dict[str, list[str]] = {}
    puntajes_por_ruta: dict[str, float] = {}
    for nota in _cierres_validados(vault):
        puntaje, razones = _puntuar(nota, entidades_consulta, tokens_consulta, vecinos)
        if not razones:
            continue
        candidata = NotaContexto(
            ruta=nota.ruta,
            titulo=nota.cierre.tema,
            contenido=nota.contenido,
            entidades=nota.entidades,
            razones=razones,
        )
        candidatas.append((puntaje, candidata))
        refs_por_ruta[nota.ruta] = nota.app_refs
        puntajes_por_ruta[nota.ruta] = puntaje

    candidatas.sort(key=lambda candidata: (-candidata[0], candidata[1].ruta))
    paquete_vacio = _construir_paquete([], refs_por_ruta, puntajes_por_ruta)
    if paquete_vacio.tokens_estimados > consulta.max_tokens:
        raise ValueError("El presupuesto no alcanza para serializar un paquete de contexto vacío.")

    seleccionadas: list[NotaContexto] = []
    for _, nota in candidatas:
        if len(seleccionadas) >= consulta.max_notas:
            break
        candidato = _construir_paquete(
            [*seleccionadas, nota], refs_por_ruta, puntajes_por_ruta
        )
        if candidato.tokens_estimados <= consulta.max_tokens:
            seleccionadas.append(nota)
    return _construir_paquete(seleccionadas, refs_por_ruta, puntajes_por_ruta)


def reindexar(vault: Path) -> dict[str, object]:
    """Reconstruye el índice exclusivamente desde cierres Markdown válidos."""
    vault = Path(vault)
    destino = vault / _INDICE
    with _bloquear_indice(destino.parent):
        return _reindexar_bajo_lock(vault, destino)


def _reindexar_bajo_lock(vault: Path, destino: Path) -> dict[str, object]:
    """Escanea y publica mientras retiene el lock cooperativo del índice."""
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
    _escribir_indice_bajo_lock(destino, indice)
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
        datos = dict(frontmatter)
        datos["entidades"] = _lista_entidades(frontmatter.get("entidades", []))
        datos.update(_listas_del_cierre(cuerpo))
        cierre = validar_cierre(datos)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return None

    _, cuerpo_redactado = _separar_markdown(cierre_a_markdown(cierre))
    contenido = _contenido_contexto(cierre, cuerpo_redactado)
    return _CierreLeido(
        cierre=cierre,
        ruta=ruta.relative_to(vault).as_posix(),
        entidades={"obras": list(cierre.entidades)},
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


def _lista_entidades(valor: object) -> list[str]:
    if isinstance(valor, list) and all(isinstance(item, str) for item in valor):
        return list(valor)
    if isinstance(valor, dict) and all(
        isinstance(clave, str)
        and isinstance(items, list)
        and all(isinstance(item, str) for item in items)
        for clave, items in valor.items()
    ):
        return [entidad for items in valor.values() for entidad in items]
    raise ValueError("Las entidades del cierre son inválidas.")


def _contenido_contexto(cierre: Cierre, cuerpo: str) -> str:
    del cuerpo  # El contenido se reconstruye desde el cierre ya validado y redactado.
    lineas: list[str] = []
    for titulo, campo in _SECCIONES_CIERRE.items():
        valores = getattr(cierre, campo)
        if valores:
            lineas.append(f"## {titulo}")
            lineas.extend("- " + valor.replace("\n", "\n  ") for valor in valores)
    return "\n".join(lineas).rstrip() + "\n"


def _listas_del_cierre(cuerpo: str) -> dict[str, list[str]]:
    """Recupera las siete listas canónicas para validar el Markdown leído."""
    listas = {campo: [] for campo in _SECCIONES_CIERRE.values()}
    actual: str | None = None
    vistos: set[str] = set()
    for linea in cuerpo.splitlines():
        if linea.startswith("  "):
            if actual is None or not listas[actual]:
                raise ValueError("La continuación no pertenece a un bullet canónico.")
            listas[actual][-1] += f"\n{linea[2:]}"
            continue
        if linea.startswith("## "):
            siguiente = _SECCIONES_CIERRE.get(linea[3:])
            if siguiente is None or siguiente in vistos:
                raise ValueError("El cierre contiene secciones no canónicas o repetidas.")
            actual = siguiente
            vistos.add(actual)
            continue
        if not linea:
            continue
        if actual is None:
            raise ValueError("El cuerpo del cierre no respeta el formato canónico.")
        if linea.startswith("- "):
            valor = linea[2:]
            if valor != "Sin registros.":
                listas[actual].append(valor)
            continue
        raise ValueError("El cuerpo del cierre no respeta el formato canónico.")
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
        razones.append(f"entidad:{entidades_normalizadas[entidad]}")

    tokens_entidad = _tokens(" ".join(entidades))
    for token in sorted(tokens_consulta.intersection(tokens_entidad)):
        puntaje += 40
        razones.append(f"entidad_token:{token}")
    for token in sorted(tokens_consulta.intersection(_tokens(nota.cierre.tema))):
        puntaje += 20
        razones.append(f"titulo:{token}")
    cuerpo_tokens = _tokens(nota.cuerpo)
    for token in sorted(tokens_consulta.intersection(cuerpo_tokens)):
        puntaje += 5
        razones.append(f"cuerpo:{token}")
    if nota.cierre.estado == "parcial":
        puntaje += 10
        razones.append("parcial")
    for entidad in sorted(set(entidades_normalizadas).intersection(vecinos)):
        puntaje += 15
        razones.append(f"vecino:{entidades_normalizadas[entidad]}")

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


def _escribir_indice_bajo_lock(destino: Path, indice: dict[str, object]) -> None:
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


def _construir_paquete(
    notas: list[NotaContexto],
    refs_por_ruta: dict[str, list[str]],
    puntajes_por_ruta: dict[str, float],
) -> PaqueteContexto:
    app_refs = _sin_duplicados(
        referencia for nota in notas for referencia in refs_por_ruta[nota.ruta]
    )
    procedencia = ["cierre"] if notas else []
    confianza = min(1.0, puntajes_por_ruta[notas[0].ruta] / 100) if notas else 0.0
    estimados = 0
    for _ in range(10):
        paquete = PaqueteContexto(notas, app_refs, estimados, procedencia, confianza)
        siguiente = _estimar_json(paquete.a_dict())
        if siguiente == estimados:
            return paquete
        estimados = siguiente
    raise RuntimeError("No se pudo estabilizar la estimación del paquete de contexto.")


def _estimar_tokens(texto: str) -> int:
    return ceil(len(texto) / 4)


def _estimar_json(datos: dict[str, object]) -> int:
    return _estimar_tokens(json.dumps(datos, ensure_ascii=False))


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
