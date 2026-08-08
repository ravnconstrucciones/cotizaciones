"""Contrato canónico para los intercambios de memoria entre hosts."""

from __future__ import annotations

from dataclasses import dataclass
import json
import re
from typing import Any


HOSTS = {"codex", "claude"}
ESTADOS = {"completo", "parcial", "bloqueado"}
SENSIBILIDADES = {"normal", "restringida"}
SECRET_PATTERNS = (
    r"(?i)(SUPABASE_SERVICE_ROLE_KEY\s*=\s*)[^\s]+",
    r"(?i)(ANTHROPIC_API_KEY\s*=\s*)[^\s]+",
    r"(?i)(OPENAI_API_KEY\s*=\s*)[^\s]+",
    r"(?i)(Authorization:\s*Bearer\s+)[A-Za-z0-9._-]+",
)

_CAMPO_TEXTO = (
    "id",
    "host",
    "thread_id",
    "fecha_inicio",
    "fecha_cierre",
    "tema",
    "estado",
    "fuente_cruda",
    "sensibilidad",
)
_CAMPO_LISTA = (
    "entidades",
    "hechos",
    "decisiones",
    "metodos",
    "cambios",
    "pendientes",
    "separaciones",
    "enlaces",
)
_FRONTMATTER = (
    "id",
    "host",
    "thread_id",
    "fecha_inicio",
    "fecha_cierre",
    "tema",
    "estado",
    "entidades",
    "fuente_cruda",
    "sensibilidad",
)
_SECCIONES = (
    ("Hechos confirmados", "hechos"),
    ("Decisiones", "decisiones"),
    ("Métodos reutilizables", "metodos"),
    ("Cambios realizados", "cambios"),
    ("Pendientes", "pendientes"),
    ("Separaciones de alcance", "separaciones"),
    ("Enlaces", "enlaces"),
)
_YAML_SIMPLE = re.compile(r"^[A-Za-z0-9_./-]+$")


@dataclass
class Mensaje:
    host: str
    thread_id: str
    timestamp: str
    autor: str
    tipo: str
    texto: str
    metadata: dict[str, Any]


@dataclass
class Cierre:
    id: str
    host: str
    thread_id: str
    fecha_inicio: str
    fecha_cierre: str
    tema: str
    estado: str
    entidades: list[str]
    hechos: list[str]
    decisiones: list[str]
    metodos: list[str]
    cambios: list[str]
    pendientes: list[str]
    separaciones: list[str]
    enlaces: list[str]
    fuente_cruda: str
    sensibilidad: str


def redactar_secretos(texto: str) -> str:
    """Reemplaza credenciales conocidas sin alterar el contexto restante."""
    for patron in SECRET_PATTERNS:
        texto = re.sub(patron, r"\1[REDACTADO]", texto)
    return texto


def validar_cierre(data: dict) -> Cierre:
    """Valida y normaliza un cierre recibido desde cualquiera de los hosts."""
    if not isinstance(data, dict):
        raise ValueError("El cierre debe ser un diccionario.")

    valores: dict[str, Any] = {}
    for campo in _CAMPO_TEXTO:
        valor = data.get(campo)
        if not isinstance(valor, str) or not valor.strip():
            raise ValueError(f"El campo '{campo}' es obligatorio y debe ser texto.")
        valores[campo] = redactar_secretos(valor.strip())

    if valores["host"] not in HOSTS:
        raise ValueError("Host no válido.")
    if valores["estado"] not in ESTADOS:
        raise ValueError("Estado no válido.")
    if valores["sensibilidad"] not in SENSIBILIDADES:
        raise ValueError("Sensibilidad no válida.")

    for campo in _CAMPO_LISTA:
        valor = data.get(campo)
        if not isinstance(valor, list) or not all(isinstance(item, str) for item in valor):
            raise ValueError(f"El campo '{campo}' debe ser una lista de textos.")
        valores[campo] = [redactar_secretos(item) for item in valor]

    return Cierre(**valores)


def cierre_a_markdown(cierre: Cierre) -> str:
    """Serializa un cierre a Markdown con frontmatter y orden estable."""
    lineas = ["---"]
    for campo in _FRONTMATTER:
        valor = getattr(cierre, campo)
        if isinstance(valor, list):
            contenido = json.dumps(
                [redactar_secretos(elemento) for elemento in valor], ensure_ascii=False
            )
        else:
            contenido = _yaml_valor(redactar_secretos(valor))
        lineas.append(f"{campo}: {contenido}")
    lineas.extend(["---", ""])

    for titulo, campo in _SECCIONES:
        lineas.extend([f"## {titulo}"])
        valores = getattr(cierre, campo)
        if valores:
            lineas.extend(f"- {redactar_secretos(valor)}" for valor in valores)
        else:
            lineas.append("- Sin registros.")
        lineas.append("")

    return "\n".join(lineas).rstrip() + "\n"


def _yaml_valor(valor: str) -> str:
    if _YAML_SIMPLE.fullmatch(valor):
        return valor
    return json.dumps(valor, ensure_ascii=False)
