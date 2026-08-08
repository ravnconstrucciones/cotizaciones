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
    r"(?i)(Authorization:\s*Bearer\s+)(?!\[REDACTADO\])[^\s,}\]]+",
    rf"(?i)((?:[\"']{_SENSITIVE_KEY}[\"']\s*:\s*)([\"']))(?:\\.|(?!\2)[^\r\n])*\2",
    rf"(?i)((?:\b{_SENSITIVE_KEY}\s*:\s*)([\"']))(?:\\.|(?!\2)[^\r\n])*\2",
    rf"(?i)(\b{_SENSITIVE_KEY}\s*[:=]\s*)(?![\"']\[REDACTADO\][\"'])(?:\"(?:\\.|[^\"\\\r\n])*\"|'(?:\\.|[^'\\\r\n])*'|[^\s\r\n]+)",
)

_HEADER_FIELD = re.compile(
    rf"(?im)(?P<delimiter>^|[{{\[,])(?P<indent>[ \t]*)(?P<item>-\s*)?"
    rf"(?P<key>[\"']{_HEADER_KEY}[\"']|{_HEADER_KEY})(?P<separator>[ \t]*:[ \t]*)"
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
    texto = _normalizar_escapes_unicode_json(texto)
    texto = _redactar_encabezados(texto)
    for patron in SECRET_PATTERNS:
        texto = re.sub(patron, _reemplazar_secreto, texto)
    return texto


def _normalizar_escapes_unicode_json(texto: str) -> str:
    """Decodifica escapes Unicode JSON válidos antes de clasificar sus claves."""
    partes: list[str] = []
    posicion = 0

    while posicion < len(texto):
        if not _es_escape_unicode_json(texto, posicion):
            partes.append(texto[posicion])
            posicion += 1
            continue

        unidad = int(texto[posicion + 2 : posicion + 6], 16)
        if 0xD800 <= unidad <= 0xDBFF:
            siguiente = posicion + 6
            if _es_escape_unicode_json(texto, siguiente):
                unidad_baja = int(texto[siguiente + 2 : siguiente + 6], 16)
                if 0xDC00 <= unidad_baja <= 0xDFFF:
                    codigo = (
                        0x10000
                        + ((unidad - 0xD800) << 10)
                        + (unidad_baja - 0xDC00)
                    )
                    partes.append(chr(codigo))
                    posicion = siguiente + 6
                    continue
            partes.append(texto[posicion : posicion + 6])
            posicion += 6
            continue

        if 0xDC00 <= unidad <= 0xDFFF:
            partes.append(texto[posicion : posicion + 6])
        else:
            partes.append(chr(unidad))
        posicion += 6

    return "".join(partes)


def _es_escape_unicode_json(texto: str, posicion: int) -> bool:
    if posicion + 6 > len(texto) or texto[posicion : posicion + 2] != "\\u":
        return False
    barras_previas = 0
    anterior = posicion - 1
    while anterior >= 0 and texto[anterior] == "\\":
        barras_previas += 1
        anterior -= 1
    if barras_previas % 2:
        return False
    return all(
        caracter in "0123456789abcdefABCDEF"
        for caracter in texto[posicion + 2 : posicion + 6]
    )


def _redactar_encabezados(texto: str) -> str:
    """Redacta valores de headers en YAML/JSON sin cortar por comas internas."""
    partes: list[str] = []
    posicion = 0

    while coincidencia := _HEADER_FIELD.search(texto, posicion):
        inicio_valor = coincidencia.end()
        partes.append(texto[posicion:inicio_valor])

        if inicio_valor >= len(texto):
            posicion = inicio_valor
            continue

        delimitador = coincidencia.group("delimiter")
        es_flow = bool(delimitador) and delimitador in "{[,"
        valor = texto[inicio_valor:]
        indentacion_clave = _ancho_indentacion(coincidencia.group("indent"))
        if coincidencia.group("item") is not None:
            indentacion_clave += _ancho_indentacion(coincidencia.group("item"))
        fin_linea = _fin_linea(texto, inicio_valor)

        if valor.startswith("[REDACTADO]"):
            partes.append("[REDACTADO]")
            posicion = inicio_valor + len("[REDACTADO]")
            continue

        if valor.startswith(("\"", "'")):
            comilla = valor[0]
            fin = _fin_valor_entre_comillas(texto, inicio_valor, comilla)
            if fin is not None:
                partes.extend((comilla, "[REDACTADO]", comilla))
                posicion = fin + 1
                continue
            if not es_flow:
                inicio_cuerpo, salto = _inicio_linea_siguiente(texto, fin_linea)
                fin_cuerpo = _fin_escalar_por_indentacion(
                    texto, inicio_cuerpo, indentacion_clave
                )
                partes.append("[REDACTADO]")
                if salto and fin_cuerpo < len(texto):
                    partes.append(salto)
                posicion = fin_cuerpo
                continue

        if not es_flow and _es_indicador_escalar_bloque(
            texto[inicio_valor:fin_linea]
        ):
            inicio_cuerpo, salto = _inicio_linea_siguiente(texto, fin_linea)
            fin_cuerpo = _fin_escalar_por_indentacion(
                texto, inicio_cuerpo, indentacion_clave
            )
            partes.append("[REDACTADO]")
            if salto and fin_cuerpo < len(texto):
                partes.append(salto)
            posicion = fin_cuerpo
            continue

        if (
            not es_flow
            and coincidencia.group("item") is None
            and coincidencia.group("key").lower() == "authorization"
            and valor.lower().startswith("bearer ")
        ):
            inicio_token = inicio_valor + len("Bearer ")
            if texto.startswith("[REDACTADO]", inicio_token):
                partes.append(texto[inicio_valor:inicio_token])
                partes.append("[REDACTADO]")
                posicion = inicio_token + len("[REDACTADO]")
                continue
            fin_token = inicio_token
            while fin_token < len(texto) and texto[fin_token] not in " \t\r\n,}]":
                fin_token += 1
            partes.append(texto[inicio_valor:inicio_token])
            partes.append("[REDACTADO]")
            posicion = fin_token
            continue

        fin_valor = (
            _fin_valor_flow(texto, inicio_valor)
            if es_flow
            else _fin_linea(texto, inicio_valor)
        )
        partes.append("[REDACTADO]")
        posicion = fin_valor

    partes.append(texto[posicion:])
    return "".join(partes)


def _fin_valor_entre_comillas(texto: str, inicio: int, comilla: str) -> int | None:
    posicion = inicio + 1
    while posicion < len(texto):
        caracter = texto[posicion]
        if caracter == "\\":
            posicion += 2
            continue
        if caracter == comilla:
            if comilla == "'" and posicion + 1 < len(texto) and texto[posicion + 1] == "'":
                posicion += 2
                continue
            return posicion
        posicion += 1
    return None


def _fin_valor_flow(texto: str, inicio: int) -> int:
    posicion = inicio
    anidados: list[str] = []
    while posicion < len(texto):
        caracter = texto[posicion]
        if caracter in "\"'":
            fin = _fin_valor_entre_comillas(texto, posicion, caracter)
            if fin is None:
                return len(texto)
            posicion = fin + 1
            continue
        if caracter in "[{":
            anidados.append("]" if caracter == "[" else "}")
            posicion += 1
            continue
        if caracter in "]}":
            if anidados and caracter == anidados[-1]:
                anidados.pop()
                posicion += 1
                continue
            if anidados:
                posicion += 1
                continue
            return posicion
        if (
            caracter == ","
            and not anidados
            and _comienza_campo_flow(texto, posicion + 1)
        ):
            return posicion
        posicion += 1
    return posicion


def _comienza_campo_flow(texto: str, inicio: int) -> bool:
    posicion = inicio
    while posicion < len(texto) and texto[posicion].isspace():
        posicion += 1
    if posicion >= len(texto):
        return False

    if texto[posicion] in "\"'":
        fin = _fin_valor_entre_comillas(texto, posicion, texto[posicion])
        if fin is None:
            return False
        posicion = fin + 1
        while posicion < len(texto) and texto[posicion].isspace():
            posicion += 1
        return posicion < len(texto) and texto[posicion] == ":"

    fin = posicion
    while fin < len(texto) and texto[fin] not in ":,{}[]\r\n":
        fin += 1
    if fin >= len(texto) or texto[fin] != ":":
        return False
    clave = texto[posicion:fin].strip()
    return _es_clave_flow_simple(clave)


def _es_clave_flow_simple(clave: str) -> bool:
    if not clave:
        return False
    if clave[0] in "-?:,[]{}#&*!|>'\"%@`":
        return False
    if any(
        caracter in "=,[]{}\r\n" or not caracter.isprintable()
        for caracter in clave
    ):
        return False
    return True


def _es_indicador_escalar_bloque(valor: str) -> bool:
    indicador = valor.strip()
    if not indicador or indicador[0] not in "|>":
        return False
    sufijo = indicador[1:].split("#", 1)[0].strip()
    if len(sufijo) > 2 or any(caracter not in "+-123456789" for caracter in sufijo):
        return False
    return sum(caracter in "+-" for caracter in sufijo) <= 1 and sum(
        caracter.isdigit() for caracter in sufijo
    ) <= 1


def _inicio_linea_siguiente(texto: str, fin_linea: int) -> tuple[int, str]:
    if texto.startswith("\r\n", fin_linea):
        return fin_linea + 2, "\r\n"
    if fin_linea < len(texto) and texto[fin_linea] in "\r\n":
        return fin_linea + 1, texto[fin_linea]
    return fin_linea, ""


def _fin_escalar_por_indentacion(texto: str, inicio: int, base: int) -> int:
    posicion = inicio
    while posicion < len(texto):
        fin = _fin_linea(texto, posicion)
        linea = texto[posicion:fin]
        if linea.strip():
            prefijo = linea[: len(linea) - len(linea.lstrip(" \t"))]
            if _ancho_indentacion(prefijo) <= base:
                return posicion
        siguiente, _ = _inicio_linea_siguiente(texto, fin)
        if siguiente == fin:
            return len(texto)
        posicion = siguiente
    return posicion


def _ancho_indentacion(valor: str) -> int:
    return len(valor.expandtabs(8))


def _fin_linea(texto: str, inicio: int) -> int:
    finales = [
        posicion
        for posicion in (texto.find("\r", inicio), texto.find("\n", inicio))
        if posicion >= 0
    ]
    return min(finales, default=len(texto))


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
