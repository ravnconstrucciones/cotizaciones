"""Contrato canónico para los intercambios de memoria entre hosts."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import json
import re
from typing import Any


HOSTS = {"codex", "claude"}
ESTADOS = {"completo", "parcial", "bloqueado"}
SENSIBILIDADES = {"normal", "restringida"}
TIPOS_ENTIDAD = ("obras", "clientes", "cotizaciones", "documentos")
_SENSITIVE_KEY = (
    r"(?:[A-Za-z][A-Za-z0-9_-]*?(?:API[_-]?KEY|TOKEN|SECRET(?:[_-]?KEY)?|"
    r"PASSWORD|PASSWD|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|CLIENT[_-]?SECRET(?:[_-]?KEY)?)|"
    r"API[_-]?KEY|TOKEN|SECRET(?:[_-]?KEY)?|PASSWORD|PASSWD|PRIVATE[_-]?KEY|"
    r"ACCESS[_-]?KEY|CLIENT[_-]?SECRET(?:[_-]?KEY)?|DATABASE_(?:URL|URI)|REDIS_URL|"
    r"CONNECTION_STRING|ENCRYPTION_KEY|SIGNING_KEY)"
)
_HEADER_KEY = r"(?:Authorization|Proxy-Authorization|Cookie|Set-Cookie)"
SECRET_PATTERNS = (
    r"(?i)(SUPABASE_SERVICE_ROLE_KEY\s*=\s*)[^\s]+",
    r"(?i)(ANTHROPIC_API_KEY\s*=\s*)[^\s]+",
    r"(?i)(OPENAI_API_KEY\s*=\s*)[^\s]+",
    r"(?i)(Authorization:\s*Bearer\s+)\S+",
    r"(?im)(^\s*(?:Set-)?Cookie\s*:\s*)[^\r\n]+",
    rf"(?i)((?:[\"']{_SENSITIVE_KEY}[\"']\s*:\s*)([\"']))(?:\\.|(?!\2)[^\r\n])*\2",
    rf"(?i)((?:\b{_SENSITIVE_KEY}\s*:\s*)([\"']))(?:\\.|(?!\2)[^\r\n])*\2",
    rf"(?i)(\b{_SENSITIVE_KEY}\s*[:=]\s*)(?![\"']\[REDACTADO\][\"'])(?:\"(?:\\.|[^\"\\\r\n])*\"|'(?:\\.|[^'\\\r\n])*'|[^\s\r\n]+)",
    rf"(?i)((?:[\"']{_HEADER_KEY}[\"']\s*:\s*)([\"']))(?:\\.|(?!\2)[^\r\n])*\2",
    rf"(?im)^(\s*[\"']{_HEADER_KEY}[\"']\s*:\s*)[^\r\n]+",
    r"(?im)(^\s*(?:Authorization|Proxy-Authorization)\s*:\s*)(?!\s*Bearer\s+\[REDACTADO\])[^\r\n]+",
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
    entidades: dict[str, list[str]]
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
        texto = re.sub(patron, _reemplazar_secreto, texto)
    return texto


def _reemplazar_secreto(coincidencia: re.Match[str]) -> str:
    if coincidencia.re.groups >= 2 and coincidencia.group(2) is not None:
        return f"{coincidencia.group(1)}[REDACTADO]{coincidencia.group(2)}"
    return f"{coincidencia.group(1)}[REDACTADO]"


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
    for campo in ("fecha_inicio", "fecha_cierre"):
        validar_timestamp_iso8601(valores[campo], campo=campo)

    entidades = data.get("entidades")
    if not isinstance(entidades, dict) or set(entidades) != set(TIPOS_ENTIDAD):
        raise ValueError(
            "El campo 'entidades' debe tener exactamente obras, clientes, "
            "cotizaciones y documentos."
        )
    if not all(
        isinstance(entidades[tipo], list)
        and all(isinstance(item, str) for item in entidades[tipo])
        for tipo in TIPOS_ENTIDAD
    ):
        raise ValueError("Cada tipo de entidad debe ser una lista de textos.")
    valores["entidades"] = {
        tipo: [redactar_secretos(item) for item in entidades[tipo]]
        for tipo in TIPOS_ENTIDAD
    }

    for campo in _CAMPO_LISTA:
        valor = data.get(campo)
        if not isinstance(valor, list) or not all(isinstance(item, str) for item in valor):
            raise ValueError(f"El campo '{campo}' debe ser una lista de textos.")
        valores[campo] = [redactar_secretos(item) for item in valor]

    return Cierre(**valores)


def validar_timestamp_iso8601(valor: str, *, campo: str = "timestamp") -> datetime:
    """Acepta únicamente timestamps ISO-8601 completos y calendáricamente válidos."""
    if "T" not in valor:
        raise ValueError(f"El campo '{campo}' debe ser un timestamp ISO-8601.")
    try:
        return datetime.fromisoformat(valor.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"El campo '{campo}' debe ser un timestamp ISO-8601 válido.") from error


def cierre_a_markdown(cierre: Cierre) -> str:
    """Serializa un cierre a Markdown con frontmatter y orden estable."""
    lineas = ["---"]
    for campo in _FRONTMATTER:
        valor = getattr(cierre, campo)
        if isinstance(valor, dict):
            contenido = json.dumps(
                {
                    tipo: [redactar_secretos(elemento) for elemento in valor.get(tipo, [])]
                    for tipo in TIPOS_ENTIDAD
                },
                ensure_ascii=False,
            )
        elif isinstance(valor, list):
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
            lineas.extend(_elemento_markdown(valor) for valor in valores)
        else:
            lineas.append("- Sin registros.")
        lineas.append("")

    return "\n".join(lineas).rstrip() + "\n"


def _elemento_markdown(valor: str) -> str:
    """Marca continuaciones para que el parser pueda distinguirlas de Markdown."""
    lineas = redactar_secretos(valor).split("\n")
    return "- " + lineas[0] + "".join(f"\n  {linea}" for linea in lineas[1:])


def _yaml_valor(valor: str) -> str:
    if _YAML_SIMPLE.fullmatch(valor):
        return valor
    return json.dumps(valor, ensure_ascii=False)
