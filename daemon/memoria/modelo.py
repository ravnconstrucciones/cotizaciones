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
_HEADER_KEYS = frozenset(
    clave.casefold()
    for clave in ("Authorization", "Proxy-Authorization", "Cookie", "Set-Cookie")
)
_QUOTED_KEY = r'''(?:"(?:\\.|[^"\\\r\n])*"|'(?:''|[^'\r\n])*')'''
_QUOTED_TOKEN = re.compile(_QUOTED_KEY)
_SAFE_REDACTION = "[CONTENIDO SENSIBLE REDACTADO]"
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
    rf"(?im)(?P<delimiter>^|[{{\[,]|[ \t])(?P<indent>[ \t]*)(?P<item>-\s*)?"
    rf"(?P<key>{_QUOTED_KEY}|{_HEADER_KEY})(?P<separator>[ \t]*:[ \t]*)"
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
    ocurrencias = _buscar_encabezados_sensibles(texto)
    texto, ocurrencias_manejadas = _redactar_encabezados(texto)
    if not ocurrencias.issubset(ocurrencias_manejadas):
        return _SAFE_REDACTION
    for patron in SECRET_PATTERNS:
        texto = re.sub(patron, _reemplazar_secreto, texto)
    return texto


def _decodificar_clave_candidata(clave: str) -> str | None:
    """Decodifica sólo el token de clave; nunca modifica el documento fuente."""
    if not clave or clave[0] not in "\"'":
        return clave
    if clave[0] == "'":
        return clave[1:-1].replace("''", "'")
    return _decodificar_clave_double_quoted(clave[1:-1])


def _decodificar_clave_double_quoted(contenido: str) -> str | None:
    escapes_simples = {
        '"': '"',
        "\\": "\\",
        "/": "/",
        "0": "\0",
        "a": "\a",
        "b": "\b",
        "t": "\t",
        "n": "\n",
        "v": "\v",
        "f": "\f",
        "r": "\r",
        "e": "\x1b",
        " ": " ",
        "N": "\x85",
        "_": "\xa0",
        "L": "\u2028",
        "P": "\u2029",
    }
    partes: list[str] = []
    posicion = 0

    while posicion < len(contenido):
        if contenido[posicion] != "\\":
            partes.append(contenido[posicion])
            posicion += 1
            continue

        if posicion + 1 >= len(contenido):
            return None
        escape = contenido[posicion + 1]
        if escape in escapes_simples:
            partes.append(escapes_simples[escape])
            posicion += 2
            continue
        if escape not in "xuU":
            return None

        ancho = {"x": 2, "u": 4, "U": 8}[escape]
        inicio_hex = posicion + 2
        fin_hex = inicio_hex + ancho
        if fin_hex > len(contenido):
            return None
        digitos = contenido[inicio_hex:fin_hex]
        if any(caracter not in "0123456789abcdefABCDEF" for caracter in digitos):
            return None

        codigo = int(digitos, 16)
        posicion = fin_hex
        if escape == "u" and 0xD800 <= codigo <= 0xDBFF:
            if contenido[posicion : posicion + 2] != "\\u":
                return None
            fin_bajo = posicion + 6
            if fin_bajo > len(contenido):
                return None
            digitos_bajos = contenido[posicion + 2 : fin_bajo]
            if any(
                caracter not in "0123456789abcdefABCDEF"
                for caracter in digitos_bajos
            ):
                return None
            codigo_bajo = int(digitos_bajos, 16)
            if not 0xDC00 <= codigo_bajo <= 0xDFFF:
                return None
            codigo = (
                0x10000
                + ((codigo - 0xD800) << 10)
                + (codigo_bajo - 0xDC00)
            )
            posicion = fin_bajo
        elif 0xD800 <= codigo <= 0xDFFF:
            return None
        if codigo > 0x10FFFF:
            return None
        partes.append(chr(codigo))

    return "".join(partes)


def _buscar_encabezados_sensibles(texto: str) -> set[tuple[int, int]]:
    """Ubica todo nombre de header sensible en el texto fuente sin inferir YAML."""
    ocurrencias: set[tuple[int, int]] = set()
    posicion = 0

    while posicion < len(texto):
        if texto[posicion] in "\"'":
            coincidencia = _QUOTED_TOKEN.match(texto, posicion)
            if coincidencia is not None:
                token = coincidencia.group(0)
                decodificado = _decodificar_clave_candidata(token)
                if decodificado is not None and _contiene_header_sensible(
                    decodificado
                ):
                    ocurrencias.add(coincidencia.span())
                posicion = coincidencia.end()
                continue

        if _es_caracter_token_header(texto[posicion]):
            fin = posicion + 1
            while fin < len(texto) and _es_caracter_token_header(texto[fin]):
                fin += 1
            if texto[posicion:fin].casefold() in _HEADER_KEYS:
                ocurrencias.add((posicion, fin))
            posicion = fin
            continue

        posicion += 1

    return ocurrencias


def _contiene_header_sensible(texto: str) -> bool:
    posicion = 0
    while posicion < len(texto):
        if not _es_caracter_token_header(texto[posicion]):
            posicion += 1
            continue
        fin = posicion + 1
        while fin < len(texto) and _es_caracter_token_header(texto[fin]):
            fin += 1
        if texto[posicion:fin].casefold() in _HEADER_KEYS:
            return True
        posicion = fin
    return False


def _es_caracter_token_header(caracter: str) -> bool:
    return caracter.isascii() and (caracter.isalnum() or caracter in "_-")


def _redactar_encabezados(
    texto: str,
) -> tuple[str, set[tuple[int, int]]]:
    """Redacta valores de headers en YAML/JSON sin cortar por comas internas."""
    partes: list[str] = []
    ocurrencias_manejadas: set[tuple[int, int]] = set()
    inicio_pendiente = 0
    posicion_busqueda = 0

    while coincidencia := _HEADER_FIELD.search(texto, posicion_busqueda):
        posicion_busqueda = coincidencia.end()
        clave = _decodificar_clave_candidata(coincidencia.group("key"))
        if clave is None or clave.casefold() not in _HEADER_KEYS:
            continue
        if coincidencia.group("delimiter") in " \t" and _tiene_decorador_yaml(
            texto, coincidencia.start("delimiter")
        ):
            continue
        ocurrencias_manejadas.add(coincidencia.span("key"))

        inicio_valor = coincidencia.end()
        partes.append(texto[inicio_pendiente:inicio_valor])

        if inicio_valor >= len(texto):
            inicio_pendiente = inicio_valor
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
            inicio_pendiente = inicio_valor + len("[REDACTADO]")
            posicion_busqueda = inicio_pendiente
            continue

        if valor.startswith(("\"", "'")):
            comilla = valor[0]
            fin = _fin_valor_entre_comillas(texto, inicio_valor, comilla)
            if fin is not None:
                partes.extend((comilla, "[REDACTADO]", comilla))
                inicio_pendiente = fin + 1
                posicion_busqueda = inicio_pendiente
                continue
            if not es_flow:
                inicio_cuerpo, salto = _inicio_linea_siguiente(texto, fin_linea)
                fin_cuerpo = _fin_escalar_por_indentacion(
                    texto, inicio_cuerpo, indentacion_clave
                )
                partes.append("[REDACTADO]")
                if salto and fin_cuerpo < len(texto):
                    partes.append(salto)
                inicio_pendiente = fin_cuerpo
                posicion_busqueda = inicio_pendiente
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
            inicio_pendiente = fin_cuerpo
            posicion_busqueda = inicio_pendiente
            continue

        if (
            not es_flow
            and coincidencia.group("item") is None
            and clave.casefold() == "authorization"
            and valor.lower().startswith("bearer ")
        ):
            inicio_token = inicio_valor + len("Bearer ")
            if texto.startswith("[REDACTADO]", inicio_token):
                partes.append(texto[inicio_valor:inicio_token])
                partes.append("[REDACTADO]")
                inicio_pendiente = inicio_token + len("[REDACTADO]")
                posicion_busqueda = inicio_pendiente
                continue
            fin_token = inicio_token
            while fin_token < len(texto) and texto[fin_token] not in " \t\r\n,}]":
                fin_token += 1
            partes.append(texto[inicio_valor:inicio_token])
            partes.append("[REDACTADO]")
            inicio_pendiente = fin_token
            posicion_busqueda = inicio_pendiente
            continue

        fin_valor = (
            _fin_valor_flow(texto, inicio_valor)
            if es_flow
            else _fin_linea(texto, inicio_valor)
        )
        partes.append("[REDACTADO]")
        inicio_pendiente = fin_valor
        posicion_busqueda = inicio_pendiente

    partes.append(texto[inicio_pendiente:])
    return "".join(partes), ocurrencias_manejadas


def _tiene_decorador_yaml(texto: str, fin_prefijo: int) -> bool:
    inicio_linea = max(
        texto.rfind("\n", 0, fin_prefijo),
        texto.rfind("\r", 0, fin_prefijo),
    ) + 1
    prefijo = texto[inicio_linea:fin_prefijo].rstrip(" \t")
    if not prefijo:
        return False
    token_anterior = prefijo.rsplit(maxsplit=1)[-1].lstrip("{[,")
    return token_anterior.startswith(("?", "&", "*", "!"))


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
